import { describe, expect, it } from "vitest";

import { destinoAtivo } from "./dashboard-shell";

/**
 * Qual item do menu acende em cada tela.
 *
 * Parece trivial e não é: `/triangulacoes` é prefixo de
 * `/triangulacoes/gerencial`, e a regra ingênua — primeiro item cujo caminho
 * bate — acenderia o pai estando no filho. Com os grupos, isso também abriria o
 * grupo errado.
 */
describe("destinoAtivo", () => {
  it("acende o destino exato", () => {
    expect(destinoAtivo("/raio-x")).toBe("/raio-x");
    expect(destinoAtivo("/console")).toBe("/console");
  });

  it("prefere o destino mais específico ao prefixo", () => {
    // O caso que motivou a ordenação por comprimento.
    expect(destinoAtivo("/triangulacoes/gerencial")).toBe(
      "/triangulacoes/gerencial",
    );
    expect(destinoAtivo("/triangulacoes")).toBe("/triangulacoes");
  });

  it("acende o pai numa rota filha que não é item do menu", () => {
    // `/produto/203087` não está no menu, mas é a tela de Produto.
    expect(destinoAtivo("/produto/203087")).toBe("/produto");
  });

  it("a raiz não vira prefixo de tudo", () => {
    // Sem o cuidado com "/", o Painel acenderia em todas as telas.
    expect(destinoAtivo("/")).toBe("/");
    expect(destinoAtivo("/cockpit")).toBe("/cockpit");
    expect(destinoAtivo("/fornecedores")).toBe("/fornecedores");
  });

  it("devolve nulo em tela fora do menu", () => {
    expect(destinoAtivo("/docs")).toBeNull();
    expect(destinoAtivo("/regressao")).toBeNull();
  });

  it("não confunde caminho que só começa igual", () => {
    // "/produtoX" não é filho de "/produto": a barra é obrigatória.
    expect(destinoAtivo("/produtos-especiais")).toBeNull();
  });
});
