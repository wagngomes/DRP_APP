/**
 * A série diária de uma posição, para o gráfico de dente de serra.
 *
 * O estoque caindo pelo consumo e subindo a cada entrada, as faixas em que a
 * prateleira ficou vazia, a linha da política e a venda real contra a prevista
 * — o desenho que os livros de MRP usam para explicar reposição, aplicado a um
 * item × CD de verdade.
 *
 * **Recortada a uma posição**, e carregada só quando alguém abre a linha. Os
 * módulos da rodada carregam a janela inteira para todas as posições porque
 * precisam; aqui são quatro consultas por índice, de uma posição só, e o custo
 * é de milissegundos. Carregar tudo para desenhar um gráfico seria o padrão
 * que já custou 23 segundos noutra tela desta base.
 *
 * Só lê.
 */
import { prisma } from "@/lib/prisma";
import { simuladorPorCd } from "@/utils/cds-virtuais";
import { torreValidaSql } from "@/utils/dias-estoque";
import { COLUNAS_DISPONIVEL } from "./parametros";

const DISPONIVEL = `(${COLUNAS_DISPONIVEL.map((c) => `COALESCE(s.${c},0)`).join(" + ")})`;

/** Um dia da janela. */
export type PontoSerie = {
  data: string;
  /** Estoque disponível para venda. `null` em dia sem carga do simulador. */
  estoque: number | null;
  /** Venda realizada no dia, pela nota. */
  venda: number;
};

/** Uma entrada, de compra ou de transferência. */
export type ChegadaSerie = {
  data: string;
  quantidade: number;
  tipo: "compra" | "transferencia";
};

/** Um marco do ciclo do pedido, para a régua abaixo do gráfico. */
export type MarcoPedido = {
  data: string;
  tipo: "emitido" | "prometido";
  rotulo: string;
  quantidade: number;
};

/** Forecast contra venda, por mês da janela. */
export type MesDaSerie = {
  mes: string;
  previsto: number;
  real: number;
};

export type SerieItem = {
  de: string;
  ate: string;
  pontos: PontoSerie[];
  chegadas: ChegadaSerie[];
  marcos: MarcoPedido[];
  meses: MesDaSerie[];
  /** Estoque mínimo que a política pede, em unidades. */
  politicaUnidades: number;
  politicaDias: number;
  consumoDiario: number;
  forecastMensal: number;
};

/**
 * Monta a série de uma posição.
 *
 * As quatro consultas são independentes e vão juntas. Nenhuma varre a janela
 * inteira da base: todas filtram por `codigo` e `filial`, que são as colunas
 * dos índices existentes.
 */
export async function carregarSerie(
  codigo: string,
  filial: string,
  de: string,
  ate: string,
  /** Data de referência: é o mês dela que define qual forecast vale. */
  dataReferencia: string,
): Promise<SerieItem> {
  const [estoques, vendas, compras, transferencias, pedidos] =
    await Promise.all([
      estoqueDiario(codigo, filial, de, ate, dataReferencia),
      vendaDiaria(codigo, filial, de, ate),
      chegadasDeCompra(codigo, filial, de, ate),
      chegadasDeTransferencia(codigo, filial, de, ate),
      marcosDoPedido(codigo, filial, de, ate),
    ]);

  const vendaDe = new Map(vendas.map((v) => [v.data, v.quantidade]));
  const estoqueDe = new Map(estoques.linhas.map((e) => [e.data, e.estoque]));

  // Um ponto por dia corrido, e não por snapshot: o eixo do tempo precisa ser
  // regular para a inclinação da reta significar velocidade de consumo. Dia
  // sem carga fica com estoque nulo, e o desenho atravessa o buraco em vez de
  // fingir um degrau que não houve.
  const pontos: PontoSerie[] = [];
  for (let d = new Date(`${de}T00:00:00Z`); ; d.setUTCDate(d.getUTCDate() + 1)) {
    const data = d.toISOString().slice(0, 10);
    if (data > ate) break;
    pontos.push({
      data,
      estoque: estoqueDe.get(data) ?? null,
      venda: vendaDe.get(data) ?? 0,
    });
  }

  const forecastMensal = estoques.forecastMensal;
  const consumoDiario = forecastMensal / 30;

  return {
    de,
    ate,
    pontos,
    chegadas: [...compras, ...transferencias].sort((a, b) =>
      a.data.localeCompare(b.data),
    ),
    marcos: pedidos,
    meses: mesesDaJanela(pontos, consumoDiario),
    politicaDias: estoques.politicaDias,
    politicaUnidades: consumoDiario * estoques.politicaDias,
    consumoDiario,
    forecastMensal,
  };
}

