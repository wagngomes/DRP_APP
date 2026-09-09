import { describe, expect, it } from "vitest";

import { chaveSla, parseRota, somarDiasUteis, subtrairDiasUteis } from "./projecao-transferencias";

/**
 * Aritmética de dias úteis: é a base de toda data projetada do sistema. Um erro
 * de um dia aqui desloca a chegada de cada pedido e transferência, e não há como
 * perceber olhando a tela — o número continua plausível.
 */
describe("somarDiasUteis", () => {
  const seg = (dia: number) => new Date(Date.UTC(2026, 8, dia)); // setembro/2026

  it("pula o fim de semana", () => {
    // Sexta 11/09 + 1 dia útil = segunda 14/09, não sábado 12.
    expect(somarDiasUteis(seg(11), 1).toISOString().slice(0, 10)).toBe("2026-09-14");
  });

  it("atravessa dois fins de semana em uma semana e meia", () => {
    // Sexta 11/09 + 6 dias úteis = 21/09 (segunda da semana seguinte à outra).
    expect(somarDiasUteis(seg(11), 6).toISOString().slice(0, 10)).toBe("2026-09-21");
  });

  it("mantém a data quando o prazo é zero", () => {
    expect(somarDiasUteis(seg(11), 0).toISOString().slice(0, 10)).toBe("2026-09-11");
  });

  it("trata prazo negativo como zero, sem andar para trás", () => {
    expect(somarDiasUteis(seg(11), -3).toISOString().slice(0, 10)).toBe("2026-09-11");
  });

  it("não altera a data recebida", () => {
    const original = seg(11);
    somarDiasUteis(original, 5);
    expect(original.toISOString().slice(0, 10)).toBe("2026-09-11");
  });
});

describe("subtrairDiasUteis", () => {
  it("volta pulando o fim de semana", () => {
    // Segunda 14/09 − 1 dia útil = sexta 11/09.
    const segunda = new Date(Date.UTC(2026, 8, 14));
    expect(subtrairDiasUteis(segunda, 1).toISOString().slice(0, 10)).toBe("2026-09-11");
  });

  it("é o inverso de somar, ida e volta", () => {
    const inicio = new Date(Date.UTC(2026, 8, 9));
    const ida = somarDiasUteis(inicio, 7);
    expect(subtrairDiasUteis(ida, 7).toISOString().slice(0, 10)).toBe("2026-09-09");
  });
});

describe("parseRota", () => {
  it("quebra a rota de transferência por '>' e limpa espaços", () => {
    expect(parseRota("DF2 > CAJ > ES > LDA")).toEqual(["DF2", "CAJ", "ES", "LDA"]);
  });

  it("devolve vazio para transferência simples, marcada com '-'", () => {
    expect(parseRota("-")).toEqual([]);
    expect(parseRota(null)).toEqual([]);
  });
});

describe("chaveSla", () => {
  it("é direcional: ida e volta são pares diferentes", () => {
    // O tempo de 1006 para 1015 não é necessariamente o mesmo de 1015 para
    // 1006, então a chave não pode ser simétrica.
    expect(chaveSla("1006", "1015")).not.toBe(chaveSla("1015", "1006"));
  });
});
