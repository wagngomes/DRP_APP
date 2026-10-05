import { describe, expect, it } from "vitest";

import { fracaoDaJanela } from "@/lib/aceleracao/consultas";

/**
 * A fração da janela, que passou a comandar o índice de aceleração.
 *
 * Antes da troca de fonte, a fração vinha do calendário: o vendido saía do
 * acumulado do ERP, que não conhece corte nenhum. Agora o vendido vem do
 * histórico recortado em 1..diaCorte, e a fração tem de descrever esse mesmo
 * recorte — as duas pontas da divisão precisam falar dos mesmos dias.
 *
 * O caso que justifica o arquivo é o dia zero. Ele acontece na virada do mês,
 * quando a venda do dia 1 ainda não foi importada, e não é hipotético: a tela
 * já quebrou nessa fronteira antes, mostrando o mês anterior inteiro como se
 * fosse o corrente. Sem a guarda, `vendido / forecast / 0` devolve infinito para
 * todos os itens de uma vez.
 */
describe("fracaoDaJanela", () => {
  it("devolve zero quando não há dia com venda no mês", () => {
    // O corte zero é o estado real da virada do mês, não um valor defensivo.
    expect(fracaoDaJanela("2026-10", 0)).toBe(0);
  });

  it("nunca devolve valor que torne a divisão infinita", () => {
    for (const dia of [-5, -1, 0]) {
      expect(fracaoDaJanela("2026-09", dia)).toBe(0);
    }
  });

  it("usa o tamanho real do mês, não 30 fixo", () => {
    // Fevereiro tem 28 dias em 2026: o dia 14 é metade do mês, não 14/30.
    expect(fracaoDaJanela("2026-02", 14)).toBeCloseTo(0.5, 10);
    expect(fracaoDaJanela("2026-01", 14)).toBeCloseTo(14 / 31, 10);
    expect(fracaoDaJanela("2026-09", 11)).toBeCloseTo(11 / 30, 10);
  });

  it("satura em 1 no último dia e não passa disso", () => {
    expect(fracaoDaJanela("2026-09", 30)).toBe(1);
    expect(fracaoDaJanela("2026-02", 28)).toBe(1);
    // Mês cheio consultado com corte maior que o calendário: continua 1.
    expect(fracaoDaJanela("2026-02", 31)).toBe(1);
  });

  it("monta o dia com dois dígitos", () => {
    // `2026-09-1` não é data ISO; se o padStart sumir, o teste pega.
    expect(fracaoDaJanela("2026-09", 1)).toBeCloseTo(1 / 30, 10);
    expect(fracaoDaJanela("2026-09", 9)).toBeCloseTo(9 / 30, 10);
  });

  it("cresce com o dia dentro do mesmo mês", () => {
    const serie = [1, 5, 10, 15, 20, 25, 30].map((d) =>
      fracaoDaJanela("2026-09", d),
    );
    for (let i = 1; i < serie.length; i++) {
      expect(serie[i]).toBeGreaterThan(serie[i - 1]);
    }
  });
});