/**
 * Forecast contra venda, mês a mês.
 *
 * O previsto de um mês parcial é proporcional aos dias que a janela cobre
 * dele: comparar nove dias de venda com o forecast de trinta diria que a venda
 * desabou em todo item, todo mês.
 */
export function mesesDaJanela(
  pontos: PontoSerie[],
  consumoDiario: number,
): MesDaSerie[] {
  const porMes = new Map<string, { real: number; dias: number }>();
  for (const p of pontos) {
    const mes = p.data.slice(0, 7);
    const atual = porMes.get(mes) ?? { real: 0, dias: 0 };
    atual.real += p.venda;
    atual.dias += 1;
    porMes.set(mes, atual);
  }
  return [...porMes.entries()]
    .map(([mes, { real, dias }]) => ({
      mes,
      real,
      previsto: consumoDiario * dias,
    }))
    .sort((a, b) => a.mes.localeCompare(b.mes));
}

/**
 * Estoque disponível por dia de carga, mais a política e o forecast vigentes.
 *
 * Mesma regra do resto do motor: o forecast é o da carga mensal da data de
 * referência, uma resolução para a janela inteira. Resolver dia a dia faria a
 * posição sumir nos primeiros dias do mês, porque a primeira carga de forecast
 * de setembro é do dia 4.
 */
async function estoqueDiario(
  codigo: string,
  filial: string,
  de: string,
  ate: string,
  dataReferencia: string,
): Promise<{
  linhas: { data: string; estoque: number }[];
  politicaDias: number;
  forecastMensal: number;
}> {
  const linhas = await prisma.$queryRawUnsafe<
    { data: Date; estoque: number; politica: number; forecast: number }[]
  >(
    `WITH dias AS (
       SELECT DISTINCT data_snapshot::date AS d
         FROM simulador
        WHERE data_snapshot >= $3::date AND data_snapshot <= $4::date
     ),
     fc AS (
       SELECT COALESCE(politica, 0)::float8 AS politica,
              forecast_m0::float8           AS forecast
         FROM forecast f
        WHERE f.codigo = $1 AND f.filial = $2
          AND f.data_snapshot = (
                SELECT MAX(_f.data_snapshot) FROM forecast _f
                 WHERE _f.data_snapshot >= date_trunc('month', $5::date)
                   AND _f.data_snapshot <= $5::date
                   AND _f.codigo IS NOT NULL
              )
          AND ${torreValidaSql("f")}
        LIMIT 1
     )
     SELECT dias.d AS data,
            COALESCE(sim.disponivel, 0)::float8 AS estoque,
            COALESCE((SELECT politica FROM fc), 0)::float8 AS politica,
            COALESCE((SELECT forecast FROM fc), 0)::float8 AS forecast
       FROM dias
       LEFT JOIN LATERAL (
         SELECT ${DISPONIVEL}::float8 AS disponivel
           FROM ${simuladorPorCd("s.data_snapshot = dias.d")} s
          WHERE s.codigo = $1 AND s.filial = $2
            AND s.data_snapshot = dias.d
          LIMIT 1
       ) sim ON TRUE
      ORDER BY dias.d`,
    codigo,
    filial,
    de,
    ate,
    dataReferencia,
  );

  return {
    linhas: linhas.map((l) => ({
      data: l.data.toISOString().slice(0, 10),
      estoque: l.estoque,
    })),
    politicaDias: linhas[0]?.politica ?? 0,
    forecastMensal: linhas[0]?.forecast ?? 0,
  };
}

/** Venda diária pela nota, a mesma fonte do raio-X e da aceleração. */
async function vendaDiaria(
  codigo: string,
  filial: string,
  de: string,
  ate: string,
): Promise<{ data: string; quantidade: number }[]> {
  const linhas = await prisma.$queryRawUnsafe<{ data: Date; qtd: number }[]>(
    `SELECT data::date AS data, SUM(-quantidade)::float8 AS qtd
       FROM historico_vendas
      WHERE cod_prod = $1 AND filial = $2
        AND data >= $3::date AND data <= $4::date
      GROUP BY 1
      ORDER BY 1`,
    codigo,
    filial,
    de,
    ate,
  );
  return linhas.map((l) => ({
    data: l.data.toISOString().slice(0, 10),
    quantidade: l.qtd,
  }));
}

async function chegadasDeCompra(
  codigo: string,
  filial: string,
  de: string,
  ate: string,
): Promise<ChegadaSerie[]> {
  const linhas = await prisma.$queryRawUnsafe<{ data: Date; qtd: number }[]>(
    `SELECT data::date AS data, SUM(quantidade)::float8 AS qtd
       FROM recebimento
      WHERE codigo = $1 AND filial = $2 AND quantidade > 0
        AND data >= $3::date AND data <= $4::date
      GROUP BY 1`,
    codigo,
    filial,
    de,
    ate,
  );
  return linhas.map((l) => ({
    data: l.data.toISOString().slice(0, 10),
    quantidade: l.qtd,
    tipo: "compra" as const,
  }));
}

