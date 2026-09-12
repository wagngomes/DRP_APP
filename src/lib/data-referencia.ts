import type { ImportModelConfig } from "@/lib/imports/config";


/** Formato de troca: yyyy-mm-dd, sem hora e sem fuso. */
const FORMATO = /^\d{4}-\d{2}-\d{2}$/;

/** Meia-noite UTC do dia informado — mesma convenção das colunas @db.Date. */
export function paraDataUtc(iso: string): Date {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

export function paraIso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

export function ehIsoValido(valor: string): boolean {
  if (!FORMATO.test(valor)) return false;
  const data = paraDataUtc(valor);
  return !Number.isNaN(data.getTime()) && paraIso(data) === valor;
}

/**
 * Recorte de data que uma consulta deve aplicar ao model, dada a data de
 * referência. Devolve `undefined` quando a tabela não é recortada por data
 * (cadastros como Produtos, Fiscal e Rotas), para o chamador simplesmente
 * omitir o `where`.
 */
export function filtroSnapshot(
  model: ImportModelConfig,
  dataReferencia: string
): Record<string, unknown> | undefined {
  const campo = model.snapshotField;
  if (!campo || !model.snapshotScope) return undefined;

  const referencia = paraDataUtc(dataReferencia);

  if (model.snapshotScope === "day") {
    return { [campo]: referencia };
  }

  // "month": todo o mês da data de referência. Intervalo semiaberto para não
  // depender do número de dias do mês.
  const inicio = new Date(Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth(), 1));
  const proximoMes = new Date(Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth() + 1, 1));
  return { [campo]: { gte: inicio, lt: proximoMes } };
}

/** Texto curto explicando o recorte na tela — evita o usuário ter que adivinhar. */
export function descreverEscopo(model: ImportModelConfig): string {
  if (!model.snapshotScope) return "Não aplica";
  return model.snapshotScope === "day" ? "Dados do dia" : "Dados do mês";
}
