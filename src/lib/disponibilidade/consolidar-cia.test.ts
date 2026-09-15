import { describe, expect, it } from "vitest";

import { consolidarCia } from "./consultas";
import type { ContagemCia } from "./consultas";

/**
 * A coluna Cia do gráfico de disponibilidade.
 *
 * Este teste existe porque o invariante "Cia é a soma dos CDs" já tinha sido
 * verificado neste projeto — e o defeito passou assim mesmo. A verificação foi
 * feita contra a **consulta**, que estava certa; o erro morava no que a tela
 * montava a partir dela, com um `new Map(linhas.map(...))` em que a última
 * linha sobrescrevia as demais. A coluna mostrava 43 onde o correto era 1.790.
 *
 * A lição fica no formato do teste: ele exercita a função que a página chama,
 * não uma reimplementação da regra.
 */
function linha(
  faixa: string,
  curva: string,
  bu: string,
  analista: string,
  itens: number
): ContagemCia {
  return { faixa, curva, bu, analista, itens } as ContagemCia;
}

describe("consolidarCia", () => {
  // Duas curvas, duas BUs, dois analistas — a mesma faixa aparece várias vezes,
  // que é a situação real (91 linhas só na curva A).
  const contagens = [
    linha("zero", "A", "MED", "ANA", 10),
    linha("zero", "A", "MED", "JUAN", 20),
    linha("zero", "A", "MAT", "ANA", 30),
    linha("critico", "A", "MED", "ANA", 5),
    linha("critico", "A", "MAT", "JUAN", 7),
    linha("zero", "B", "MED", "ANA", 99),
  ];

  it("soma as linhas da mesma faixa, em vez de manter só a última", () => {
    const r = consolidarCia(contagens, { curva: "A" });

    // 10 + 20 + 30. Com `new Map(...)` daria 30 — o último valor.
    expect(r.get("zero")).toBe(60);
    expect(r.get("critico")).toBe(12);
  });

  it("não mistura curvas", () => {
    const r = consolidarCia(contagens, { curva: "A" });
    // Os 99 da curva B não podem entrar.
    expect(r.get("zero")).toBe(60);
  });

  it("aplica o filtro de BU", () => {
    const r = consolidarCia(contagens, { curva: "A", bu: "MED" });
    expect(r.get("zero")).toBe(30);
    expect(r.get("critico")).toBe(5);
  });

  it("aplica o filtro de analista", () => {
    // Era o que faltava: a coluna Cia ignorava o analista e seguia mostrando a
    // companhia inteira enquanto as barras dos CDs encolhiam.
    const r = consolidarCia(contagens, { curva: "A", analista: "ANA" });
    expect(r.get("zero")).toBe(40);
    expect(r.get("critico")).toBe(5);
  });

  it("aplica os dois filtros juntos", () => {
    const r = consolidarCia(contagens, { curva: "A", bu: "MAT", analista: "ANA" });
    expect(r.get("zero")).toBe(30);
    expect(r.get("critico")).toBeUndefined();
  });

  it("devolve vazio quando o recorte não existe", () => {
    expect(consolidarCia(contagens, { curva: "Z" }).size).toBe(0);
    expect(consolidarCia(contagens, { curva: "A", analista: "NINGUEM" }).size).toBe(0);
  });

  it("o total do recorte é a soma das faixas", () => {
    // O invariante que a tela depende: a coluna Cia de um recorte tem que valer
    // o mesmo que a soma das barras dos CDs daquele recorte.
    const r = consolidarCia(contagens, { curva: "A" });
    const total = [...r.values()].reduce((a, b) => a + b, 0);
    const esperado = contagens
      .filter((c) => c.curva === "A")
      .reduce((a, c) => a + c.itens, 0);

    expect(total).toBe(esperado);
  });
});
