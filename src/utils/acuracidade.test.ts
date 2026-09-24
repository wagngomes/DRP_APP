import { describe, expect, it } from "vitest";

import { acuracidade, erroAbsoluto, faixaAcuracidade, vies, wmape } from "./acuracidade";

describe("erroAbsoluto", () => {
  it("mede o erro sobre o realizado, não sobre o previsto", () => {
    // Previu 80, vendeu 100: errou 20 de 100 = 20%. Pelo previsto daria 25% e
    // a previsão pareceria pior ou melhor conforme o lado em que errou.
    expect(erroAbsoluto({ previsto: 80, realizado: 100 })).toBeCloseTo(0.2);
    expect(erroAbsoluto({ previsto: 120, realizado: 100 })).toBeCloseTo(0.2);
  });

  it("devolve null quando não houve realizado", () => {
    // Não existe percentual de zero. Devolver 100% ou infinito seria inventar.
    expect(erroAbsoluto({ previsto: 50, realizado: 0 })).toBeNull();
  });

  it("acerto exato é erro zero", () => {
    expect(erroAbsoluto({ previsto: 100, realizado: 100 })).toBe(0);
  });
});

describe("vies", () => {
  it("é positivo quando se previu mais do que se vendeu", () => {
    expect(vies({ previsto: 120, realizado: 100 })).toBeCloseTo(0.2);
    expect(vies({ previsto: 80, realizado: 100 })).toBeCloseTo(-0.2);
  });

  it("distingue o que o erro absoluto confunde", () => {
    // Os dois erram 20%; só o viés diz que um sobra e o outro falta.
    const sobra = { previsto: 120, realizado: 100 };
    const falta = { previsto: 80, realizado: 100 };
    expect(erroAbsoluto(sobra)).toEqual(erroAbsoluto(falta));
    expect(vies(sobra)).not.toEqual(vies(falta));
  });
});

describe("wmape", () => {
  it("pondera pelo volume, não pela contagem de itens", () => {
    // Item grande acerta em cheio, item pequeno erra feio. A média simples dos
    // erros daria 50%; o WMAPE dá 1%, que é o tamanho real do problema.
    const pares = [
      { previsto: 1000, realizado: 1000 },
      { previsto: 5, realizado: 10 },
    ];
    expect(wmape(pares)).toBeCloseTo(5 / 1010);
  });

  it("absorve realizado zero sem estourar", () => {
    // O par de realizado zero entra no numerador — o erro é real — sem dividir
    // por zero, que é o que quebra o MAPE clássico.
    const r = wmape([
      { previsto: 30, realizado: 0 },
      { previsto: 100, realizado: 100 },
    ]);
    expect(r).toBeCloseTo(0.3);
  });

  it("devolve null quando nada foi realizado", () => {
    expect(wmape([{ previsto: 10, realizado: 0 }])).toBeNull();
    expect(wmape([])).toBeNull();
  });
});

describe("acuracidade", () => {
  it("é o complemento do erro", () => {
    expect(acuracidade(0.2)).toBeCloseTo(0.8);
  });

  it("não fica negativa", () => {
    // Errar 150% viraria "-50% de acerto", que não diz nada a quem lê.
    expect(acuracidade(1.5)).toBe(0);
  });

  it("propaga a ausência de medida", () => {
    expect(acuracidade(null)).toBeNull();
  });
});

describe("faixaAcuracidade", () => {
  it("classifica nos cortes usuais de planejamento", () => {
    expect(faixaAcuracidade(0.85)).toBe("boa");
    expect(faixaAcuracidade(0.8)).toBe("boa");
    expect(faixaAcuracidade(0.7)).toBe("razoavel");
    expect(faixaAcuracidade(0.59)).toBe("ruim");
    expect(faixaAcuracidade(null)).toBe("sem");
  });
});
