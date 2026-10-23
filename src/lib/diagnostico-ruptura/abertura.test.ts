import { describe, expect, it } from "vitest";

import { aberturaAntesDe } from "@/lib/diagnostico-ruptura/abertura";
import type { AberturaForecast } from "@/lib/diagnostico-ruptura/abertura";

/**
 * Qual abertura de forecast explica uma ruptura.
 *
 * A versão anterior devolvia sempre a mais recente, e por isso um forecast
 * ligado em 20/10 aparecia explicando uma ruptura começada em 01/10 — com a
 * evidência imprimindo "a ruptura começou -19 dias depois".
 */
const abertura = (data: string): AberturaForecast => ({
  codigo: "100",
  filial: "1006",
  data,
  forecast: 2,
  linhaNova: true,
});

describe("aberturaAntesDe", () => {
  it("escolhe a última abertura anterior à ruptura", () => {
    const r = aberturaAntesDe(
      [abertura("2026-09-05"), abertura("2026-09-28"), abertura("2026-10-20")],
      "2026-10-01",
    );
    expect(r?.data).toBe("2026-09-28");
  });

  it("ignora abertura posterior à ruptura", () => {
    const r = aberturaAntesDe([abertura("2026-10-20")], "2026-10-01");
    expect(r).toBeUndefined();
  });

  it("abertura no mesmo dia da ruptura conta", () => {
    // O forecast foi ligado e o item nasceu rompido no mesmo dia: é o caso
    // mais puro de "não houve prazo material para comprar".
    const r = aberturaAntesDe([abertura("2026-10-01")], "2026-10-01");
    expect(r?.data).toBe("2026-10-01");
  });

  it("sem abertura nenhuma devolve indefinido", () => {
    expect(aberturaAntesDe(undefined, "2026-10-01")).toBeUndefined();
    expect(aberturaAntesDe([], "2026-10-01")).toBeUndefined();
  });
});
