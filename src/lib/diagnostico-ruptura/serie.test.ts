import { describe, expect, it } from "vitest";

import {
  mesesDaJanela,
  projetarEstoque,
  somarDias,
  type ChegadaSerie,
  type PontoSerie,
} from "@/lib/diagnostico-ruptura/serie";

/**
 * As duas contas de `serie.ts` que não são SQL.
 *
 * São as que erram calado se ninguém olhar: a projeção desenha uma linha que a
 * pessoa vai usar para decidir se precisa agir, e o ritmo compara venda com
 * previsão — comparar doze dias de venda com o forecast de trinta diria que a
 * venda desabou em todo item, todo mês.
 */
const ponto = (
  data: string,
  venda: number,
  estoque: number | null = null,
): PontoSerie => ({ data, estoque, projetado: null, venda });

const dias = (de: string, n: number) =>
  Array.from({ length: n }, (_, i) => somarDias(de, i));

describe("projetarEstoque", () => {
  it("consome o forecast diário a partir do último dia medido", () => {
    const pontos = [
      ponto("2026-10-10", 0, 100),
      ponto("2026-10-11", 0),
      ponto("2026-10-12", 0),
      ponto("2026-10-13", 0),
    ];
    projetarEstoque(pontos, "2026-10-10", 30, []);

    // O dia medido entra na projeção com o próprio valor: sem esse ponto em
    // comum a linha tracejada nasceria solta, a um dia da curva cheia.
    expect(pontos[0].projetado).toBe(100);
    expect(pontos[1].projetado).toBe(70);
    expect(pontos[2].projetado).toBe(40);
    expect(pontos[3].projetado).toBe(10);
  });

  it("soma a entrada prevista no dia dela", () => {
    const pontos = dias("2026-10-10", 4).map((d) => ponto(d, 0));
    pontos[0].estoque = 50;
    const previstas: ChegadaSerie[] = [
      {
        data: "2026-10-12",
        quantidade: 200,
        tipo: "compra",
        prevista: true,
      },
    ];
    projetarEstoque(pontos, "2026-10-10", 30, previstas);

    expect(pontos[1].projetado).toBe(20);
    // 20 − 30 daria −10; a chegada de 200 entra antes do consumo do dia.
    expect(pontos[2].projetado).toBe(190);
    expect(pontos[3].projetado).toBe(160);
  });

  /**
   * A regra que o replay do motor também usa: prateleira vazia não acumula
   * dívida. O que não se vendeu por falta de estoque não vira venda represada
   * quando a mercadoria chega, e uma projeção negativa desenharia a curva
   * abaixo do eixo — que não significa nada.
   */
  it("não desce de zero, e a entrada parte do zero e não do negativo", () => {
    const pontos = dias("2026-10-10", 5).map((d) => ponto(d, 0));
    pontos[0].estoque = 10;
    projetarEstoque(pontos, "2026-10-10", 30, [
      { data: "2026-10-14", quantidade: 60, tipo: "compra", prevista: true },
    ]);

    expect(pontos[1].projetado).toBe(0);
    expect(pontos[2].projetado).toBe(0);
    expect(pontos[3].projetado).toBe(0);
    // 0 + 60 − 30, e não 10 − 120 + 60.
    expect(pontos[4].projetado).toBe(30);
  });

  it("sem nenhum dia medido não projeta nada, em vez de partir do zero", () => {
    const pontos = dias("2026-10-10", 3).map((d) => ponto(d, 0));
    projetarEstoque(pontos, "2026-10-10", 30, []);
    expect(pontos.every((p) => p.projetado === null)).toBe(true);
  });
});

describe("mesesDaJanela", () => {
  it("o previsto do mês corrente é proporcional aos dias já decorridos", () => {
    // Três dias de outubro, a 10/dia: 30 previstos, não 300.
    const pontos = [
      ponto("2026-10-01", 12),
      ponto("2026-10-02", 8),
      ponto("2026-10-03", 10),
    ];
    const meses = mesesDaJanela(pontos, "2026-10-03", 10, 10);

    expect(meses).toHaveLength(1);
    expect(meses[0]).toMatchObject({ previsto: 30, real: 30, corrente: true });
  });

  it("cada mês é medido contra o forecast que valia nele", () => {
    const pontos = [
      ponto("2026-09-29", 5),
      ponto("2026-09-30", 5),
      ponto("2026-10-01", 100),
    ];
    // Setembro a 20/dia, outubro a 10/dia.
    const meses = mesesDaJanela(pontos, "2026-10-01", 10, 20);

    expect(meses.map((m) => m.mes)).toEqual(["2026-09", "2026-10"]);
    expect(meses[0]).toMatchObject({ real: 10, previsto: 40, corrente: false });
    expect(meses[1]).toMatchObject({ real: 100, previsto: 10, corrente: true });
  });

  it("dia futuro não entra no realizado nem no previsto", () => {
    // O mês vai até o dia 31 no gráfico, mas só 2 dias aconteceram. Contar os
    // 29 restantes afundaria o percentual de todo mês corrente.
    const pontos = dias("2026-10-01", 31).map((d) => ponto(d, 0));
    pontos[0].venda = 10;
    pontos[1].venda = 10;
    const meses = mesesDaJanela(pontos, "2026-10-02", 10, 10);

    expect(meses[0]).toMatchObject({ real: 20, previsto: 20 });
  });

  it("dia sem venda conta no previsto, porque o dia existiu", () => {
    // Posição rompida não vende, e é isso que o desvio tem de mostrar:
    // previsto cheio, realizado zero.
    const meses = mesesDaJanela(
      [ponto("2026-10-01", 0), ponto("2026-10-02", 0)],
      "2026-10-02",
      10,
      10,
    );
    expect(meses[0]).toMatchObject({ real: 0, previsto: 20 });
  });
});

describe("somarDias", () => {
  it("atravessa a virada do mês e a do ano", () => {
    expect(somarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(somarDias("2026-10-01", -1)).toBe("2026-09-30");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
  });
});
