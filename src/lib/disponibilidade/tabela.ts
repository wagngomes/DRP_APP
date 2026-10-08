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

/**
 * Consumo diário previsto, a régua de todos os "dias de".
 *
 * `NULLIF` porque a grade passou a mostrar posição com estoque e sem previsão:
 * sem ele a divisão estoura (`division_by_zero`), e com `COALESCE` no lugar
 * dela a cobertura viraria zero — que é a cor da ruptura. Estoque parado sem
 * previsão é o oposto de ruptura, e dividir por nulo devolve nulo, que é a
 * resposta certa: a cobertura é **indefinida**, não é zero nem infinita.
 */
const POR_DIA = `(NULLIF(fc.forecast_m0, 0) / ${DIAS_NO_MES}.0)`;
const DIAS_CHAO = `(COALESCE(${EST_CHAO},0) / ${POR_DIA})`;

export type CelulaTabela = {
  codigo: string;
  filial: string;
  estoqueChao: number;
  estoqueTotal: number;
  forecast: number;
  vendido: number;
  /**
   * Cobertura do estoque de chão, em dias. `null` sem previsão para dividir.
   *
   * Nulo não é zero: zero é "acabou", nulo é "não dá para saber quanto dura,
   * porque ninguém previu consumo". A grade pinta os dois de forma diferente
   * de propósito.
   */
  diasChao: number | null;
  /** Cobertura contando o que já está comprado e em trânsito. */
  diasTotal: number | null;
  /** Quanto do forecast do mês já saiu; `null` quando não há forecast. */
  percentualVendido: number | null;
  /** Faixa de cobertura — é ela que dá a cor da célula. `null` sem previsão. */
  faixa: FaixaId | null;
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
  /** O recorte passou do teto e foi cortado. */
  truncado: boolean;
};

/**
 * Teto de produtos na grade.
 *
 * Uma busca por "gaze" pode casar centenas de itens, e a grade deixa de ser
 * legível muito antes de ficar lenta. O corte acontece depois da ordenação por
 * criticidade, então o que sobra é o que mais precisa de decisão.
 */
