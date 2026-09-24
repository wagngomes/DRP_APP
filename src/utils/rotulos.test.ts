import { describe, expect, it } from "vitest";

import { agruparPorRotulo, chaveRotulo } from "./rotulos";

describe("chaveRotulo", () => {
  it("ignora acento e caixa", () => {
    expect(chaveRotulo("Reportado no último forecast")).toBe(
      chaveRotulo("Reportado no ultimo forecast")
    );
  });

  it("ignora palavras de ligação", () => {
    expect(chaveRotulo("Adicional de Contratos")).toBe(chaveRotulo("Adicional Contratos"));
  });

  it("ignora a ordem das palavras", () => {
    // "Acordo Novo" e "Novo Acordo" convivem na mesma coluna.
    expect(chaveRotulo("Acordo Novo")).toBe(chaveRotulo("Novo Acordo"));
  });

  it("não junta rótulos que são de fato diferentes", () => {
    expect(chaveRotulo("Contratos")).not.toBe(chaveRotulo("Adicional Contratos"));
    expect(chaveRotulo("Spot")).not.toBe(chaveRotulo("Operadoras"));
  });
});

describe("agruparPorRotulo", () => {
  const linhas = [
    { d: "Adicional de Contratos", q: 10 },
    { d: "Adicional de Contratos", q: 5 },
    { d: "Adicional Contratos", q: 7 },
    { d: "Spot", q: 100 },
  ];

  it("soma as variantes num grupo só", () => {
    const r = agruparPorRotulo(linhas, (l) => l.d, (l) => l.q);
    expect(r).toHaveLength(2);
    expect(r.find((x) => x.rotulo.startsWith("Adicional"))!.valor).toBe(22);
  });

  it("exibe a grafia mais frequente", () => {
    const r = agruparPorRotulo(linhas, (l) => l.d, (l) => l.q);
    expect(r.find((x) => x.rotulo.startsWith("Adicional"))!.rotulo).toBe("Adicional de Contratos");
  });

  it("conta ocorrências, não valor, para escolher a grafia", () => {
    // A grafia rara numa linha de valor alto não deve virar o nome do grupo:
    // quem lê a tela reconhece o que a equipe escreve, não o que soma mais.
    const r = agruparPorRotulo(
      [
        { d: "Acordo novo", q: 1 },
        { d: "Acordo novo", q: 1 },
        { d: "Novo Acordo", q: 9999 },
      ],
      (l) => l.d,
      (l) => l.q
    );
    expect(r[0].rotulo).toBe("Acordo novo");
    expect(r[0].valor).toBe(10001);
  });

  it("descarta rótulo vazio em vez de criar um grupo sem nome", () => {
    const r = agruparPorRotulo([{ d: "  ", q: 5 }, { d: "Spot", q: 1 }], (l) => l.d, (l) => l.q);
    expect(r).toHaveLength(1);
  });
});
