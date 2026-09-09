import { describe, expect, it } from "vitest";

import { parseRotaCompra, resolverPercursoCompra } from "./rota-compra";

/**
 * A rota de compra usa um formato diferente do das transferências — códigos
 * separados por "->" contra siglas separadas por ">". Confundir os dois foi um
 * erro real neste projeto, e é o tipo de coisa que passa despercebida porque
 * produz uma data errada com aparência de calculada.
 */
describe("parseRotaCompra", () => {
  it("quebra a rota por '->' e normaliza zeros à esquerda", () => {
    expect(parseRotaCompra("001015->001006")).toEqual(["1015", "1006"]);
  });

  it("aceita rota de um único ponto, que é entrega direta", () => {
    expect(parseRotaCompra("1036")).toEqual(["1036"]);
  });

  it("devolve lista vazia quando não há rota", () => {
    expect(parseRotaCompra(null)).toEqual([]);
    expect(parseRotaCompra("")).toEqual([]);
  });

  it("não quebra pelo separador das transferências", () => {
    // "DF2 > CAJ" é formato de transferência. Dividir por ">" aqui deixaria
    // "1015-" no primeiro elemento e produziria um CD inexistente.
    expect(parseRotaCompra("1015->1006")).toHaveLength(2);
    expect(parseRotaCompra("1015->1006")[0]).toBe("1015");
  });
});

describe("resolverPercursoCompra", () => {
  it("monta as pernas na ordem, do fornecedor ao CD de destino", () => {
    const p = resolverPercursoCompra("1036->1006->1015", "1015");
    expect(p).not.toBeNull();
    expect(p!.primeiroCd).toBe("1036");
    expect(p!.pernas).toEqual([
      { de: "1036", para: "1006" },
      { de: "1006", para: "1015" },
    ]);
    expect(p!.direto).toBe(false);
  });

  it("trata rota de um ponto como entrega direta, sem pernas", () => {
    const p = resolverPercursoCompra("1036", "1036");
    expect(p!.direto).toBe(true);
    expect(p!.pernas).toEqual([]);
  });

  it("marca como inconsistente quando a rota não termina no CD da posição", () => {
    // Acontece em 169 das 15 mil linhas do forecast. Completar a rota com uma
    // perna inventada daria uma data errada parecendo certa — então cai para
    // entrega direta e fica sinalizado.
    const p = resolverPercursoCompra("1036->1006", "1021");
    expect(p!.inconsistente).toBe("rota_nao_termina_no_cd");
    expect(p!.direto).toBe(true);
    expect(p!.primeiroCd).toBe("1021");
  });

  it("devolve null quando não há rota cadastrada", () => {
    expect(resolverPercursoCompra(null, "1006")).toBeNull();
  });
});
