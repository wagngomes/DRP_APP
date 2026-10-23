/**
 * Detecção de eventos de ruptura.
 *
 * Um **evento** é uma sequência de snapshots consecutivos em que a posição
 * item × CD esteve sem estoque disponível tendo forecast. Não é uma linha por
 * dia: "rompeu em 03/09 e voltou em 11/09" responde tudo que oito linhas
 * diárias responderiam, e é o que a tela mostra.
 *
 * O módulo só lê. Nenhuma base existente é alterada, nenhuma consulta de outra
 * tela é tocada.
 *
 * **O que conta como ruptura** vem de `parametros.ts`: estoque nos armazéns de
 * venda ≤ 0 com `forecast_m0 > 0` e torre mandando considerar. Q40 e RC ficam
 * de fora da disponibilidade de propósito — estoque retido é causa, não
 * ausência de ruptura.
 */
import { prisma } from "@/lib/prisma";
import { simuladorPorCd } from "@/utils/cds-virtuais";
import { torreValidaSql } from "@/utils/dias-estoque";
import {
  COLUNAS_DISPONIVEL,
  COLUNAS_DOACAO,
  COLUNAS_RETIDO,
  SANIDADE,
} from "./parametros";

const soma = (colunas: readonly string[], alias: string) =>
  `(${colunas.map((c) => `COALESCE(${alias}.${c},0)`).join(" + ")})`;

const DISPONIVEL = soma(COLUNAS_DISPONIVEL, "s");
const RETIDO = soma(COLUNAS_RETIDO, "s");
const DOAVEL = soma(COLUNAS_DOACAO, "s");

/** A posição num dia, como o motor a enxerga. */
export type PosicaoDia = {
  data: string;
  codigo: string;
  filial: string;
  /** Soma dos armazéns de venda. */
  disponivel: number;
  /** Q40 e RC: existe no CD, não vende. */
  retido: number;
  /**
   * O que este CD pode doar numa transferência — só o armazém 01.
   *
   * Mais estreito que `disponivel` de propósito: o que está no 26 ou no NAC
   * conta como estoque do CD e não sai dele numa transferência.
   */
  doavel: number;
  emTransito: number;
  forecastMensal: number;
  /** Dias de cobertura que a política pede na abertura do mês. */
  politica: number;
  rompida: boolean;
};

/** Um evento fechado ou em aberto. */
export type Evento = {
  codigo: string;
  filial: string;
  inicio: string;
  /** Nulo enquanto a ruptura dura. */
  fim: string | null;
  /** Dias corridos entre início e fim, ou até a data de referência. */
  dias: number;
  /** Quantos snapshots da janela confirmaram a ruptura. */
  snapshots: number;
  valorPerdido: number;
  /** A posição tinha estoque preso em Q40/RC durante a ruptura. */
  tinhaRetido: boolean;
  /**
   * A ruptura já corria quando a janela começou.
   *
   * Verdadeiro quando o **primeiro dia medido** da posição na janela já estava
   * rompido: nunca a vimos com estoque, então `inicio` é o limite do que se
   * enxerga e não a data em que a prateleira esvaziou. `dias` e `valorPerdido`
   * viram piso.
   */
  comecouAntes: boolean;
};

/**
 * Cargas que não passam no teste de sanidade e não podem gerar diagnóstico.
 *
 * Devolvida junto com as posições para o motor marcar a lacuna em vez de
 * tratar o dia como "sem ruptura" — que é o que aconteceria se simplesmente
 * pulássemos a data.
 */
export type CargaSuspeita = {
  data: string;
  motivo: "forecast-sem-codigo" | "quase-tudo-rompido";
  detalhe: string;
};

/**
 * Lê as posições de todos os snapshots da janela, em uma consulta.
 *
 * Uma consulta e não uma por dia: são ~5.700 posições por snapshot, e perguntar
 * por dia multiplica a ida ao banco por treze sem trazer nada novo. O volume
 * medido para 60 dias é da ordem de 130 mil linhas — cabe em memória, e é o
 * mesmo porte do que a importação diária já carrega.
 */
