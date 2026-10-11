/**
 * A foto de abertura do mês, por posição.
 *
 * É o eixo que mais explica: medido na base, **86% das posições rompidas
 * abriram o mês zeradas (50%) ou abaixo da política (36%)**. Só 14% romperam
 * por algo que aconteceu dentro do mês. Diagnosticar ruptura sem olhar a
 * abertura é explicar o fim do filme.
 *
 * A data da foto não é escolha deste módulo: vem de `resolverAbertura`, que já
 * é a regra do sistema e distingue carga marcada de palpite. A distinção
 * importa porque uma carga quebrada feita cedo viraria a abertura em silêncio
 * — e por isso palpite limita a confiança do diagnóstico.
 *
 * Só lê. Não altera nenhuma base nem nenhuma consulta existente.
 */
import { prisma } from "@/lib/prisma";
import { lerConfiguracoes } from "@/lib/configuracao.server";
import { listarSnapshots } from "@/lib/snapshots";
import { resolverAbertura, type Abertura } from "@/utils/abertura-mes";
import { simuladorPorCd } from "@/utils/cds-virtuais";
import { snapshotMensalSql, torreValidaSql } from "@/utils/dias-estoque";
import { limitesDoMes } from "@/utils/mes";
import { COLUNAS_DISPONIVEL } from "./parametros";

const DISPONIVEL = `(${COLUNAS_DISPONIVEL.map((c) => `COALESCE(s.${c},0)`).join(" + ")})`;

/** Como uma posição estava quando o mês abriu. */
export type PosicaoAbertura = {
  codigo: string;
  filial: string;
  /** Estoque nos armazéns de venda na foto. */
  disponivel: number;
  /** Pedidos de compra e transferências já a caminho na foto. */
  aCaminho: number;
  /** Dias de cobertura que a política pede para o item abrir o mês. */
  politicaDias: number;
  /** Consumo diário do forecast do mês. */
  consumoDiario: number;
  /** Cobertura em dias na abertura, contando o que vinha. `null` sem forecast. */
  coberturaDias: number | null;
  /** O estoque de abertura ficou abaixo do que a política pedia. */
  abaixoDaPolitica: boolean;
};

/** A venda do mês anterior contra o que fora previsto para ele. */
export type MesAnterior = {
  codigo: string;
  filial: string;
  vendido: number;
  forecast: number;
  /** Realizado ÷ previsto; `null` sem previsão para comparar. */
  indice: number | null;
  /** Quanto se vendeu além do previsto — o estoque que não abriu este mês. */
  excedente: number;
};

export type FotoAbertura = {
  /** Data e origem da foto; origem "primeira-do-mes" é palpite. */
  marco: Abertura;
  posicoes: Map<string, PosicaoAbertura>;
  anterior: Map<string, MesAnterior>;
};

/** Chave das duas tabelas: item e CD. */
export const chave = (codigo: string, filial: string) => `${codigo}|${filial}`;

/**
 * Monta a foto de abertura do mês de uma data.
 *
 * Duas consultas e nenhuma por posição: são ~5.700 posições por snapshot, e
 * perguntar uma a uma é o padrão que já custou 23 segundos noutra tela desta
 * base.
 */
export async function carregarAbertura(
  /** Data de referência; o mês dela é o mês analisado. */
  data: string,
): Promise<FotoAbertura> {
  const mes = data.slice(0, 7);
  const [config, snapshots] = await Promise.all([
    lerConfiguracoes(),
    listarSnapshots("simulador"),
  ]);
  const marco = resolverAbertura(mes, config, snapshots);

  if (!marco.data) {
    return { marco, posicoes: new Map(), anterior: new Map() };
  }

  const [posicoes, anterior] = await Promise.all([
    posicoesNaAbertura(marco.data, data),
    vendaDoMesAnterior(data),
  ]);

  return { marco, posicoes, anterior };
}

/**
 * Estoque, política e o que já vinha a caminho na foto.
 *
 * O "a caminho" é o do próprio snapshot — `total_trans` para transferências e
 * as colunas de compra para pedidos. Sai da mesma linha que já traz o estoque,
 * sem join: é o que o simulador mede, e é o que a pessoa via naquele dia.
 *
 * **Duas datas, de propósito.** O estoque vem da foto de abertura; o forecast e
 * a política vêm da carga vigente do mês analisado. Parece inconsistente e não
 * é: no dia 1º ainda não existe carga de forecast daquele mês — a primeira de
 * setembro é do dia 4 —, e a carga anterior traz o M0 de *agosto*. Medir a
 * cobertura de setembro contra o forecast de agosto responderia outra pergunta.
 *
 * A primeira versão ancorava as duas na data da foto e devolvia zero posições,
 * em silêncio, porque o snapshot mensal não resolvia nada.
 */
