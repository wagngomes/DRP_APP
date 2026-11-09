import { describe, expect, it } from "vitest";

import { resolverJanela } from "./novas-aberturas";

/**
 * A janela de comparação das novas aberturas.
 *
 * O que estes testes guardam é o que o usuário percebe: a data escolhida no
 * calendário quase nunca é uma carga — fim de semana, feriado, um dia em que
 * ninguém importou — e cair na carga errada muda a lista inteira sem nenhum
 * aviso na tela.
 *
 * As cargas chegam da mais recente para a mais antiga, como o SQL as devolve.
 */
const CARGAS = [
  "2026-10-29",
  "2026-10-27",
  "2026-10-26",
  "2026-10-23",
  "2026-10-21",
  "2026-10-01",
];

describe("resolverJanela", () => {
  it("sem datas, abre numa janela de ~30 dias e não no último par", () => {
    // Medido nesta base: entre cargas consecutivas o resultado é zero em 7 dos
    // 10 pares de outubro, porque forecast novo entra em lote. O padrão do par
    // mais recente seria verdadeiro e inútil.
    expect(resolverJanela(CARGAS, undefined, undefined)).toEqual({
      de: "2026-10-01",
      ate: "2026-10-29",
    });
  });

  it("a janela padrão não ultrapassa os 30 dias", () => {
    // 20/09 está fora da janela de 30 dias contada de 29/10; a escolhida tem
    // de ser a mais antiga **dentro** dela.
    const comAntiga = [...CARGAS, "2026-09-20", "2026-08-11"];
    expect(resolverJanela(comAntiga, undefined, undefined)).toEqual({
      de: "2026-10-01",
      ate: "2026-10-29",
    });
  });

  it("quando nenhuma carga alcança a janela, usa a anterior ao fim", () => {
    // Base recém-criada, com duas cargas distantes: melhor comparar o par que
    // existe do que não mostrar nada.
    expect(resolverJanela(["2026-10-29", "2026-05-02"], undefined, undefined)).toEqual({
      de: "2026-05-02",
      ate: "2026-10-29",
    });
  });

  it("cai na carga mais recente até a data pedida", () => {
    // 28/10 não é carga; vale a de 27/10. Sem isso, escolher um sábado
    // devolveria lista vazia em vez do resultado da sexta.
    expect(resolverJanela(CARGAS, "2026-10-22", "2026-10-28")).toEqual({
      de: "2026-10-21",
      ate: "2026-10-27",
    });
  });

  it("usa a carga exata quando a data escolhida é uma", () => {
    expect(resolverJanela(CARGAS, "2026-10-01", "2026-10-29")).toEqual({
      de: "2026-10-01",
      ate: "2026-10-29",
    });
  });

  it("o início nunca alcança o fim, mesmo pedindo a mesma data", () => {
    // Comparar uma carga com ela mesma não produz abertura nenhuma; o certo é
    // recuar para a anterior e mostrar algo verdadeiro.
    expect(resolverJanela(CARGAS, "2026-10-29", "2026-10-29")).toEqual({
      de: "2026-10-27",
      ate: "2026-10-29",
    });
  });

  it("início posterior ao fim recua para a carga anterior ao fim", () => {
    expect(resolverJanela(CARGAS, "2026-10-29", "2026-10-23")).toEqual({
      de: "2026-10-21",
      ate: "2026-10-23",
    });
  });

  it("data final anterior a toda carga não tem o que comparar", () => {
    expect(resolverJanela(CARGAS, undefined, "2025-01-01")).toBeNull();
  });

  it("sem duas cargas não há comparação possível", () => {
    expect(resolverJanela(["2026-10-29"], undefined, undefined)).toBeNull();
    expect(resolverJanela([], undefined, undefined)).toBeNull();
  });

  it("a carga mais antiga como fim não deixa início disponível", () => {
    // Não há nada antes de 01/10 para comparar; melhor dizer que não dá do que
    // inventar uma janela que não existe.
    expect(resolverJanela(CARGAS, undefined, "2026-10-01")).toBeNull();
  });
});
