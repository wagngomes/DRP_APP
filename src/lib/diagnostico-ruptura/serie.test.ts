import { describe, expect, it } from "vitest";

import {
  faixasSemEstoque,
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
    // Forecast de 310 em outubro, que tem 31 dias: 10/dia. Três dias
    // decorridos dão 30 previstos, não os 310 do mês inteiro.
    const pontos = [
      ponto("2026-10-01", 12),
      ponto("2026-10-02", 8),
      ponto("2026-10-03", 10),
    ];
    const meses = mesesDaJanela(pontos, "2026-10-03", 310, 310);

    expect(meses).toHaveLength(1);
    expect(meses[0]).toMatchObject({ previsto: 30, real: 30, corrente: true });
  });

  /**
   * A razão de o ritmo não usar o `forecast / 30` do resto do sistema.
   *
   * O rótulo da linha mostra o forecast no último dia do mês, e a linha tem de
   * pousar nele. Com trinta fixo, num mês de 31 dias ela terminaria 3,3% acima
   * — e o número ao lado do ponto não seria o forecast que a pessoa conhece.
   */
  it("o forecast distribuído pelos dias do mês fecha exatamente no forecast", () => {
    const outubro = mesesDaJanela([ponto("2026-10-01", 0)], "2026-10-01", 310, 0);
    expect(outubro[0].diasDoMes).toBe(31);
    expect(outubro[0].consumoDiario * outubro[0].diasDoMes).toBeCloseTo(310, 6);
    expect(outubro[0].forecastDoMes).toBe(310);

    const setembro = mesesDaJanela([ponto("2026-09-01", 0)], "2026-09-01", 300, 0);
    expect(setembro[0].diasDoMes).toBe(30);
    expect(setembro[0].consumoDiario * setembro[0].diasDoMes).toBeCloseTo(300, 6);
  });

  it("cada mês é medido contra o forecast que valia nele", () => {
    const pontos = [
      ponto("2026-09-29", 5),
      ponto("2026-09-30", 5),
      ponto("2026-10-01", 100),
    ];
    // Setembro: 600 em 30 dias = 20/dia. Outubro: 310 em 31 = 10/dia.
    const meses = mesesDaJanela(pontos, "2026-10-01", 310, 600);

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
    const meses = mesesDaJanela(pontos, "2026-10-02", 310, 310);

    expect(meses[0]).toMatchObject({ real: 20, previsto: 20 });
  });

  it("dia sem venda conta no previsto, porque o dia existiu", () => {
    // Posição rompida não vende, e é isso que o desvio tem de mostrar:
    // previsto cheio, realizado zero.
    const meses = mesesDaJanela(
      [ponto("2026-10-01", 0), ponto("2026-10-02", 0)],
      "2026-10-02",
      310,
      310,
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

describe("faixasSemEstoque", () => {
  /**
   * O caso que fez esta função existir.
   *
   * Zerado no dia 4 e zerado no dia 8, com três dias sem importação no meio: o
   * agrupamento ingênuo via duas rupturas de quatro dias e afirmava uma
   * recuperação que ninguém observou — além de discordar dos nove dias que o
   * próprio diagnóstico atribuiu ao evento.
   */
  it("carrega a ruptura através do buraco de carga", () => {
    const pontos = [
      ponto("2026-09-01", 0, 0),
      ponto("2026-09-02", 0, 0),
      ponto("2026-09-03", 0),
      ponto("2026-09-04", 0),
      ponto("2026-09-05", 0, 0),
    ];
    const faixas = faixasSemEstoque(pontos, "2026-09-05");

    expect(faixas).toEqual([{ de: 0, ate: 4 }]);
  });

  it("estoque de volta fecha a faixa", () => {
    const pontos = [
      ponto("2026-09-01", 0, 0),
      ponto("2026-09-02", 0, 500),
      ponto("2026-09-03", 0, 0),
    ];
    expect(faixasSemEstoque(pontos, "2026-09-03")).toEqual([
      { de: 0, ate: 0 },
      { de: 2, ate: 2 },
    ]);
  });

  it("carrega até a data de referência, mesmo sem carga nos últimos dias", () => {
    // É o que faz o gráfico contar os mesmos dias que a tabela: o motor conta
    // até a referência, e parar na última carga mostraria dois dias a menos.
    const pontos = [
      ponto("2026-10-08", 0, 0),
      ponto("2026-10-09", 0),
      ponto("2026-10-10", 0),
    ];
    expect(faixasSemEstoque(pontos, "2026-10-10")).toEqual([
      { de: 0, ate: 2 },
    ]);
  });

  it("não avança sobre o futuro projetado", () => {
    // Projeção zerada é alerta, não ruptura consumada: pintar a faixa ali
    // diria que a prateleira já está vazia num dia que ainda não chegou.
    const pontos = [
      ponto("2026-10-11", 0, 0),
      ponto("2026-10-12", 0, 0),
      ponto("2026-10-13", 0),
      ponto("2026-10-14", 0),
    ];
    expect(faixasSemEstoque(pontos, "2026-10-12")).toEqual([{ de: 0, ate: 1 }]);
  });

  it("sem nenhum dia medido não desenha faixa nenhuma", () => {
    const pontos = dias("2026-10-01", 3).map((d) => ponto(d, 0));
    expect(faixasSemEstoque(pontos, "2026-10-03")).toEqual([]);
  });
});
