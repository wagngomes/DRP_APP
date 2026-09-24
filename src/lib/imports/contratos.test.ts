import { describe, expect, it } from "vitest";

import { getImportModel } from "./config";
import { parseCsvForModel } from "./csv";

/**
 * O import de Contratos, do CSV até o registro pronto para o banco.
 *
 * O que estes testes guardam é o contrato com o arquivo: cabeçalhos em
 * maiúsculas, a competência que pode vir como mês ou como data completa, e os
 * dois campos numéricos. Um erro aqui não aparece como número errado na tela —
 * aparece como coluna vazia, que passa despercebida até alguém somar à mão.
 */
const modelo = getImportModel("contratos")!;

const CABECALHO =
  "COMPETENCIA,STATUS_ACORDO,RAZAO_SOCIAL,CNPJ,GRUPO,UF,REGIONAL,REPRESENTANTE," +
  "RESERVA_FINAL_CONTRATO,CODIGO,CONTRIBUINTE,LOCAL_IDEAL,QUANTIDADE_FINAL";

function csv(linha: string): ReturnType<typeof parseCsvForModel> {
  return parseCsvForModel(`${CABECALHO}\n${linha}`, modelo);
}

describe("import de contratos", () => {
  it("lê o arquivo com os cabeçalhos em maiúsculas", () => {
    const r = csv(
      "2026-09-01,VIGENTE,HOSPITAL SAO LUCAS LTDA,12420164000580,UNIMED,SP,SUDESTE," +
        "MARIA S.,1500.5,000998645,S,1006,320"
    );

    expect(r.missingColumns).toEqual([]);
    expect(r.records).toHaveLength(1);
    const c = r.records[0];
    expect(c.status_acordo).toBe("VIGENTE");
    expect(c.razao_social).toBe("HOSPITAL SAO LUCAS LTDA");
    expect(c.grupo).toBe("UNIMED");
    expect(c.local_ideal).toBe("1006");
  });

  it("aceita a competência como mês, não só como data completa", () => {
    // O arquivo é mensal. Se vier "09/2026" em vez de "01/09/2026", a carga
    // inteira era recusada linha a linha.
    for (const valor of ["2026-09-01", "01/09/2026", "09/2026", "2026-09"]) {
      const r = csv(`${valor},VIGENTE,X,1,G,SP,SE,M,1,1,S,1006,1`);
      expect(r.records[0].competencia, valor).toEqual(new Date(Date.UTC(2026, 8, 1)));
    }
  });

  it("recusa uma competência que não é data", () => {
    const r = csv("SET/26,VIGENTE,X,1,G,SP,SE,M,1,1,S,1006,1");
    expect(r.records).toHaveLength(0);
    expect(r.skippedRows.length).toBeGreaterThan(0);
  });

  it("normaliza o zero à esquerda do código, como as outras bases", () => {
    // É o que faz o cruzamento com Produtos funcionar: o mesmo item chega como
    // "000998645" num relatório e "998645" noutro.
    const r = csv("2026-09,VIGENTE,X,1,G,SP,SE,M,1,000998645,S,1006,1");
    expect(r.records[0].codigo).toBe("998645");
  });

  it("recupera o zero à esquerda do CNPJ", () => {
    const r = csv("2026-09,VIGENTE,X,01234567000199,G,SP,SE,M,1,1,S,1006,1");
    expect(r.records[0].cnpj).toBe("01234567000199");
  });

  it("lê os dois campos numéricos como número", () => {
    const r = csv("2026-09,VIGENTE,X,1,G,SP,SE,M,1845.35,1,S,1006,320");
    expect(Number(r.records[0].reserva_final_contrato)).toBe(1845.35);
    expect(Number(r.records[0].quantidade_final)).toBe(320);
  });

  it("recorta pela competência do arquivo, não pelo dia do upload", () => {
    // A carga de setembro pode ser feita em outubro. Recortar pelo
    // `data_snapshot` faria setembro sumir das telas.
    expect(modelo.scopeField).toBe("competencia");
    expect(modelo.snapshotField).toBe("data_snapshot");
  });
});
