/**
 * Parâmetros de projeção definidos pelo usuário no Painel.
 *
 * Ficam em cookie pelo mesmo motivo da data de referência: quem monta as
 * projeções é o servidor, então toda tela enxerga o mesmo valor sem precisar
 * carregá-lo adiante. São dois números separados porque um caminhão parado e um
 * pedido de compra atrasado têm causas diferentes.
 */
export const COOKIE_DIAS_TRANSFERENCIAS = "drp_dias_transferencias";
export const COOKIE_DIAS_PEDIDOS = "drp_dias_pedidos";

export const DIAS_PADRAO = 5;
export const DIAS_MAXIMO = 365;

/**
 * Parâmetros de cobertura, usados pelos motores de risco.
 *
 * Separados dos prazos de projeção acima porque respondem a outra pergunta: os de
 * cima corrigem uma data que venceu, estes definem a partir de quanta cobertura
 * o negócio quer ser avisado e até onde quer repor.
 */
export const COOKIE_DIAS_CRITICO = "drp_dias_critico";
export const COOKIE_DIAS_GATILHO = "drp_dias_gatilho";
export const COOKIE_DIAS_ALVO = "drp_dias_alvo";

export const CRITICO_PADRAO = 20;
export const GATILHO_PADRAO = 10;
export const ALVO_PADRAO = 30;

export type Parametros = {
  /** Dias úteis para transferências cuja chegada prevista já venceu. */
  diasTransferencias: number;
  /** Dias úteis para pedidos de compra cuja data pedra já venceu. */
  diasPedidos: number;
};

/** Faixas de cobertura que definem o foco da análise de risco. */
export type Coberturas = {
  /** Abaixo disso a posição entra no foco da análise. */
  critico: number;
  /** Abaixo disso uma transferência é sugerida. */
  gatilho: number;
  /** Cobertura que a transferência sugerida deve alcançar. */
  alvo: number;
};

export function ehDiasValido(valor: unknown): boolean {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0 && n <= DIAS_MAXIMO;
}

export function normalizarDias(valor: string | undefined, padrao = DIAS_PADRAO): number {
  return valor !== undefined && ehDiasValido(valor) ? Number(valor) : padrao;
}

/**
 * Gatilho acima do alvo pediria quantidade negativa; nesse caso o alvo é elevado
 * para o gatilho, o que equivale a "repor só até sair do gatilho".
 */
export function normalizarCoberturas(c: Coberturas): Coberturas {
  return { ...c, alvo: Math.max(c.alvo, c.gatilho) };
}
