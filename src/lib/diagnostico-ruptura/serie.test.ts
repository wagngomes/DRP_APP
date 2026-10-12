import { describe, expect, it } from "vitest";

import { mesesDaJanela } from "@/lib/diagnostico-ruptura/serie";
import type { PontoSerie } from "@/lib/diagnostico-ruptura/serie";

/**
 * Forecast contra venda, por mês da janela.
 *
 * A única conta de `serie.ts` que não é SQL — e a que erra calado se ninguém
 * olhar: comparar nove dias de venda com o forecast de trinta diria que a
 * venda desabou em todo item, todo mês, e o gráfico pintaria um desvio de −70%
 * em posição nenhuma.
 */
const ponto = (data: string, venda: number): PontoSerie => ({
  data,
  estoque: 100,
  venda,
});

describe("mesesDaJanela", () => {
  it("o previsto de um mês parcial é proporcional aos dias desenhados", () => {
    // Três dias de setembro, a 10/dia de consumo: 30 previstos, não 300.
    const meses = mesesDaJanela(
      [
        ponto("2026-09-01", 12),
        ponto("2026-09-02", 8),
        ponto("2026-09-03", 10),
      ],
      10,
    );

    expect(meses).toHaveLength(1);
    expect(meses[0].previsto).toBe(30);
    expect(meses[0].real).toBe(30);
  });

  it("separa os meses da janela e mantém a ordem do calendário", () => {
    const meses = mesesDaJanela(
      [
        ponto("2026-08-30", 5),
        ponto("2026-08-31", 5),
        ponto("2026-09-01", 100),
      ],
      10,
    );

    expect(meses.map((m) => m.mes)).toEqual(["2026-08", "2026-09"]);
    expect(meses[0]).toMatchObject({ real: 10, previsto: 20 });
    expect(meses[1]).toMatchObject({ real: 100, previsto: 10 });
  });

  it("dia sem venda conta no previsto, porque o dia existiu", () => {
    // Posição rompida não vende, e é justamente isso que o desvio tem de
    // mostrar: previsto cheio, realizado zero.
    const meses = mesesDaJanela(
      [ponto("2026-09-01", 0), ponto("2026-09-02", 0)],
      10,
    );
    expect(meses[0]).toMatchObject({ real: 0, previsto: 20 });
  });

  it("sem forecast o previsto é zero, e não uma divisão por nada", () => {
    const meses = mesesDaJanela([ponto("2026-09-01", 7)], 0);
    expect(meses[0]).toMatchObject({ real: 7, previsto: 0 });
  });
});