async function posicoesNaAbertura(
  dataAbertura: string,
  /** Data de referência: é o mês dela que define qual forecast vale. */
  dataReferencia: string,
): Promise<Map<string, PosicaoAbertura>> {
  const linhas = await prisma.$queryRawUnsafe<
    {
      codigo: string;
      filial: string;
      disponivel: number;
      caminho: number;
      politica: number;
      forecast: number;
    }[]
  >(
    `SELECT f.codigo,
            f.filial,
            COALESCE(sim.disponivel, 0)::float8 AS disponivel,
            COALESCE(sim.caminho, 0)::float8    AS caminho,
            COALESCE(f.politica, 0)::float8     AS politica,
            f.forecast_m0::float8               AS forecast
       FROM forecast f
       LEFT JOIN LATERAL (
         SELECT ${DISPONIVEL}::float8 AS disponivel,
                (COALESCE(s.total_trans,0)
                 + COALESCE(s.compras_arm_01,0)
                 + COALESCE(s.compras_arm_26,0)
                 + COALESCE(s.compras_arm_nac,0))::float8 AS caminho
           FROM ${simuladorPorCd("s.data_snapshot = $1::date")} s
          WHERE s.codigo = f.codigo AND s.filial = f.filial
            AND s.data_snapshot = $1::date
          LIMIT 1
       ) sim ON TRUE
      WHERE ${snapshotMensalSql("forecast", "f", "$2")}
        AND f.forecast_m0 > 0
        AND ${torreValidaSql("f")}
        AND f.filial IS NOT NULL`,
    dataAbertura,
    dataReferencia,
  );

  const mapa = new Map<string, PosicaoAbertura>();
  for (const l of linhas) {
    const consumoDiario = l.forecast / 30;
    const total = l.disponivel + l.caminho;
    mapa.set(chave(l.codigo, l.filial), {
      codigo: l.codigo,
      filial: l.filial,
      disponivel: l.disponivel,
      aCaminho: l.caminho,
      politicaDias: l.politica,
      consumoDiario,
      coberturaDias: consumoDiario > 0 ? total / consumoDiario : null,
      // A política é dias de estoque ideal para abrir o mês, então a
      // comparação é contra o estoque de chão: o que está a caminho ainda não
      // abriu o mês, só vai cobrir o meio dele.
      abaixoDaPolitica:
        l.politica > 0 &&
        consumoDiario > 0 &&
        l.disponivel < consumoDiario * l.politica,
    });
  }
  return mapa;
}

/**
 * A venda do mês anterior contra o forecast daquele mês.
 *
 * Mede a causa mais profunda da abertura descoberta: o mês anterior vendeu
 * além do previsto e levou embora o estoque que abriria este. Quando as duas
 * falham, é esta que explica — a abertura fica só com o resto.
 *
 * Vem de `historico_vendas`, a nota, e não do `vendido_m0` do simulador. As
 * duas fontes divergem cerca de 20% por item, e a nota é a que o resto das
 * telas usa para falar de venda realizada.
 */
async function vendaDoMesAnterior(
  data: string,
): Promise<Map<string, MesAnterior>> {
  const [ano, mes] = data.slice(0, 7).split("-").map(Number);
  const anterior = new Date(Date.UTC(ano, mes - 2, 1)).toISOString().slice(0, 10);
  const { inicio, fim } = limitesDoMes(anterior);

  const linhas = await prisma.$queryRawUnsafe<
    { codigo: string; filial: string; vendido: number; forecast: number }[]
  >(
    // A venda tem filial, e é por ela que o cruzamento acontece. O forecast do
    // mês anterior é a última carga daquele mês — a mesma regra de
    // `snapshotMensalSql`, só que ancorada no fim do mês anterior.
    `WITH fc AS (
       SELECT codigo, filial, SUM(COALESCE(forecast_m0,0))::float8 AS forecast
         FROM forecast
        WHERE data_snapshot = (
                SELECT MAX(data_snapshot) FROM forecast
                 WHERE data_snapshot >= $1::date AND data_snapshot < $2::date
                   AND codigo IS NOT NULL
              )
          AND filial IS NOT NULL
        GROUP BY 1, 2
     ),
     venda AS (
       SELECT cod_prod AS codigo, filial, SUM(-quantidade)::float8 AS vendido
         FROM historico_vendas
        WHERE cod_prod IS NOT NULL AND filial IS NOT NULL
          AND data >= $1::date AND data < $2::date
        GROUP BY 1, 2
     )
     SELECT COALESCE(fc.codigo, venda.codigo) AS codigo,
            COALESCE(fc.filial, venda.filial) AS filial,
            COALESCE(venda.vendido, 0)        AS vendido,
            COALESCE(fc.forecast, 0)          AS forecast
       FROM fc
       FULL JOIN venda ON venda.codigo = fc.codigo AND venda.filial = fc.filial`,
    inicio,
    fim,
  );

  const mapa = new Map<string, MesAnterior>();
  for (const l of linhas) {
    mapa.set(chave(l.codigo, l.filial), {
      codigo: l.codigo,
      filial: l.filial,
      vendido: l.vendido,
      forecast: l.forecast,
      indice: l.forecast > 0 ? l.vendido / l.forecast : null,
      excedente: Math.max(0, l.vendido - l.forecast),
    });
  }
  return mapa;
}

