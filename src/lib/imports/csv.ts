import Papa from "papaparse";
import { Prisma } from "@/generated/prisma/client";

import type { ImportColumn, ImportModelConfig } from "@/lib/imports/config";

const EMPTY_VALUES = new Set(["", "-", "--", "n/a", "null"]);

/**
 * Decodifica o CSV respeitando a codificação do arquivo.
 *
 * Exports do Excel/Protheus saem em Windows-1252 tão frequentemente quanto em UTF-8, e
 * decodificar tudo como UTF-8 destrói acentos silenciosamente: o byte 0xEA de
 * "Convênio" vira U+FFFD e o dado entra corrompido no banco, sem erro nenhum.
 * A tentativa estrita de UTF-8 falha nesses arquivos, e aí o fallback é
 * Windows-1252 — superconjunto do Latin-1 usado por padrão no Excel em PT-BR.
 */
export function decodificarCsv(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(view);
  } catch {
    return new TextDecoder("windows-1252").decode(view);
  }
}

/**
 * Reduz o cabeçalho ao mesmo formato dos campos do model, para casar apesar
 * das variações que os exports trazem: maiúsculas, acentos, espaços em volta
 * e separadores diferentes de "_" (ex: "COD_PROD/COD_FILIAL" e
 * " estoque_cmv " viram "cod_prod_cod_filial" e "estoque_cmv").
 */
function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseString(raw: string): string | null {
  const trimmed = raw.trim();
  return EMPTY_VALUES.has(trimmed.toLowerCase()) ? null : trimmed;
}

function normalizeNumericString(raw: string): string | null {
  const trimmed = raw.trim();
  if (EMPTY_VALUES.has(trimmed.toLowerCase())) return null;

  // Exports do Excel trazem as colunas de valor formatadas como moeda, com
  // espaços internos: " R$ 1.563,07 " e " R$ -   " (este último é vazio).
  // O "%" de "96%" é só anotação — o número já é o valor.
  let normalized = trimmed
    .replace(/r\$/gi, "")
    .replace(/%/g, "")
    .replace(/\s/g, "");
  // A limpeza pode revelar um marcador de vazio que estava escondido atrás do
  // símbolo de moeda ("R$ -" vira "-").
  if (EMPTY_VALUES.has(normalized.toLowerCase())) return null;

  const hasComma = normalized.includes(",");
  const dotCount = (normalized.match(/\./g) ?? []).length;

  if (hasComma) {
    // BR: ponto = separador de milhar, vírgula = separador decimal.
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (dotCount > 1 || (dotCount === 1 && /\.\d{3}$/.test(normalized))) {
    // sem vírgula, mas com múltiplos pontos ou um único ponto seguido de
    // exatamente 3 dígitos (ex: "1.320") — é separador de milhar, não decimal.
    normalized = normalized.replace(/\./g, "");
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`valor numérico inválido: "${raw}"`);
  }

  return normalized;
}

function parseDecimal(raw: string): Prisma.Decimal | null {
  const normalized = normalizeNumericString(raw);
  return normalized === null ? null : new Prisma.Decimal(normalized);
}

function parseInteger(raw: string): number | null {
  const normalized = normalizeNumericString(raw);
  return normalized === null ? null : Math.round(Number(normalized));
}

function parseDate(raw: string): Date | null {
  const trimmed = raw.trim();
  if (EMPTY_VALUES.has(trimmed.toLowerCase())) return null;

  // ISO: yyyy-mm-dd (com ou sem horário)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (!Number.isNaN(date.getTime())) return date;
  }

  // dd/mm/yyyy
  const brMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (!Number.isNaN(date.getTime())) return date;
  }

  // yyyymmdd compacto
  const compactMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    const [, y, m, d] = compactMatch;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (!Number.isNaN(date.getTime())) return date;
  }

  throw new Error(`data inválida: "${raw}"`);
}

/**
 * Normaliza um código usado como chave de cruzamento.
 *
 * Só mexe quando o valor é puramente numérico: "001006" vira "1006", mas
 * "02082025PA" e "TERCEIROS000609" ficam como estão — há produtos cadastrados
 * assim, e removê-los zeros criaria códigos inexistentes.
 */
function parseCodigo(raw: string): string | null {
  const valor = parseString(raw);
  if (valor === null) return null;
  if (!/^\d+$/.test(valor)) return valor;
  // Mantém ao menos um dígito: "000" vira "0", não string vazia.
  return valor.replace(/^0+(?=\d)/, "");
}

/**
 * Normaliza CNPJ e CPF.
 *
 * Duas coisas que o Excel faz com essas colunas e que quebram todo cruzamento
 * por documento, ambas vistas nesta base:
 *
 * 1. **Zero à esquerda some.** "01097957000160" vira "1097957000160" porque a
 *    coluna foi lida como número. É recuperável: um documento de 12 ou 13
 *    dígitos só pode ser um CNPJ que perdeu zeros, então volta com o
 *    preenchimento à esquerda. CPF tem 11 dígitos e fica intacto — preenchê-lo
 *    criaria um CNPJ que não existe.
 *
 * 2. **Notação científica.** CNPJ tem 14 dígitos, acima dos 15 algarismos
 *    significativos que o Excel preserva, e vira "6,15E+13". Aí os dígitos
 *    foram perdidos de verdade, e o pouco que sobra é pior que nada: nesta base
 *    um único "6,15E+13" cobria 82 empresas diferentes, que somadas viravam um
 *    cliente inexistente. Por isso vira `null` — a linha continua valendo pelo
 *    nome e pelo código do cliente, mas não finge ter um documento.
 */