export async function carregarPosicoes(
  de: string,
  ate: string,
  /**
   * Data de referência: é o mês dela que define o forecast de toda a janela.
   *
   * Uma resolução para a janela inteira, e não uma por dia. A versão anterior
   * resolvia o snapshot mensal dia a dia e, nos primeiros dias do mês, não
   * achava nada — a primeira carga de forecast de setembro é do dia 4. A
   * posição simplesmente não existia em 01, 02 e 03, e a ruptura que começou
   * no dia 1º aparecia começando no dia 4.
   *
   * O efeito era grande e silencioso: o replay dizia 11 dias, o evento dizia 7,
   * e a divergência parecia defeito do replay. Era do evento.
   */
  dataReferencia: string = ate,
): Promise<PosicaoDia[]> {
  const linhas = await prisma.$queryRawUnsafe<
    {
      data: Date;
      codigo: string;
      filial: string;
      disponivel: number;
      retido: number;
      doavel: number;
      transito: number;
      forecast: number;
      politica: number;
    }[]
  >(
    // O forecast de cada dia é o da carga mensal vigente naquele dia — a mesma
    // regra que todas as telas usam, via `snapshotMensalSql`. Sem isso, um dia
    // sem carga de forecast ficaria sem universo e sumiria do diagnóstico.
    `WITH dias AS (
       SELECT DISTINCT data_snapshot::date AS d
         FROM simulador
        WHERE data_snapshot >= $1::date AND data_snapshot <= $2::date
     )
     SELECT dias.d AS data,
            f.codigo,
            f.filial,
            COALESCE(sim.disponivel, 0)::float8 AS disponivel,
            COALESCE(sim.retido, 0)::float8     AS retido,
            COALESCE(sim.doavel, 0)::float8     AS doavel,
            COALESCE(sim.transito, 0)::float8   AS transito,
            f.forecast_m0::float8               AS forecast,
            COALESCE(f.politica, 0)::float8     AS politica
       FROM dias
       JOIN forecast f
         ON f.data_snapshot = (
              SELECT MAX(_f.data_snapshot) FROM forecast _f
               WHERE _f.data_snapshot >= date_trunc('month', $3::date)
                 AND _f.data_snapshot <= $3::date
                 AND _f.codigo IS NOT NULL
            )
        AND f.forecast_m0 > 0
        AND ${torreValidaSql("f")}
        AND f.filial IS NOT NULL
       LEFT JOIN LATERAL (
         SELECT ${DISPONIVEL}::float8 AS disponivel,
                ${RETIDO}::float8     AS retido,
                ${DOAVEL}::float8     AS doavel,
                COALESCE(s.total_trans, 0)::float8 AS transito
           FROM ${simuladorPorCd("s.data_snapshot = dias.d")} s
          WHERE s.codigo = f.codigo AND s.filial = f.filial
            AND s.data_snapshot = dias.d
          LIMIT 1
       ) sim ON TRUE
      ORDER BY f.codigo, f.filial, dias.d`,
    de,
    ate,
    dataReferencia,
  );

  return linhas.map((l) => ({
    data: l.data.toISOString().slice(0, 10),
    codigo: l.codigo,
    filial: l.filial,
    disponivel: l.disponivel,
    retido: l.retido,
    doavel: l.doavel,
    emTransito: l.transito,
    forecastMensal: l.forecast,
    politica: l.politica,
    rompida: l.disponivel <= 0,
  }));
}

/**
 * Cargas em que o dado não merece confiança.
 *
 * Duas perguntas, e as duas vêm de acidentes reais desta base. A primeira é
 * código nulo em massa, que a reimportação de Produtos já produziu: as linhas
 * existem, o forecast existe, e nada casa com o simulador — toda posição vira
 * ruptura. A segunda é o sintoma, não a causa: quando quase tudo rompeu num
 * dia, a hipótese mais provável não é catástrofe operacional, é carga ruim.
 */
export function cargasSuspeitas(posicoes: PosicaoDia[]): CargaSuspeita[] {
  const porDia = new Map<string, { total: number; rompidas: number }>();
  for (const p of posicoes) {
    const d = porDia.get(p.data) ?? { total: 0, rompidas: 0 };
    d.total += 1;
    if (p.rompida) d.rompidas += 1;
    porDia.set(p.data, d);
  }

  const suspeitas: CargaSuspeita[] = [];
  for (const [data, d] of porDia) {
    const fracao = d.total > 0 ? d.rompidas / d.total : 0;
    if (fracao > SANIDADE.maxRompidasNoDia) {
      suspeitas.push({
        data,
        motivo: "quase-tudo-rompido",
        detalhe: `${d.rompidas} de ${d.total} posições rompidas (${Math.round(fracao * 100)}%)`,
      });
    }
  }
  return suspeitas.sort((a, b) => a.data.localeCompare(b.data));
}