/**
 * Entradas de transferência, deduzidas pelo dia em que a nota some da carga.
 *
 * Mesma dedução de `janela.ts`, e com a mesma escolha deliberada: a chegada é
 * datada no **snapshot anterior ao sumiço**. Entre a última carga em que a nota
 * aparece e a primeira em que não aparece, o que se sabe é que ela entrou nesse
 * intervalo — escolher a ponta de baixo erra para menos quando há buraco de
 * importação; a de cima inventaria atraso de logística onde houve falha de
 * carga.
 */
async function chegadasDeTransferencia(
  codigo: string,
  filial: string,
  de: string,
  ate: string,
): Promise<ChegadaSerie[]> {
  const linhas = await prisma.$queryRawUnsafe<{ data: Date; qtd: number }[]>(
    `WITH cargas AS (
       SELECT DISTINCT data_snapshot::date AS d
         FROM transferencias_abertas
        WHERE data_snapshot >= $3::date AND data_snapshot <= $4::date
     ),
     par AS (SELECT d, LEAD(d) OVER (ORDER BY d) AS proxima FROM cargas),
     notas AS (
       SELECT t.data_snapshot::date AS d, t.numero_nf_saida,
              SUM(t.qtde)::float8 AS qtd
         FROM transferencias_abertas t
        WHERE t.codigo = $1 AND t.filial_codigo_entrada = $2
          AND t.data_snapshot >= $3::date AND t.data_snapshot <= $4::date
          AND t.numero_nf_saida IS NOT NULL
        GROUP BY 1, 2
     )
     SELECT n.d AS data, SUM(n.qtd)::float8 AS qtd
       FROM notas n
       JOIN par ON par.d = n.d
      WHERE par.proxima IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM transferencias_abertas t2
           WHERE t2.data_snapshot::date = par.proxima
             AND t2.numero_nf_saida = n.numero_nf_saida
             AND t2.codigo = $1
             AND t2.filial_codigo_entrada = $2
        )
      GROUP BY 1`,
    codigo,
    filial,
    de,
    ate,
  );
  return linhas.map((l) => ({
    data: l.data.toISOString().slice(0, 10),
    quantidade: l.qtd,
    tipo: "transferencia" as const,
  }));
}

/**
 * Os marcos do ciclo de compra: quando o pedido saiu e para quando foi
 * prometido.
 *
 * A promessa é a `data_pedra`, que é a data que a operação usa — não
 * `data_entrega`, que é a do sistema de origem e diverge dela.
 *
 * O CD é `rota_final` com queda para `filial`, a mesma regra de
 * `pedidosDoCiclo`: pedido triangulado é colocado numa filial e entregue
 * noutra, e quem rompeu foi o destino.
 */
async function marcosDoPedido(
  codigo: string,
  filial: string,
  de: string,
  ate: string,
): Promise<MarcoPedido[]> {
  const linhas = await prisma.$queryRawUnsafe<
    {
      num_pedido: string | null;
      emitido: Date | null;
      pedra: Date | null;
      qtd: number;
    }[]
  >(
    `SELECT num_pedido,
            MIN(data_emissao)::date AS emitido,
            MIN(data_pedra)::date   AS pedra,
            SUM(COALESCE(quantidade_total, 0))::float8 AS qtd
       FROM pedidos_de_compra
      WHERE codigo = $1
        AND COALESCE(NULLIF(trim(rota_final), ''), filial) = $2
        AND data_snapshot = (
              SELECT MAX(data_snapshot) FROM pedidos_de_compra
               WHERE data_snapshot <= $4::date
            )
        AND data_emissao >= $3::date AND data_emissao <= $4::date
      GROUP BY 1`,
    codigo,
    filial,
    de,
    ate,
  );

  const marcos: MarcoPedido[] = [];
  for (const l of linhas) {
    const pedido = l.num_pedido ? `nº ${l.num_pedido}` : "pedido";
    if (l.emitido) {
      marcos.push({
        data: l.emitido.toISOString().slice(0, 10),
        tipo: "emitido",
        rotulo: `emitido · ${pedido}`,
        quantidade: l.qtd,
      });
    }
    // A promessa só entra quando cai dentro da janela desenhada; fora dela o
    // marcador ficaria colado na borda, dizendo uma data que não é a dele.
    const pedra = l.pedra?.toISOString().slice(0, 10);
    if (pedra && pedra >= de && pedra <= ate) {
      marcos.push({
        data: pedra,
        tipo: "prometido",
        rotulo: `prometido · ${pedido}`,
        quantidade: l.qtd,
      });
    }
  }
  return marcos.sort((a, b) => a.data.localeCompare(b.data));
}