function parseDocumento(raw: string): string | null {
  const valor = parseString(raw);
  if (valor === null) return null;

  // "6,15E+13" / "6.15e+13": dígitos irrecuperáveis.
  if (/^\d+([.,]\d+)?e\+?\d+$/i.test(valor)) return null;

  // Exports variam entre "12420164000580" e "12.420.164/0005-80".
  const digitos = valor.replace(/\D/g, "");
  if (digitos.length === 0) return null;
  if (digitos.length >= 12 && digitos.length <= 14) return digitos.padStart(14, "0");
  return digitos;
}

function parseValue(column: ImportColumn, raw: string | undefined) {
  if (raw === undefined) return null;
  switch (column.type) {
    case "decimal":
      return parseDecimal(raw);
    case "int":
      return parseInteger(raw);
    case "date":
      return parseDate(raw);
    case "codigo":
      return parseCodigo(raw);
    case "documento":
      return parseDocumento(raw);
    default:
      return parseString(raw);
  }
}

/**
 * Acumula as linhas ignoradas sem guardar todas: em um CSV de 500 mil linhas
 * um erro sistemático produziria 500 mil entradas idênticas na memória. Guarda
 * uma amostra para exibição e a contagem exata por motivo, que é o que explica
 * a causa quando o arquivo inteiro falha.
 */
export class SkipTracker {
  /**
   * Teto de linhas guardadas para o usuário baixar e reconciliar. Alto o
   * suficiente para servir de lista de trabalho, baixo o suficiente para não
   * carregar meio milhão de entradas na memória quando um arquivo inteiro falha.
   */
  static readonly LIMITE_AMOSTRA = 5000;

  private readonly counts = new Map<string, { count: number; exemplo: string }>();
  private readonly samples: { row: number; reason: string }[] = [];
  total = 0;

  add(row: number, reason: string) {
    this.total += 1;
    if (this.samples.length < SkipTracker.LIMITE_AMOSTRA) this.samples.push({ row, reason });
    const chave = reason.replace(/"[^"]*"/g, '"…"');
    const atual = this.counts.get(chave);
    if (atual) atual.count += 1;
    else this.counts.set(chave, { count: 1, exemplo: reason });
  }

  get sample() {
    return this.samples;
  }

  /** Motivos mais frequentes, com a contagem exata de cada um. */
  summary() {
    return [...this.counts.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(({ count, exemplo }) => ({ count, reason: exemplo }));
  }
}

export type ParsedCsvResult = {
  records: Record<string, unknown>[];
  /** Número da linha original no CSV de cada item em `records` (mesmo índice). */
  recordRows: number[];
  totalRows: number;
  skippedRows: { row: number; reason: string }[];
  missingColumns: string[];
};

export function parseCsvForModel(csvText: string, model: ImportModelConfig): ParsedCsvResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    // "" faz o papaparse detectar automaticamente o delimitador (','  ou ';')
    // — exports reais (Excel BR) costumam vir com ';', apesar da preferência
    // original ser vírgula.
    delimiter: "",
  });

  const headerMap = new Map<string, string>();
  for (const header of parsed.meta.fields ?? []) {
    headerMap.set(normalizeHeader(header), header);
  }

  const missingColumns = model.columns
    .filter((c) => !headerMap.has(normalizeHeader(c.field)))
    .map((c) => c.field);

  const records: Record<string, unknown>[] = [];
  const recordRows: number[] = [];
  const skippedRows: { row: number; reason: string }[] = [];

  parsed.data.forEach((rawRow, index) => {
    const rowNumber = index + 2; // +1 header, +1 índice 1-based
    try {
      const record: Record<string, unknown> = {};
      for (const column of model.columns) {
        const header = headerMap.get(normalizeHeader(column.field));
        const rawValue = header ? rawRow[header] : undefined;
        record[column.field] = parseValue(column, rawValue);
      }

      // Quando o model usa uma chave natural (ex: Produtos.codigo,
      // Rotas.codigo_rota) como @id, uma linha sem valor nesse campo não pode
      // ser gravada — o banco rejeitaria o lote inteiro.
      if (model.idField && (record[model.idField] === null || record[model.idField] === undefined)) {
        throw new Error(`${model.idField} ausente (obrigatório como chave primária)`);
      }

      records.push(record);
      recordRows.push(rowNumber);
    } catch (error) {
      skippedRows.push({
        row: rowNumber,
        reason: error instanceof Error ? error.message : "erro desconhecido",
      });
    }
  });

  return {
    records,
    recordRows,
    totalRows: parsed.data.length,
    skippedRows,
    missingColumns,
  };
}