/**
 * Agrupa as posições diárias em eventos.
 *
 * Um snapshot com estoque fecha o evento. **Dia sem snapshot não fecha**: a
 * ausência de carga não é prova de que o estoque voltou, e tratá-la como fim
 * partiria um evento de nove dias em três de três, multiplicando a contagem de
 * rupturas por uma falha de importação.
 *
 * `ate` é a data de referência, usada para medir os eventos que continuam
 * abertos — sem ela, uma ruptura em curso teria duração zero.
 */
export function montarEventos(
  posicoes: PosicaoDia[],
  ate: string,
  /**
   * Custo unitário por item, de `custoPorItem`.
   *
   * De fora, e não do simulador: `cmv_unitario_1` mente exatamente na posição
   * rompida, que é onde o motor precisa dele. Medido no snapshot de 11/09:
   * 3.015 das 3.123 posições rompidas têm `cmv_unitario` nulo, e 1.137 têm
   * `cmv_unitario_1` mais de três vezes acima do custo real de recebimento —
   * contra 13 entre as posições com estoque. Um item de R$ 13,44 aparecia a
   * R$ 1.482,83, e o valor perdido saía 110 vezes maior.
   */
  custos: Map<string, number> = new Map(),
  /** Cargas a ignorar: o dia existe, mas o dado dele não vale. */
  ignorar: Set<string> = new Set(),
): Evento[] {
  const porPosicao = new Map<string, PosicaoDia[]>();
  for (const p of posicoes) {
    if (ignorar.has(p.data)) continue;
    const chave = `${p.codigo}|${p.filial}`;
    const lista = porPosicao.get(chave);
    if (lista) lista.push(p);
    else porPosicao.set(chave, [p]);
  }

  const eventos: Evento[] = [];

  for (const lista of porPosicao.values()) {
    const dias = [...lista].sort((a, b) => a.data.localeCompare(b.data));
    let atual: PosicaoDia[] = [];

    const fechar = (fim: string | null) => {
      if (atual.length === 0) return;
      // Já rompida no primeiro dia medido: nunca a vimos com estoque, então o
      // início é o limite da janela e não a data em que a prateleira esvaziou.
      const comecouAntes = atual[0].data === dias[0].data;
      eventos.push(montarEvento(atual, fim, ate, custos, comecouAntes));
      atual = [];
    };

    for (const d of dias) {
      if (d.rompida) atual.push(d);
      else fechar(d.data);
    }
    // Sobrou sequência no fim da janela: a ruptura continua.
    fechar(null);
  }

  return eventos.sort(
    (a, b) =>
      a.inicio.localeCompare(b.inicio) ||
      a.codigo.localeCompare(b.codigo) ||
      a.filial.localeCompare(b.filial),
  );
}

function montarEvento(
  seq: PosicaoDia[],
  fim: string | null,
  ate: string,
  custos: Map<string, number>,
  comecouAntes: boolean,
): Evento {
  const primeiro = seq[0];
  // Aberto mede até a referência; fechado, até o dia em que o estoque voltou.
  const limite = fim ?? ate;
  const dias = Math.max(
    1,
    Math.round(
      (Date.parse(`${limite}T00:00:00Z`) -
        Date.parse(`${primeiro.data}T00:00:00Z`)) /
        86_400_000,
    ),
  );

  // O consumo diário é o do forecast, a mesma régua do resto do sistema.
  const consumoDiario = primeiro.forecastMensal / 30;
  const custo = custos.get(primeiro.codigo) ?? 0;

  return {
    codigo: primeiro.codigo,
    filial: primeiro.filial,
    inicio: primeiro.data,
    fim,
    dias,
    snapshots: seq.length,
    valorPerdido: dias * consumoDiario * custo,
    tinhaRetido: seq.some((d) => d.retido > 0),
    comecouAntes,
  };
}

/**
 * Custo unitário por item, a partir do que de fato foi pago.
 *
 * Vem de `recebimento` e não do simulador porque o campo do simulador mente
 * justamente onde o motor precisa dele. Conferido em dois itens: o custo médio
 * de recebimento devolve R$ 13,44 e R$ 0,41, exatamente o `cmv_unitario` que o
 * simulador mostra nos CDs **com** estoque — e nada parecido com os R$ 1.482,83
 * que ele mostra no CD rompido do mesmo item.
 *
 * Ponderado pela quantidade, não média das linhas: uma entrada de 10 mil
 * unidades e outra de 10 descrevem o custo em proporções diferentes.
 */
