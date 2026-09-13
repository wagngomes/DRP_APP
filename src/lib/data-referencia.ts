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

/**
 * Fuso em que o sistema decide que dia é hoje.
 *
 * A operação é no Brasil; o servidor, não necessariamente — e mesmo um servidor
 * em São Paulo roda com relógio em UTC, que é o padrão de qualquer contêiner.
 */
export const FUSO_OPERACAO = "America/Sao_Paulo";

/**
 * O dia de hoje na operação, em yyyy-mm-dd.
 *
 * `new Date().toISOString()` **não serve** para isto, e a armadilha é sutil:
 * `toISOString` converte para UTC por definição, então às 21h no Brasil ele já
 * devolve o dia seguinte. O sistema passava a apontar para um dia sem
 * importação nenhuma e as telas apareciam vazias — de noite, todo dia.
 *
 * A reação natural, `TZ=America/Sao_Paulo` no contêiner, não corrige nada aqui:
 * `toISOString` ignora `TZ`. Só calcular no fuso explicitamente resolve, e essa
 * é também a solução que sobrevive à VPS mudar de país.
 *
 * `en-CA` porque é o idioma cuja data curta já sai no formato ISO — evita
 * remontar a string a partir das partes.
 */
export function hojeNaOperacao(fuso = FUSO_OPERACAO): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
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
