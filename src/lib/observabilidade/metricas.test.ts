import { describe, expect, it } from "vitest";

import { rotularRota } from "./metricas";

/**
 * Normalização do rótulo de rota.
 *
 * É a defesa contra explosão de cardinalidade: sem ela, cada código de produto
 * vira uma série própria no Prometheus e o banco de métricas cresce sem limite
 * — o erro clássico de quem instrumenta HTTP pela primeira vez.
 */
describe("rotularRota", () => {
  it("troca código numérico por :id", () => {
    expect(rotularRota("/produto/203089")).toBe("/produto/:id");
  });

  it("troca identificador gerado por :id", () => {
    expect(rotularRota("/cenarios/cmtt4s3xe000024miuyh0eewv")).toBe("/cenarios/:id");
  });

  it("troca uuid por :id", () => {
    expect(rotularRota("/x/4519c1df-b4c9-4cd5-9cbd-6f9223661d1e")).toBe("/x/:id");
  });

  it("preserva segmentos que são nome de rota", () => {
    expect(rotularRota("/api/imports/pedidos_de_compra")).toBe("/api/imports/pedidos_de_compra");
    expect(rotularRota("/compras-urgentes")).toBe("/compras-urgentes");
  });

  it("mantém a raiz", () => {
    expect(rotularRota("/")).toBe("/");
  });

  it("colapsa os estáticos, que trazem hash no nome a cada build", () => {
    const rotulos = new Set(
      [
        "/_next/static/chunks/2j2b-75de4yo6.js",
        "/_next/static/chunks/3dsh51-kg-v5c.js",
        "/_next/static/media/797e433ab948586e-s.p.woff2",
      ].map(rotularRota)
    );
    expect(rotulos.size).toBe(1);
    expect([...rotulos][0]).toBe("/_next/static/*");
  });

  it("colapsa todos os produtos em uma única série", () => {
    const rotulos = new Set(
      ["/produto/1", "/produto/203089", "/produto/998645"].map(rotularRota)
    );
    expect(rotulos.size).toBe(1);
  });
});