export async function custoPorItem(): Promise<Map<string, number>> {
  const linhas = await prisma.$queryRawUnsafe<
    { codigo: string; custo: number }[]
  >(
    `SELECT codigo, (SUM(custo) / SUM(quantidade))::float8 AS custo
       FROM recebimento
      WHERE codigo IS NOT NULL AND quantidade > 0 AND custo IS NOT NULL
      GROUP BY codigo
     HAVING SUM(quantidade) > 0`,
  );
  return new Map(linhas.map((l) => [l.codigo, l.custo]));
}

/**
 * Só o que está rompido na data de referência.
 *
 * O recorte é do negócio: a tela existe para explicar as rupturas de agora, na
 * reunião semanal. Uma ruptura que já se resolveu não tem ação pendente — ela
 * interessa como estatística, não como pauta.
 *
 * O evento continua medido desde o início: é isso que diz há quantos dias a
 * posição está parada e dá a janela para investigar a causa. O que o filtro
 * tira são os eventos que fecharam antes da referência.
 */
export function apenasEmRuptura(eventos: Evento[]): Evento[] {
  return eventos.filter((e) => e.fim === null);
}

/**
 * Quanto cada item tem de sobra na rede, para doar sem se comprometer.
 *
 * O limite não é escolhido aqui: vem do **Alvo** do Painel, o mesmo parâmetro
 * que a tela de sugestão de transferência usa. Duas réguas para a mesma
 * pergunta acabariam dizendo que cabia transferência onde a outra tela nunca
 * sugeriu — e a primeira versão disto usava o estoque bruto, contando como
 * disponível o que o CD doador precisava para si.
 *
 * Sobra de um CD = estoque − consumo diário × Alvo. Nunca negativa: CD que
 * está no limite não doa, mas também não "deve".
 *
 * Posição sem forecast entra com o estoque inteiro: sem previsão de consumo,
 * não há cobertura a preservar, e é exatamente o caso do estoque ocioso que o
 * balanceamento deveria pegar.
 */
export function sobraPorItem(
  posicoes: PosicaoDia[],
  data: string,
  alvoDias: number,
): Map<string, number> {
  const total = new Map<string, number>();
  for (const [codigo, cds] of sobraDetalhada(posicoes, data, alvoDias)) {
    total.set(
      codigo,
      cds.reduce((a, c) => a + c.sobra, 0),
    );
  }
  return total;
}

/** Quanto um CD tinha para doar, e o que ele guardou para si. */
export type SobraNoCd = {
  filial: string;
  /** Acima do Alvo: o que podia sair sem descobrir o próprio CD. */
  sobra: number;
  /** Estoque disponível no CD naquele dia. */
  disponivel: number;
  /** O que o Alvo manda reservar. Zero sem forecast. */
  reservado: number;
};

/**
 * Dias consecutivos abaixo do Gatilho imediatamente antes de zerar.
 *
 * A distinção que mais falta ao diagnóstico: **ruptura que caiu de uma vez** —
 * ninguém tinha como reagir — contra **ruptura que avisou e ninguém agiu**. Uma
 * é falha de planejamento, a outra é de execução, e o veredito da árvore é o
 * mesmo nas duas.
 *
 * Conta para trás a partir do dia anterior à ruptura, parando no primeiro dia
 * em que a cobertura estava acima do Gatilho. Só o trecho **imediatamente**
 * anterior: dias esparsos abaixo do Gatilho semanas antes não são aviso, são
 * história.
 *
 * Dia sem carga herda o estado do dia anterior, a mesma regra do
 * `rompidaPorDia` — um buraco de importação no meio do alerta não pode zerar a
 * contagem e absolver quem não agiu.
 *
 * `null` quando não há nenhum dia medido antes da ruptura: aí não se sabe, e
 * fingir zero diria "caiu de uma vez" sobre algo que ninguém observou.
 */
