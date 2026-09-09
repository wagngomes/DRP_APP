/**
 * Fórmulas de cobertura de estoque (dias de estoque).
 *
 * Fonte única de verdade: as listas de colunas abaixo alimentam tanto o cálculo
 * em TypeScript quanto o SQL das consultas (via `somaSql`), para os dois nunca
 * divergirem.
 */

/** Estoque chão: o que está fisicamente nos armazéns do CD. */
export const COLUNAS_ESTOQUE_CHAO = [
  "est_arm_01",
  "est_arm_11",
  "est_arm_26",
  "est_arm_nac",
  "est_arm_q40",
  "est_arm_rc",
] as const;

/**
 * Rótulo curto de cada armazém do estoque chão, para a abertura caber no card
 * sem repetir o prefixo "est_arm_" em todas as colunas.
 */
export const ROTULO_ARMAZEM: Record<(typeof COLUNAS_ESTOQUE_CHAO)[number], string> = {
  est_arm_01: "01",
  est_arm_11: "11",
  est_arm_26: "26",
  est_arm_nac: "NAC",
  est_arm_q40: "Q40",
  est_arm_rc: "RC",
};

/** Vendas do mês corrente, por armazém, na base do simulador. */
export const COLUNAS_VENDIDO_M0 = [
  "vendido_m0_arm_01",
  "vendido_m0_arm_26",
  "vendido_m0_arm_11",
  "vendido_m0_arm_tr",
] as const;

/** Já faturado e em trânsito entre CDs. */
export const COLUNAS_TRANSFERENCIA = ["total_trans"] as const;

/** Pedidos de compra ainda não recebidos. */
export const COLUNAS_COMPRAS = [
  "compras_arm_01",
  "compras_arm_26",
  "compras_arm_nac",
] as const;

/** Estoque total: chão + o que está a caminho (transferências + compras). */
export const COLUNAS_ESTOQUE_TOTAL = [
  ...COLUNAS_ESTOQUE_CHAO,
  ...COLUNAS_TRANSFERENCIA,
  ...COLUNAS_COMPRAS,
] as const;

/** Soma SQL das colunas, com COALESCE para um armazém vazio não anular a linha. */
export function somaSql(colunas: readonly string[], alias = "s"): string {
  return `(${colunas.map((c) => `COALESCE(${alias}.${c},0)`).join("+")})`;
}

/**
 * Item válido para análise de cobertura: a torre do forecast manda considerá-lo.
 *
 * O resto da base traz "Desconsiderar" e "Desconsiderar até 1º Recebimento" —
 * itens que o negócio não quer acompanhar (ou ainda não recebeu pela primeira
 * vez). Fica aqui para as telas de disponibilidade e de fornecedores usarem o
 * mesmo universo; se cada uma escrever o seu, os números divergem.
 */
export function torreValidaSql(alias = "f"): string {
  return `lower(trim(${alias}.torre)) = 'considerar'`;
}

/**
 * Snapshot único de uma base mensal (`forecast`, `plano_compra`).
 *
 * Essas tabelas são cumulativas: somar todos os snapshots do mês duplicaria
 * cada linha a cada reimportação. A fonte do mês é **um** snapshot — o mais
 * recente que não seja posterior à data de referência.
 *
 * O limite superior é a data de referência, e não "hoje", para que consultar um
 * dia passado devolva o cenário daquele momento em vez do atual.
 *
 * `paramData` é o placeholder do parâmetro com a data (ex.: `"$2"`).
 */
export function snapshotMensalSql(
  tabela: string,
  alias: string,
  paramData: string
): string {
  return `${alias}.data_snapshot = (
      SELECT MAX(_m.data_snapshot) FROM ${tabela} _m
       WHERE _m.data_snapshot >= date_trunc('month', ${paramData}::date)
         AND _m.data_snapshot <= ${paramData}::date
    )`;
}

/** Média diária de consumo derivada do forecast mensal. */
export const DIAS_NO_MES = 30;

/**
 * Dias de estoque = estoque / (forecast mensal / 30).
 *
 * Devolve `null` quando o forecast é zero ou ausente: sem previsão de consumo a
 * cobertura é indefinida, não infinita — e a página só considera itens com
 * `forecast_m0 > 0`, então esse caso não deveria aparecer.
 */
export function diasDeEstoque(estoque: number, forecastMensal: number): number | null {
  if (!forecastMensal || forecastMensal <= 0) return null;
  return estoque / (forecastMensal / DIAS_NO_MES);
}

export type FaixaId = "zero" | "critico" | "baixo" | "adequado" | "alto" | "excesso";

export type Faixa = {
  id: FaixaId;
  /** Rótulo curto para legenda e tabela. */
  rotulo: string;
  /** Limite inferior, inclusivo. */
  min: number;
  /** Limite superior, exclusivo. `null` = sem teto. */
  max: number | null;
};

/**
 * Faixas de cobertura, do pior para o melhor. Limite inferior inclusivo e
 * superior exclusivo, então cada valor cai em exatamente uma faixa (30 dias é
 * "alto", não "adequado").
 */
export const FAIXAS: Faixa[] = [
  { id: "zero", rotulo: "Sem estoque", min: 0, max: 0 },
  { id: "critico", rotulo: "0 a 10 dias", min: 0, max: 10 },
  { id: "baixo", rotulo: "10 a 20 dias", min: 10, max: 20 },
  { id: "adequado", rotulo: "20 a 30 dias", min: 20, max: 30 },
  { id: "alto", rotulo: "30 a 60 dias", min: 30, max: 60 },
  { id: "excesso", rotulo: "60 dias ou mais", min: 60, max: null },
];

export function faixaDe(dias: number | null): FaixaId | null {
  if (dias === null || Number.isNaN(dias)) return null;
  if (dias <= 0) return "zero";
  if (dias < 10) return "critico";
  if (dias < 20) return "baixo";
  if (dias < 30) return "adequado";
  if (dias < 60) return "alto";
  return "excesso";
}

/** Mesma classificação da `faixaDe`, em SQL, sobre uma expressão de dias. */
export function faixaSql(expressaoDias: string): string {
  return `CASE
    WHEN ${expressaoDias} <= 0 THEN 'zero'
    WHEN ${expressaoDias} < 10 THEN 'critico'
    WHEN ${expressaoDias} < 20 THEN 'baixo'
    WHEN ${expressaoDias} < 30 THEN 'adequado'
    WHEN ${expressaoDias} < 60 THEN 'alto'
    ELSE 'excesso'
  END`;
}

export function faixaPorId(id: string): Faixa | undefined {
  return FAIXAS.find((f) => f.id === id);
}
