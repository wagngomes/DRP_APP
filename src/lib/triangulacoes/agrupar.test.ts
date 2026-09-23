import { describe, expect, it } from "vitest";

import { agruparPorDestino, SEM_CD_FINAL } from "./consultas";
import type { LinhaTriangulacao } from "./consultas";

/**
 * As agregações da hierarquia de três níveis.
 *
 * O que estes testes guardam é conservação: o total de um nível tem que ser a
 * soma do nível abaixo. Numa tela com produto → CD → documento, um erro de
 * agrupamento não aparece como número errado — aparece como número que só não
 * fecha quando alguém soma à mão.
 */
function linha(p: Partial<LinhaTriangulacao> = {}): LinhaTriangulacao {
  return {
    id: 1,
    codigo: "1",
    origem: "transferencia",
    documento: "NF1",
    quantidade: 10,
    valor: 100,
    rota: "A > B",
    origemAtual: "1006",
    dataEmissao: null,
    inicio: "saída",
    etapas: [],
    cdFinal: "1036",
    chegadaFinal: null,
    reprojetada: false,
    ...p,
  };
}

describe("agruparPorDestino", () => {
  it("separa por CD final e soma dentro de cada um", () => {
    const r = agruparPorDestino([
      linha({ id: 1, cdFinal: "1036", quantidade: 10, valor: 100 }),
      linha({ id: 2, cdFinal: "1036", quantidade: 5, valor: 50 }),
      linha({ id: 3, cdFinal: "1006", quantidade: 20, valor: 200 }),
    ]);

    expect(r.map((d) => d.filial)).toEqual(["1006", "1036"]);
    expect(r.find((d) => d.filial === "1036")!.quantidade).toBe(15);
    expect(r.find((d) => d.filial === "1036")!.valorTransferencia).toBe(150);
  });

  it("mantém os valores separados por origem", () => {
    // Os dois vêm de colunas diferentes — nota fiscal contra saldo de pedido —
    // e somá-los produziria um número sem significado.
    const r = agruparPorDestino([
      linha({ id: 1, origem: "transferencia", valor: 100 }),
      linha({ id: 2, origem: "compra", valor: 700 }),
    ]);

    expect(r[0].valorTransferencia).toBe(100);
    expect(r[0].valorCompra).toBe(700);
  });

  it("não perde linha sem CD final resolvido", () => {
    // Sigla fora do cadastro de filiais deixa `cdFinal` nulo. Se a linha
    // sumisse, o total do produto deixaria de bater com a soma dos destinos —
    // e a diferença não teria explicação visível na tela.
    const r = agruparPorDestino([
      linha({ id: 1, cdFinal: "1036", quantidade: 10 }),
      linha({ id: 2, cdFinal: null, quantidade: 7 }),
    ]);

    expect(r.reduce((a, d) => a + d.quantidade, 0)).toBe(17);
    // O mesmo rótulo do filtro de CD final, senão o chip "Sem rota" recortaria
    // um grupo que a hierarquia nomeia de outro jeito.
    expect(r.some((d) => d.filial === SEM_CD_FINAL)).toBe(true);
  });

  it("ordena pelo que mais chega", () => {
    const r = agruparPorDestino([
      linha({ id: 1, cdFinal: "1006", quantidade: 5 }),
      linha({ id: 2, cdFinal: "1036", quantidade: 90 }),
    ]);
    expect(r[0].filial).toBe("1036");
  });
});