export function diasDeAviso(
  posicoes: PosicaoDia[],
  inicioDaRuptura: string,
  gatilhoDias: number,
): number | null {
  const antes = posicoes
    .filter((p) => p.data < inicioDaRuptura)
    .sort((a, b) => b.data.localeCompare(a.data));
  if (antes.length === 0) return null;

  // Já estava sem estoque no dia anterior: a ruptura não começou aqui, começou
  // antes da janela. Não há período de aviso a medir, e responder zero diria
  // "caiu de uma vez" sobre algo que já estava caído. Visto na tela: um item
  // zerado o mês inteiro aparecia com "14 dias abaixo do Gatilho antes de
  // zerar", contando como alerta ignorado os dias em que a prateleira já
  // estava vazia.
  const vespera = antes.find((p) => p.forecastMensal > 0);
  if (vespera && vespera.disponivel <= 0) return null;

  let dias = 0;
  let abaixo: boolean | null = null;
  for (const p of antes) {
    const consumoDiario = p.forecastMensal / 30;
    // Sem consumo não há cobertura a comparar: o dia herda o estado anterior.
    if (consumoDiario > 0) {
      // Aviso é estar **com estoque** abaixo do Gatilho. Dia zerado não é
      // aviso: é a ruptura, e contá-la como alerta inverteria o sentido.
      abaixo = p.disponivel > 0 && p.disponivel / consumoDiario < gatilhoDias;
    }
    if (abaixo === null) continue;
    if (!abaixo) break;
    dias += 1;
  }
  return abaixo === null ? null : dias;
}

/**
 * A sobra de cada dia da janela, por item e CD.
 *
 * Uma passada só sobre as posições, em vez de uma chamada de `sobraDetalhada`
 * por dia. Serve à pergunta "havia sobra **no dia em que a carga teria de ter
 * saído**", que é por posição e por data — e cada evento tem a sua, porque o
 * prazo de despacho depende do SLA do par de CDs.
 *
 * Olhar só o dia de referência, como a primeira versão fazia, respondia outra
 * coisa: se há sobra **hoje**, depois de a ruptura já ter acontecido.
 */
export function sobraPorDia(
  posicoes: PosicaoDia[],
  alvoDias: number,
): Map<string, Map<string, SobraNoCd[]>> {
  const porData = new Map<string, Map<string, SobraNoCd[]>>();

  for (const p of posicoes) {
    if (p.doavel <= 0) continue;
    const consumoDiario = p.forecastMensal / 30;
    const reservado = consumoDiario > 0 ? consumoDiario * alvoDias : 0;
    const sobra = Math.max(0, p.doavel - reservado);
    if (sobra <= 0) continue;

    const doDia = porData.get(p.data) ?? new Map<string, SobraNoCd[]>();
    const lista = doDia.get(p.codigo) ?? [];
    lista.push({
      filial: p.filial,
      sobra,
      disponivel: p.doavel,
      reservado,
    });
    doDia.set(p.codigo, lista);
    porData.set(p.data, doDia);
  }

  for (const doDia of porData.values()) {
    for (const lista of doDia.values()) lista.sort((a, b) => b.sobra - a.sobra);
  }
  return porData;
}

/**
 * A mesma sobra, aberta por CD.
 *
 * Existe porque "cabia transferência" não é acionável: a frase útil nomeia o
 * CD, a quantidade e o dia — *"o 1006 tinha 340 acima do Alvo em 02/09"*. O
 * total agregado dizia que havia estoque na rede em algum lugar, e quem lê
 * precisava ir procurar onde.
 *
 * Ordenada da maior sobra para a menor: o primeiro da lista é o doador que a
 * operação olharia primeiro.
 */
export function sobraDetalhada(
  posicoes: PosicaoDia[],
  data: string,
  alvoDias: number,
): Map<string, SobraNoCd[]> {
  const porItem = new Map<string, SobraNoCd[]>();

  for (const p of posicoes) {
    if (p.data !== data || p.disponivel <= 0) continue;
    const consumoDiario = p.forecastMensal / 30;
    const reservado = consumoDiario > 0 ? consumoDiario * alvoDias : 0;
    const sobra = Math.max(0, p.disponivel - reservado);
    if (sobra <= 0) continue;
    const lista = porItem.get(p.codigo);
    const entrada: SobraNoCd = {
      filial: p.filial,
      sobra,
      disponivel: p.disponivel,
      reservado,
    };
    if (lista) lista.push(entrada);
    else porItem.set(p.codigo, [entrada]);
  }

  for (const lista of porItem.values()) lista.sort((a, b) => b.sobra - a.sobra);
  return porItem;
}
