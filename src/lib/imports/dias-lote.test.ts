import { describe, expect, it } from "vitest";

import { diasNoLote } from "./bulk-copy";

/**
 * Os dias que a carga incremental substitui.
 *
 * É a regra mais perigosa da importação: o que sai desta função é apagado do
 * banco. Um dia a menos deixa duplicata; um dia a mais apaga venda que ninguém
 * pediu para remover, e sem chave natural não há como recuperá-la a não ser
 * reimportando o arquivo daquele dia.
 */
describe("diasNoLote", () => {
  const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  it("junta os dias distintos, em ordem", () => {
    expect(
      diasNoLote(
        [
          { data: d("2026-09-24") },
          { data: d("2026-09-23") },
          { data: d("2026-09-24") },
        ],
        "data",
      ),
    ).toEqual(["2026-09-23", "2026-09-24"]);
  });

  it("usa o dia em UTC, não o do fuso da máquina", () => {
    // 21h no Brasil é o dia seguinte em UTC. Sem o corte pelo ISO, a carga da
    // noite apagaria o dia errado.
    expect(
      diasNoLote([{ data: new Date("2026-09-24T23:30:00.000Z") }], "data"),
    ).toEqual(["2026-09-24"]);
  });

  it("aceita data em texto ISO, que é como o CSV às vezes chega", () => {
    expect(
      diasNoLote(
        [{ data: "2026-09-24" }, { data: "2026-09-24T10:00:00Z" }],
        "data",
      ),
    ).toEqual(["2026-09-24"]);
  });

  it("ignora linha sem data, em vez de apagar um dia inventado", () => {
    expect(
      diasNoLote(
        [
          { data: null },
          { data: undefined },
          { data: "" },
          { outra: d("2026-01-01") },
        ],
        "data",
      ),
    ).toEqual([]);
  });

  it("ignora data inválida", () => {
    // `new Date("banana")` não lança: vira Invalid Date, e `toISOString` aí sim
    // lançaria no meio da importação.
    expect(
      diasNoLote(
        [{ data: new Date("banana") }, { data: "31/02/2026" }],
        "data",
      ),
    ).toEqual([]);
  });

  it("lote vazio não apaga nada", () => {
    // O chamador pula o DELETE com lista vazia; este teste guarda o contrato.
    expect(diasNoLote([], "data")).toEqual([]);
  });

  it("um arquivo com vários meses substitui exatamente esses dias", () => {
    // Reimportar um período inteiro continua funcionando: apaga só os dias que
    // vieram, e o que está fora deles permanece.
    const linhas = [d("2026-07-01"), d("2026-08-15"), d("2026-09-24")].map(
      (data) => ({ data }),
    );
    expect(diasNoLote(linhas, "data")).toEqual([
      "2026-07-01",
      "2026-08-15",
      "2026-09-24",
    ]);
  });
});
