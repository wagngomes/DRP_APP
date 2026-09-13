import { afterEach, describe, expect, it, vi } from "vitest";

import { hojeNaOperacao, paraIso } from "./data-referencia";

/**
 * O dia de hoje na operação.
 *
 * O teste existe por causa de uma armadilha específica: `toISOString()`
 * converte para UTC por definição, então às 21h no Brasil ele já devolve o dia
 * seguinte. O sistema passava a apontar para um dia sem importação nenhuma e as
 * telas apareciam vazias — de noite, todo dia.
 *
 * Os horários abaixo são os que quebram. Um teste que só exercitasse o meio da
 * tarde passaria com a implementação errada.
 */
describe("hojeNaOperacao", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function congelar(utc: string) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(utc));
  }

  it("às 21h do Brasil ainda é o mesmo dia", () => {
    // 00:30 UTC de 13/09 = 21:30 de 12/09 em São Paulo.
    congelar("2026-09-13T00:30:00.000Z");

    expect(hojeNaOperacao()).toBe("2026-09-12");
    // A implementação anterior — e a armadilha que o teste guarda.
    expect(paraIso(new Date())).toBe("2026-09-13");
  });

  it("à meia-noite e um do Brasil já é o dia novo", () => {
    // 03:01 UTC = 00:01 em São Paulo.
    congelar("2026-09-13T03:01:00.000Z");
    expect(hojeNaOperacao()).toBe("2026-09-13");
  });

  it("no meio da tarde os dois concordam", () => {
    congelar("2026-09-12T18:00:00.000Z");
    expect(hojeNaOperacao()).toBe("2026-09-12");
    expect(paraIso(new Date())).toBe("2026-09-12");
  });

  it("acerta no horário de verão do hemisfério norte", () => {
    // São Paulo não tem mais horário de verão, mas o deslocamento em relação a
    // UTC continua sendo -3 o ano todo. Fevereiro confirma que não há surpresa.
    congelar("2026-02-13T02:00:00.000Z");
    expect(hojeNaOperacao()).toBe("2026-02-12");
  });

  it("devolve o formato que o resto do sistema espera", () => {
    congelar("2026-09-12T18:00:00.000Z");
    expect(hojeNaOperacao()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("funciona para outro fuso, se um dia a operação mudar", () => {
    congelar("2026-09-13T00:30:00.000Z");
    expect(hojeNaOperacao("UTC")).toBe("2026-09-13");
    expect(hojeNaOperacao("America/Manaus")).toBe("2026-09-12");
  });
});