const TETO_PRODUTOS = 300;

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
  /** Código exato ou trecho da descrição. */
  produto?: string,
): Promise<DadosTabela> {
  const fornecedores = await listarLaboratorios(data);

  // Um dos dois basta. O laboratório existe para conter o volume, e um produto
  // específico contém sozinho — exigir os dois obrigaria a saber de que
  // laboratório é o item antes de poder procurá-lo.
  if (!fornecedor && !produto) {
    return { linhas: [], filiais: [], fornecedores, truncado: false };
  }

  const linhas = await prisma.$queryRawUnsafe<
    ({
      codigo: string;
      descricao: string | null;
      filial: string;
      chao: number;
      total: number;
      forecast: number;
      vendido: number;
      dias_chao: number | null;
      dias_total: number | null;
      faixa: FaixaId | null;
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
     ),
     -- O forecast que vale: com previsao e com a torre mandando considerar.
     -- Continua sendo ele que da cobertura e cor as celulas.
     fc AS (
       SELECT f.codigo, f.filial, f.forecast_m0
         FROM forecast f
        WHERE ${snapshotMensalSql("forecast", "f", "$1")}
          AND f.forecast_m0 > 0
          AND ${torreValidaSql("f")}
          AND f.filial IS NOT NULL
     ),
     sim AS (
       SELECT s.* FROM ${simuladorPorCd("s.data_snapshot = $1::date")} s
        WHERE s.data_snapshot = $1::date AND s.filial IS NOT NULL
     ),
     -- As posicoes que existem.
     --
     -- Antes era so o forecast, e a grade escondia 4.982 posicoes com estoque
     -- de chao - quase tanto quanto as 5.677 que mostrava. Estoque sem previsao
     -- e informacao: ou sobra parada, ou previsao faltando. As duas leituras
     -- interessam, e nenhuma aparecia.
     pos AS (
       SELECT codigo, filial FROM fc
       UNION
       SELECT s.codigo, s.filial FROM sim s
        WHERE COALESCE(${EST_CHAO}, 0) <> 0 OR COALESCE(${EST_TOTAL}, 0) <> 0
     )
     SELECT p.codigo,
            pr.descricao,
            p.filial,
            COALESCE(${EST_CHAO}, 0)::float8   AS chao,
            COALESCE(${EST_TOTAL}, 0)::float8  AS total,
            COALESCE(fc.forecast_m0, 0)::float8 AS forecast,
            COALESCE(${VENDIDO}, 0)::float8    AS vendido,
            ${DIAS_CHAO}::float8               AS dias_chao,
            (COALESCE(${EST_TOTAL},0) / ${POR_DIA})::float8 AS dias_total,
            ${faixaSql(DIAS_CHAO)}             AS faixa,
            ${COLUNAS_ESTOQUE_CHAO.map(
              (c) => `COALESCE(s."${c}", 0)::float8 AS "${c}"`,
            ).join(", ")}
       FROM pos p
       LEFT JOIN fc ON fc.codigo = p.codigo AND fc.filial = p.filial
       LEFT JOIN sim s ON s.codigo = p.codigo AND s.filial = p.filial
       LEFT JOIN produtos pr ON pr.codigo = p.codigo
       -- LEFT JOIN quando nao ha filtro de laboratorio: a busca por produto nao
       -- deve excluir item que esta sem fornecedor no simulador.
       LEFT JOIN forn ON forn.codigo = p.codigo
      WHERE ($2::text IS NULL OR forn.nome = $2)
        -- Codigo exato ou trecho da descricao, como nas outras telas. O exato
        -- vem primeiro porque e o caso comum: quem tem o codigo quer aquele
        -- item, nao todos os que o contem no texto.
        AND ($3::text IS NULL OR p.codigo = $3 OR pr.descricao ILIKE '%' || $3 || '%')
      ORDER BY p.codigo, p.filial`,
    data,
    fornecedor ?? null,
    produto ?? null,
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

  // Menor cobertura da companhia primeiro: a grade é longa, e o que precisa de
  // decisão tem de estar no topo. Por forecast, o item de maior volume vinha na
  // frente — que é outra pergunta.
  //
  // Empate desempata pelo maior forecast: entre dois itens com a mesma
  // cobertura, o que vende mais pesa mais. Item sem posição na Cia vai para o
  // fim, e não para o começo como um zero faria: ausência de cobertura não é
  // cobertura zero.
  const ordenadas = [...porItem.values()].sort(
    (a, b) =>
      coberturaCia(a) - coberturaCia(b) || b.forecastTotal - a.forecastTotal,
  );

  return {
    linhas: ordenadas.slice(0, TETO_PRODUTOS),
    filiais: [...filiais].sort(),
    fornecedores,
    truncado: ordenadas.length > TETO_PRODUTOS,
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

  // Sem previsão na Cia inteira, a cobertura é nula e não zero. Antes era zero,
  // e zero é a faixa preta — item com estoque e sem forecast apareceria como
  // ruptura, que é o contrário do que ele é.
  const diasChao = porDia > 0 ? estoqueChao / porDia : null;

  return {
    codigo: celulas[0].codigo,
    filial: COLUNA_CIA,
    estoqueChao,
    estoqueTotal,
    forecast,
    vendido,
    diasChao,
    diasTotal: porDia > 0 ? estoqueTotal / porDia : null,
    percentualVendido: forecast > 0 ? vendido / forecast : null,
    faixa: faixaDe(diasChao),
    porArmazem,
  };
}

/**
 * Cobertura da companhia, para ordenar. Sem cobertura vai para o fim.
 *
 * Vale tanto para item sem posição quanto para item sem previsão: nos dois
 * casos não há cobertura a comparar, e jogá-los para o começo — que é o que um
 * zero faria — encheria o topo da grade de itens que não precisam de decisão,
 * empurrando para baixo justamente os que precisam.
 */
function coberturaCia(linha: LinhaTabela): number {
  return (
    linha.celulas.get(COLUNA_CIA)?.diasChao ?? Number.POSITIVE_INFINITY
  );
}
