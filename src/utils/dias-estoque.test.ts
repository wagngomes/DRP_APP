import { describe, expect, it } from "vitest";

import { diasDeEstoque, faixaDe, FAIXAS, DIAS_NO_MES } from "./dias-estoque";

/**
 * Cobertura em dias e sua classificação em faixas. É a régua que o gráfico de
 * disponibilidade, a tela de fornecedores e o cockpit usam — se as três não
 * concordarem sobre o que é "vermelho", os números divergem entre telas, que
 * foi exatamente um erro real deste projeto.
 */
describe("diasDeEstoque", () => {
  it("divide o estoque pelo consumo diário do mês", () => {
    // 300 unidades com forecast de 300/mês = 30 dias.
    expect(diasDeEstoque(300, 300)).toBeCloseTo(DIAS_NO_MES, 5);
  });

  it("devolve zero quando não há estoque", () => {
    expect(diasDeEstoque(0, 300)).toBe(0);
  });

  it("devolve null sem forecast, em vez de dividir por zero", () => {
    // Sem previsão não existe cobertura em dias — e Infinity contaminaria
    // qualquer soma ou média feita depois.
    expect(diasDeEstoque(100, 0)).toBeNull();
  });
});

describe("faixaDe", () => {
  it("classifica cada região da régua", () => {
    expect(faixaDe(0)).toBe("zero");
    expect(faixaDe(5)).toBe("critico");
    expect(faixaDe(15)).toBe("baixo");
    expect(faixaDe(25)).toBe("adequado");
    expect(faixaDe(45)).toBe("alto");
    expect(faixaDe(120)).toBe("excesso");
  });

  it("usa limite inferior inclusivo e superior exclusivo", () => {
    // 10 dias é "baixo", não "critico"; 30 é "alto", não "adequado". Sem essa
    // convenção, um item cairia em duas faixas e as contagens não fechariam.
    expect(faixaDe(10)).toBe("baixo");
    expect(faixaDe(20)).toBe("adequado");
    expect(faixaDe(30)).toBe("alto");
    expect(faixaDe(60)).toBe("excesso");
  });

  it("trata estoque negativo como zerado", () => {
    expect(faixaDe(-5)).toBe("zero");
  });

  it("devolve null para ausência de dado", () => {
    expect(faixaDe(null)).toBeNull();
    expect(faixaDe(NaN)).toBeNull();
  });

  it("cobre a reta inteira sem buraco nem sobreposição", () => {
    // Toda cobertura possível cai em exatamente uma faixa.
    for (let d = 0; d <= 200; d += 0.5) {
      const faixa = faixaDe(d);
      expect(faixa).not.toBeNull();
      expect(FAIXAS.some((f) => f.id === faixa)).toBe(true);
    }
  });
});
