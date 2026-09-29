import { describe, expect, it } from "vitest";

import { getImportModel } from "./config";
import { parseCsvForModel } from "./csv";

/**
 * O que o importador faz com o arquivo de vendas como ele sai da origem.
 *
 * Códigos com zero à esquerda, CNPJ como texto e data em dd/mm/aaaa. A data
 * deixou de ser detalhe quando a carga incremental passou a apagar os dias
 * presentes no arquivo: ler o dia errado apaga movimento que ninguém pediu para
 * remover.
 */
const MODELO = getImportModel("historico_vendas")!;

function ler(data: string) {
  const csv =
    "DATA;COD_PROD;FILIAL;CNPJ;QUANTIDADE\n" +
    `${data};000183;001006;00419163000103;-10\n`;
  return parseCsvForModel(csv, MODELO);
}

describe("importação do histórico de vendas", () => {
  it("lê dd/mm/aaaa como o dia escrito, em UTC", () => {
    const r = ler("31/08/2026");
    expect(r.records).toHaveLength(1);
    expect((r.records[0].data as Date).toISOString().slice(0, 10)).toBe(
      "2026-08-31",
    );
  });

  it("recusa data impossível em vez de transbordar para o mês seguinte", () => {
    // `Date.UTC(2026, 1, 31)` devolve 3 de março sem reclamar. Com a carga
    // incremental, isso apagaria o movimento de 3 de março.
    const r = ler("31/02/2026");
    expect(r.records).toHaveLength(0);
    expect(r.skippedRows.length).toBeGreaterThan(0);
  });

  it("tira zero à esquerda de código e filial", () => {
    const l = ler("31/08/2026").records[0];
    expect(l.cod_prod).toBe("183");
    expect(l.filial).toBe("1006");
  });

  it("preserva o CNPJ de catorze dígitos", () => {
    expect(ler("31/08/2026").records[0].cnpj).toBe("00419163000103");
  });

  it("preserva código alfanumérico, que não tem zero a tirar", () => {
    const csv =
      "DATA;COD_PROD;FILIAL;CNPJ;QUANTIDADE\n" +
      "31/08/2026;99AXZZB;001006;00419163000103;-1\n";
    expect(parseCsvForModel(csv, MODELO).records[0].cod_prod).toBe("99AXZZB");
  });

  it("recupera CNPJ que perdeu zero à esquerda", () => {
    const csv =
      "DATA;COD_PROD;FILIAL;CNPJ;QUANTIDADE\n" +
      "31/08/2026;000183;001006;1097957000160;-10\n";
    expect(parseCsvForModel(csv, MODELO).records[0].cnpj).toBe(
      "01097957000160",
    );
  });

  it("descarta CNPJ em notação científica em vez de gravar um documento falso", () => {
    // Um único "6,15E+13" cobria 82 empresas diferentes nesta base.
    const csv =
      "DATA;COD_PROD;FILIAL;CNPJ;QUANTIDADE\n" +
      "31/08/2026;000183;001006;8,17105E+13;-10\n";
    expect(parseCsvForModel(csv, MODELO).records[0].cnpj).toBeNull();
  });
});
