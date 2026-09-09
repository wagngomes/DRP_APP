/**
 * Ritmo de venda: compara o que já foi vendido no mês com o que se esperaria
 * ter vendido até a data de referência.
 *
 * Comparar com o forecast cheio não informa nada no começo do mês — no dia 6 de
 * 31, 97% dos itens ficariam "atrasados" apenas porque o mês mal começou. O
 * denominador é o forecast proporcional aos dias decorridos.
 */

export type StatusRitmo = "atrasada" | "no_ritmo" | "acelerada";

/**
 * Banda de tolerância em torno do ritmo esperado. Fora dela o item é
 * classificado; dentro, está "no ritmo".
 */
export const TOLERANCIA = 0.15;

export type Ritmo = {
  /** Quanto do forecast do mês já foi vendido (0..1+). */
  percentualForecast: number | null;
  /** Fração do mês já decorrida na data de referência (0..1). */
  fracaoDecorrida: number;
  /** Realizado ÷ esperado até a data. 1 = exatamente no ritmo. */
  indice: number | null;
  status: StatusRitmo | null;
};

/** Dias decorridos ÷ dias do mês, a partir da data de referência (yyyy-mm-dd). */
export function fracaoDoMesDecorrida(dataReferencia: string): number {
  const [ano, mes, dia] = dataReferencia.split("-").map(Number);
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return Math.min(1, Math.max(0, dia / diasNoMes));
}

export function calcularRitmo(
  vendido: number,
  forecastMensal: number | null,
  dataReferencia: string
): Ritmo {
  const fracaoDecorrida = fracaoDoMesDecorrida(dataReferencia);

  if (!forecastMensal || forecastMensal <= 0) {
    return { percentualForecast: null, fracaoDecorrida, indice: null, status: null };
  }

  const percentualForecast = vendido / forecastMensal;

  // Sem tempo decorrido não há ritmo a medir (dia 0 não existe, mas protege).
  if (fracaoDecorrida <= 0) {
    return { percentualForecast, fracaoDecorrida, indice: null, status: null };
  }

  const indice = percentualForecast / fracaoDecorrida;
  const status: StatusRitmo =
    indice < 1 - TOLERANCIA ? "atrasada" : indice > 1 + TOLERANCIA ? "acelerada" : "no_ritmo";

  return { percentualForecast, fracaoDecorrida, indice, status };
}

export const ROTULO_STATUS: Record<StatusRitmo, string> = {
  atrasada: "Venda atrasada",
  no_ritmo: "No ritmo",
  acelerada: "Venda acelerada",
};
