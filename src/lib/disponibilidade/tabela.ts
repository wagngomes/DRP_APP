import { prisma } from "@/lib/prisma";
import { joinFornecedor, nomeFornecedor } from "@/lib/fornecedor";
import { simuladorPorCd } from "@/utils/cds-virtuais";
import {
  COLUNAS_ESTOQUE_CHAO,
  COLUNAS_ESTOQUE_TOTAL,
  COLUNAS_VENDIDO_M0,
  DIAS_NO_MES,
  COLUNA_CIA,
  faixaDe,
  faixaSql,
  snapshotMensalSql,
  somaSql,
  torreValidaSql,
  type FaixaId,
} from "@/utils/dias-estoque";

/**
 * A grade item × CD, no formato de tabela periódica.
 *
 * Cada célula é uma posição, com os quatro números que o desenho pede: dias de
 * chão em destaque, quantidade embaixo, cobertura total no canto e o quanto do
 * forecast já saiu.
 *
 * **O laboratório é obrigatório, e não é preguiça de paginar.** Sem filtro são
 * 1.861 itens e 5.677 posições — uma grade que o navegador monta mas ninguém lê.
 * Com filtro, o maior laboratório dá 281 itens em 5 CDs, 1.204 células: cabe na
 * tela e cabe no olho.
 */

const EST_CHAO = somaSql(COLUNAS_ESTOQUE_CHAO, "s");
const EST_TOTAL = somaSql(COLUNAS_ESTOQUE_TOTAL, "s");
const VENDIDO = somaSql(COLUNAS_VENDIDO_M0, "s");

/** Consumo diário previsto, a régua de todos os "dias de". */
const POR_DIA = `(f.forecast_m0 / ${DIAS_NO_MES}.0)`;
const DIAS_CHAO = `(COALESCE(${EST_CHAO},0) / ${POR_DIA})`;

export type CelulaTabela = {
  codigo: string;
  filial: string;
  estoqueChao: number;
  estoqueTotal: number;
  forecast: number;
  vendido: number;
  /** Cobertura do estoque de chão, em dias. */
  diasChao: number;
  /** Cobertura contando o que já está comprado e em trânsito. */
  diasTotal: number;
  /** Quanto do forecast do mês já saiu; `null` quando não há forecast. */
  percentualVendido: number | null;
  /** Faixa de cobertura — é ela que dá a cor da célula. */
  faixa: FaixaId;
  /**
   * O estoque de chão aberto por armazém.
   *
   * Vem junto porque o total esconde a composição: 30 mil unidades em Q40 e 30
   * mil em 01 cobrem os mesmos dias e são situações diferentes — uma está
   * disponível, a outra em quarentena.
   */
  porArmazem: Record<string, number>;
};

export type LinhaTabela = {
  codigo: string;
  descricao: string | null;
  celulas: Map<string, CelulaTabela>;
  /** Soma dos CDs, para ordenar a grade pelo que mais pesa. */
  forecastTotal: number;
};

export type DadosTabela = {
  linhas: LinhaTabela[];
  /** CDs que aparecem, na ordem das colunas. */
  filiais: string[];
  fornecedores: string[];
};

/**
 * Monta a grade de um laboratório.
 *
 * Uma consulta só, com `LEFT JOIN` do simulador no forecast: o forecast define
 * quais posições existem — item sem previsão não entra na grade, porque não há
 * cobertura a calcular — e o simulador traz estoque e venda. Posição com
 * forecast e sem linha no simulador vira estoque zero, que é o caso mais
 * urgente, não o caso a esconder.
 */