/** Quando o forecast daquela posição apareceu. */
export type AberturaForecast = {
  codigo: string;
  filial: string;
  /** Carga em que o forecast passou a existir para esta posição. */
  data: string;
  /** Forecast que entrou. */
  forecast: number;
  /** A posição não existia na carga anterior, contra ter existido zerada. */
  linhaNova: boolean;
};

/**
 * Posições que ganharam forecast de uma carga para a outra.
 *
 * A comparação é com a **importação imediatamente anterior**, não com um
 * marco do mês: é assim que o fato acontece na operação — ontem aquele CD não
 * tinha previsão, hoje tem, e o item nasce rompido porque não houve prazo para
 * comprar nada.
 *
 * Duas formas do mesmo fato, distinguidas porque dizem coisas diferentes a
 * quem lê: a linha não existia (CD novo para o item) ou existia com zero
 * (o CD estava no cadastro e a previsão foi ligada).
 *
 * Só as cargas com código preenchido entram na comparação. Sem esse filtro, a
 * carga de 26/08 — 16.178 linhas de código nulo — faria *toda* posição parecer
 * uma abertura nova no dia seguinte.
 */
export async function aberturasDeForecast(
  /** Janela a examinar; normalmente os últimos dois meses. */
  de: string,
  ate: string,
): Promise<Map<string, AberturaForecast>> {
  const linhas = await prisma.$queryRawUnsafe<
    {
      codigo: string;
      filial: string;
      data: Date;
      forecast: number;
      linha_nova: boolean;
    }[]
  >(
    `WITH cargas AS (
       SELECT DISTINCT data_snapshot::date AS d
         FROM forecast
        WHERE codigo IS NOT NULL
          AND data_snapshot >= $1::date AND data_snapshot <= $2::date
     ),
     par AS (
       SELECT d, LAG(d) OVER (ORDER BY d) AS anterior FROM cargas
     ),
     -- Uma linha por posição e carga, já com o forecast da carga anterior ao
     -- lado. LEFT JOIN: posição que não existia antes vem com nulo, que é
     -- justamente o caso de "linha nova".
     passo AS (
       SELECT par.d,
              atual.codigo,
              atual.filial,
              atual.forecast_m0::float8 AS forecast,
              ant.forecast_m0::float8   AS forecast_antes,
              (ant.codigo IS NULL)      AS linha_nova
         FROM par
         JOIN forecast atual
           ON atual.data_snapshot = par.d AND atual.codigo IS NOT NULL
          AND atual.filial IS NOT NULL AND atual.forecast_m0 > 0
         LEFT JOIN forecast ant
           ON ant.data_snapshot = par.anterior
          AND ant.codigo = atual.codigo AND ant.filial = atual.filial
        WHERE par.anterior IS NOT NULL
     )
     SELECT DISTINCT ON (codigo, filial)
            codigo, filial, d AS data, forecast, linha_nova
       FROM passo
      WHERE COALESCE(forecast_antes, 0) = 0
      -- A abertura mais recente de cada posição: se o forecast foi ligado,
      -- desligado e ligado de novo, o que importa é a última vez.
      ORDER BY codigo, filial, d DESC`,
    de,
    ate,
  );

  const mapa = new Map<string, AberturaForecast>();
  for (const l of linhas) {
    mapa.set(chave(l.codigo, l.filial), {
      codigo: l.codigo,
      filial: l.filial,
      data: l.data.toISOString().slice(0, 10),
      forecast: l.forecast,
      linhaNova: l.linha_nova,
    });
  }
  return mapa;
}
