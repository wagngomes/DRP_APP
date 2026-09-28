/**
 * Interpreta o campo `data_agendada` dos pedidos de compra.
 *
 * A coluna é texto, e não data, porque a origem mistura três coisas no mesmo
 * campo: a data marcada (`14/09/2026`), a ausência de agendamento
 * (`S/AGENDAMENTO`, e a variante duplicada `S/AGENDAMENTO - S/AGENDAMENTO`) e um
 * estado do pedido (`Não faturado`, que é a maioria — 3.094 de 4.400 linhas).
 *
 * Tratar o campo como "preenchido = agendado" conta 4.400 agendamentos onde
 * existem uns 500. Foi exatamente o erro que a primeira versão desta tela
 * cometeu, e que só apareceu porque o número de agendados vinha idêntico ao de
 * pedidos em todos os trechos.
 *
 * O texto que não é data é devolvido junto: "Não faturado" explica por que não
 * há agendamento, e some se a gente só guardasse o nulo.
 */

export type Agendamento = {
  /** A data marcada, quando o campo traz uma. */
  data: Date | null;
  /** O texto cru quando não é data — o motivo de não haver agendamento. */
  rotulo: string | null;
};

const DATA_BR = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function interpretarAgendamento(
  bruto: string | null | undefined,
): Agendamento {
  const texto = bruto?.trim();
  if (!texto) return { data: null, rotulo: null };

  const m = DATA_BR.exec(texto);
  if (!m) return { data: null, rotulo: texto };

  const [, dia, mes, ano] = m;
  // UTC, como todas as datas do sistema: `Date.UTC` e `toISOString` são o par
  // que não escorrega de dia conforme o fuso da máquina.
  const data = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));

  // Data impossível (31/02) vira Invalid Date silenciosamente; o texto volta
  // como rótulo em vez de virar uma data que não existe.
  if (Number.isNaN(data.getTime()) || data.getUTCDate() !== Number(dia)) {
    return { data: null, rotulo: texto };
  }

  return { data, rotulo: null };
}
