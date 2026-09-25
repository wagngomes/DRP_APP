import { describe, expect, it } from "vitest";

import { limitesDoMes } from "./mes";

/** A versão que vivia copiada em cinco módulos, para provar equivalência. */
function versaoAntiga(data: string): [string, string] {
  const [ano, mes] = data.split("-").map(Number);
  return [
    new Date(Date.UTC(ano, mes - 1, 1)).toISOString().slice(0, 10),
    new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10),
  ];
}

describe("limitesDoMes", () => {
  it("devolve o intervalo semiaberto do mês", () => {
    expect(limitesDoMes("2026-08-10")).toEqual({ inicio: "2026-08-01", fim: "2026-09-01" });
  });

  it("vira o ano em dezembro", () => {
    // É aqui que uma cópia feita à mão erra primeiro: mes + 1 = 13.
    expect(limitesDoMes("2026-12-31")).toEqual({ inicio: "2026-12-01", fim: "2027-01-01" });
  });

  it("acerta fevereiro bissexto sem depender do número de dias", () => {
    // O intervalo é semiaberto justamente para não precisar saber que 2028 tem
    // 29 dias em fevereiro.
    expect(limitesDoMes("2028-02-15")).toEqual({ inicio: "2028-02-01", fim: "2028-03-01" });
  });

  it("aceita o mês sem dia", () => {
    expect(limitesDoMes("2026-08")).toEqual({ inicio: "2026-08-01", fim: "2026-09-01" });
  });

  it("dá o mesmo resultado da versão que estava duplicada, em todo mês de quatro anos", () => {
    // A unificação só é segura se for equivalente em todos os casos, não no
    // exemplo que veio à cabeça.
    for (let ano = 2024; ano <= 2028; ano++) {
      for (let mes = 1; mes <= 12; mes++) {
        const data = `${ano}-${String(mes).padStart(2, "0")}-15`;
        const [inicio, fim] = versaoAntiga(data);
        expect(limitesDoMes(data), data).toEqual({ inicio, fim });
      }
    }
  });
});
