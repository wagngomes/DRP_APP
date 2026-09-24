import type { ImportModelConfig } from "@/lib/imports/config";

/**
 * A data que uma carga recebe no `data_snapshot`.
 *
 * Por padrão é o dia do upload, que é o caso normal: o relatório de hoje entra
 * como o relatório de hoje. Mas reconstruir um mês que já passou exige carimbar
 * o arquivo com o dia a que ele se refere — sem isso, um arquivo de 12/08
 * carregado hoje viraria o relatório de hoje e ninguém conseguiria olhar
 * agosto.
 *
 * Isto não é uma brecha na trilha de auditoria: cada linha também tem
 * `createdAt`, gravado pelo banco, com o instante real da carga. São dois eixos
 * de tempo diferentes — quando o fato valeu e quando ele foi registrado — e
 * confundi-los é o que obriga a escolher entre um e outro.
 */
export type ResultadoDataCarga =
  | { ok: true; data: Date; retroativa: boolean }
  | { ok: false; erro: string };

/** Antes disto é erro de digitação, não carga retroativa. */
const ANO_MINIMO = 2000;

export function resolverDataCarga(
  model: ImportModelConfig,
  /** O que veio do formulário; vazio ou ausente = usar o dia de hoje. */
  pedida: string | null | undefined,
  /** Hoje no fuso da operação, no formato ISO. */
  hoje: string
): ResultadoDataCarga {
  const hojeData = new Date(`${hoje}T00:00:00.000Z`);

  const valor = pedida?.trim();
  if (!valor) return { ok: true, data: hojeData, retroativa: false };

  if (!model.cumulative || !model.snapshotField) {
    return { ok: false, erro: "Esta tabela não guarda histórico por data" };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return { ok: false, erro: `Data inválida: ${valor}` };
  }

  const data = new Date(`${valor}T00:00:00.000Z`);
  // `new Date("2026-02-31")` não falha — rola para março. Comparar de volta é o
  // que pega o dia que não existe no mês.
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== valor) {
    return { ok: false, erro: `Data inválida: ${valor}` };
  }

  if (data.getTime() > hojeData.getTime()) {
    // Um snapshot no futuro ficaria à frente de todas as cargas reais e seria
    // escolhido como "o relatório mais recente" por consultas que pegam o MAX.
    return { ok: false, erro: "A data da carga não pode ser futura" };
  }

  if (data.getUTCFullYear() < ANO_MINIMO) {
    return { ok: false, erro: `Data fora do intervalo esperado: ${valor}` };
  }

  return { ok: true, data, retroativa: data.getTime() !== hojeData.getTime() };
}
