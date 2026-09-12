/**
 * Parâmetros de projeção, definidos pelo administrador no Painel.
 *
 * São dois números separados porque um caminhão parado e um pedido de compra
 * atrasado têm causas diferentes.
 *
 * Este módulo é só a régua — limites, padrões e validação, sem I/O. Onde os
 * valores ficam guardados é assunto de `lib/configuracao.server.ts`, e a
 * resposta mudou: eram cookie, por navegador, e passaram ao banco quando ficou
 * claro que duas pessoas na mesma tela precisavam ver o mesmo número.
 */
export const DIAS_PADRAO = 5;
export const DIAS_MAXIMO = 365;

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
