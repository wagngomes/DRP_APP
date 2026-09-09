import { describe, expect, it } from "vitest";

import {
  cdFisicoDe,
  cdVirtualDe,
  COLUNAS_SO_DO_FISICO,
  COLUNAS_VIRTUAIS,
  ehCdVirtual,
  rotuloCdVirtual,
  simuladorPorCd,
} from "./cds-virtuais";

/**
 * Regra dos CDs "90": o armazém 11 é um CD próprio, e suas quantidades chegam
 * na linha do CD "10" correspondente. A divisão é feita zerando colunas, e é
 * essa escolha que faz todas as fórmulas existentes continuarem valendo — o
 * teste mais importante aqui é o de conservação.
 */
describe("correspondência entre CD físico e virtual", () => {
  it("converte nos dois sentidos", () => {
    expect(cdVirtualDe("1002")).toBe("9002");
    expect(cdFisicoDe("9002")).toBe("1002");
  });

  it("é reversível para qualquer CD do prefixo", () => {
    for (const cd of ["1002", "1006", "1021", "1023", "1024", "1036"]) {
      expect(cdFisicoDe(cdVirtualDe(cd))).toBe(cd);
    }
  });

  it("reconhece o CD virtual pelo prefixo", () => {
    expect(ehCdVirtual("9002")).toBe(true);
    expect(ehCdVirtual("1002")).toBe(false);
    expect(ehCdVirtual(null)).toBe(false);
  });

  it("deriva o rótulo do físico, para um código novo aparecer legível", () => {
    expect(rotuloCdVirtual("CAJ")).toBe("CAJ·11");
  });
});

describe("simuladorPorCd", () => {
  const sql = simuladorPorCd("s.data_snapshot = $1::date");

  it("gera as duas metades do UNION", () => {
    expect(sql).toContain("UNION ALL");
  });

  it("zera as colunas do armazém 11 na linha física", () => {
    // Se não zerasse, a quantidade do CD virtual seria contada duas vezes.
    for (const coluna of COLUNAS_VIRTUAIS) {
      expect(sql).toContain(`0::numeric AS "${coluna}"`);
    }
  });

  it("zera as colunas de quantidade do físico na linha virtual", () => {
    for (const coluna of COLUNAS_SO_DO_FISICO) {
      expect(sql).toContain(`0::numeric AS "${coluna}"`);
    }
  });

  it("mantém o custo unitário nas duas linhas", () => {
    // `cmv_unitario_1` é custo do item, não quantidade do CD: a linha virtual
    // precisa dele para valorizar o estoque do armazém 11.
    expect(COLUNAS_SO_DO_FISICO).not.toContain("cmv_unitario_1");
    expect(COLUNAS_SO_DO_FISICO).not.toContain("cmv_unitario");
  });

  it("aplica o filtro de snapshot nas duas metades", () => {
    // Sem o filtro na segunda metade, a consulta lia a tabela cumulativa
    // inteira — foi o que fez uma listagem levar 27 segundos.
    const ocorrencias = sql.split("s.data_snapshot = $1::date").length - 1;
    expect(ocorrencias).toBeGreaterThanOrEqual(2);
  });

  it("gera a linha virtual só quando há quantidade no armazém 11", () => {
    // Sem essa condição, o sistema inventaria um CD onde ele não opera.
    for (const coluna of COLUNAS_VIRTUAIS) {
      expect(sql).toContain(`COALESCE(s."${coluna}",0) <> 0`);
    }
  });
});