export async function carregarTabela(
  data: string,
  fornecedor: string | undefined,
): Promise<DadosTabela> {
  const fornecedores = await listarLaboratorios(data);
  if (!fornecedor) return { linhas: [], filiais: [], fornecedores };

  const linhas = await prisma.$queryRawUnsafe<
    ({
      codigo: string;
      descricao: string | null;
      filial: string;
      chao: number;
      total: number;
      forecast: number;
      vendido: number;
      dias_chao: number;
      dias_total: number;
      faixa: FaixaId;
    } & Record<string, number>)[]
  >(
    // O fornecedor sai de um CTE, resolvido uma vez por item, e não de
    // subconsulta correlacionada por linha. A versão correlacionada levava 23
    // segundos: ela reexecuta a busca para cada uma das 5.677 linhas de
    // forecast, antes mesmo de o filtro descartar as que não são do laboratório.
    `WITH forn AS (
       SELECT DISTINCT ON (s2.codigo) s2.codigo, ${nomeFornecedor("s2")} AS nome
         FROM simulador s2 ${joinFornecedor("s2")}
        WHERE s2.data_snapshot = $1::date AND s2.fornecedor IS NOT NULL
        ORDER BY s2.codigo
     )
     SELECT f.codigo,
            pr.descricao,
            f.filial,
            COALESCE(${EST_CHAO}, 0)::float8   AS chao,
            COALESCE(${EST_TOTAL}, 0)::float8  AS total,
            f.forecast_m0::float8              AS forecast,
            COALESCE(${VENDIDO}, 0)::float8    AS vendido,
            ${DIAS_CHAO}::float8               AS dias_chao,
            (COALESCE(${EST_TOTAL},0) / ${POR_DIA})::float8 AS dias_total,
            ${faixaSql(DIAS_CHAO)}             AS faixa,
            ${COLUNAS_ESTOQUE_CHAO.map(
              (c) => `COALESCE(s."${c}", 0)::float8 AS "${c}"`,
            ).join(", ")}
       FROM forecast f
       LEFT JOIN ${simuladorPorCd("s.data_snapshot = $1::date")} s
         ON s.codigo = f.codigo AND s.filial = f.filial AND s.data_snapshot = $1::date
       LEFT JOIN produtos pr ON pr.codigo = f.codigo
       -- JOIN e nao LEFT JOIN: item sem fornecedor no simulador nao pertence a
       -- laboratorio nenhum, e nao tem onde aparecer numa grade filtrada.
       JOIN forn ON forn.codigo = f.codigo AND forn.nome = $2
      WHERE ${snapshotMensalSql("forecast", "f", "$1")}
        AND f.forecast_m0 > 0
        AND ${torreValidaSql("f")}
        AND f.filial IS NOT NULL
      ORDER BY f.codigo, f.filial`,
    data,
    fornecedor,
  );

  const porItem = new Map<string, LinhaTabela>();
  const filiais = new Set<string>();

  for (const l of linhas) {
    filiais.add(l.filial);
    const item = porItem.get(l.codigo) ?? {
      codigo: l.codigo,
      descricao: l.descricao,
      celulas: new Map<string, CelulaTabela>(),
      forecastTotal: 0,
    };
    item.forecastTotal += l.forecast;
    const porArmazem: Record<string, number> = {};
    for (const c of COLUNAS_ESTOQUE_CHAO) porArmazem[c] = Number(l[c] ?? 0);

    item.celulas.set(l.filial, {
      codigo: l.codigo,
      filial: l.filial,
      estoqueChao: l.chao,
      estoqueTotal: l.total,
      forecast: l.forecast,
      vendido: l.vendido,
      diasChao: l.dias_chao,
      diasTotal: l.dias_total,
      percentualVendido: l.forecast > 0 ? l.vendido / l.forecast : null,
      faixa: l.faixa,
      porArmazem,
    });
    porItem.set(l.codigo, item);
  }

  // A coluna Cia é somada aqui, e não no SQL, para somar exatamente as mesmas
  // células que a grade mostra — um GROUP BY paralelo acabaria divergindo no dia
  // em que um filtro novo entrasse só num dos dois caminhos.
  //
  // Os dias da Cia saem da divisão dos totais, nunca da média dos CDs: um CD com
  // 2 dias e outro com 200 não fazem 101 dias de cobertura da companhia.
  for (const item of porItem.values()) {
    const cia = somarCelulas([...item.celulas.values()]);
    if (cia) item.celulas.set(COLUNA_CIA, cia);
  }

  return {
    // Maior forecast primeiro: a grade é longa, e quem abre quer ver o que pesa
    // antes de rolar.
    // Menor cobertura da companhia primeiro: a grade é longa, e o que precisa
    // de decisão tem de estar no topo. Por forecast, o item de maior volume
    // vinha na frente — que é outra pergunta.
    //
    // Empate desempata pelo maior forecast: entre dois itens com a mesma
    // cobertura, o que vende mais pesa mais.
    //
    // Item sem posição na Cia vai para o fim, e não para o começo como um zero
    // faria: ausência de cobertura não é cobertura zero.
    linhas: [...porItem.values()].sort(
      (a, b) =>
        coberturaCia(a) - coberturaCia(b) || b.forecastTotal - a.forecastTotal,
    ),
    filiais: [...filiais].sort(),
    fornecedores,
  };
}

/** Laboratórios com posição no dia, para o seletor. */
async function listarLaboratorios(data: string): Promise<string[]> {
  const linhas = await prisma.$queryRawUnsafe<{ fornecedor: string }[]>(
    `SELECT DISTINCT ${nomeFornecedor("s")} AS fornecedor
       FROM simulador s ${joinFornecedor("s")}
      WHERE s.data_snapshot = $1::date AND s.fornecedor IS NOT NULL
      ORDER BY 1`,
    data,
  );
  return linhas.map((l) => l.fornecedor);
}

/** Soma as posições de um item em uma célula só, a visão da companhia. */
function somarCelulas(celulas: CelulaTabela[]): CelulaTabela | null {
  if (celulas.length === 0) return null;

  const porArmazem: Record<string, number> = {};
  for (const c of COLUNAS_ESTOQUE_CHAO) {
    porArmazem[c] = celulas.reduce((a, x) => a + (x.porArmazem[c] ?? 0), 0);
  }

  const estoqueChao = celulas.reduce((a, c) => a + c.estoqueChao, 0);
  const estoqueTotal = celulas.reduce((a, c) => a + c.estoqueTotal, 0);
  const forecast = celulas.reduce((a, c) => a + c.forecast, 0);
  const vendido = celulas.reduce((a, c) => a + c.vendido, 0);
  const porDia = forecast / DIAS_NO_MES;

  const diasChao = porDia > 0 ? estoqueChao / porDia : 0;

  return {
    codigo: celulas[0].codigo,
    filial: COLUNA_CIA,
    estoqueChao,
    estoqueTotal,
    forecast,
    vendido,
    diasChao,
    diasTotal: porDia > 0 ? estoqueTotal / porDia : 0,
    percentualVendido: forecast > 0 ? vendido / forecast : null,
    // `faixaDe` devolve nulo só para dias nulo ou NaN, e aqui o número é
    // sempre finito — mas o fallback evita um `!` que esconderia a hipótese.
    faixa: faixaDe(diasChao) ?? "zero",
    porArmazem,
  };
}

/** Cobertura da companhia, para ordenar. Sem posição vai para o fim. */
function coberturaCia(linha: LinhaTabela): number {
  return linha.celulas.get(COLUNA_CIA)?.diasChao ?? Number.POSITIVE_INFINITY;
}
