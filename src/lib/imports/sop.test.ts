import { describe, expect, it } from "vitest";

import { getImportModel } from "./config";
import { parseCsvForModel } from "./csv";

/**
 * O import de SOP, do CSV até o registro pronto para o banco.
 *
 * Mesma forma de Contratos — base mensal recortada pela competência do arquivo
 * — e os testes guardam o mesmo: um erro de leitura aqui não aparece como
 * número errado, aparece como coluna vazia que ninguém nota até somar à mão.
 */
const modelo = getImportModel("sop")!;

const CABECALHO = "COMPETENCIA,CODIGO,DESCRICAO,DIVISAO,CONSENSO";

function csv(linha: string): ReturnType<typeof parseCsvForModel> {
  return parseCsvForModel(`${CABECALHO}\n${linha}`, modelo);
}

describe("import de SOP", () => {
  it("lê o arquivo com os cabeçalhos em maiúsculas", () => {
    const r = csv("2026-09-01,000998645,DALINVI 1800MG FA 15ML,ONCOLOGIA,1450.75");

    expect(r.missingColumns).toEqual([]);
    expect(r.records).toHaveLength(1);
    const l = r.records[0];
    expect(l.descricao).toBe("DALINVI 1800MG FA 15ML");
    expect(l.divisao).toBe("ONCOLOGIA");
  });

  it("aceita a competência como mês, não só como data completa", () => {
    for (const valor of ["2026-09-01", "01/09/2026", "09/2026", "2026-09"]) {
      const r = csv(`${valor},1,X,Y,1`);
      expect(r.records[0].competencia, valor).toEqual(new Date(Date.UTC(2026, 8, 1)));
    }
  });

  it("normaliza o zero à esquerda do código", () => {
    // É o que faz o cruzamento com Produtos e com o simulador funcionar.
    const r = csv("2026-09,000998645,X,Y,1");
    expect(r.records[0].codigo).toBe("998645");
  });

  it("lê o consenso como número, inteiro ou fracionado", () => {
    expect(Number(csv("2026-09,1,X,Y,320").records[0].consenso)).toBe(320);
    expect(Number(csv("2026-09,1,X,Y,1450.75").records[0].consenso)).toBe(1450.75);
  });

  it("recorta pela competência do arquivo, não pelo dia do upload", () => {
    expect(modelo.scopeField).toBe("competencia");
    expect(modelo.snapshotField).toBe("data_snapshot");
    expect(modelo.cumulative).toBe(true);
  });
});
