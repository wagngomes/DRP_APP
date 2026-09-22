import { describe, expect, it } from "vitest";

import { agruparPorDestino, agruparPorFornecedor, SEM_CD_FINAL } from "./consultas";
import type { LinhaTriangulacao, ProdutoTriangulando } from "./consultas";

/**
 * As agregações da hierarquia de quatro níveis.
 *
 * O que estes testes guardam é conservação: o total de um nível tem que ser a
 * soma do nível abaixo. Numa tela com fornecedor → produto → CD → documento,
 * um erro de agrupamento não aparece como número errado — aparece como número
 * que só não fecha quando alguém soma à mão.
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

function produto(p: Partial<ProdutoTriangulando> = {}): ProdutoTriangulando {
  const linhas = p.linhas ?? [linha()];
  return {
    codigo: "1",
    descricao: "Item",
    fornecedor: "ACME",
    linhas,
    quantidade: linhas.reduce((a, l) => a + l.quantidade, 0),
    valorTransferencia: 0,
    valorCompra: 0,
    destinos: [],
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

describe("agruparPorFornecedor", () => {
  const produtos = [
    produto({
      codigo: "A",
      fornecedor: "ACME",
      linhas: [linha({ id: 1, quantidade: 10, valor: 100 })],
    }),
    produto({
      codigo: "B",
      fornecedor: "ACME",
      linhas: [linha({ id: 2, origem: "compra", quantidade: 20, valor: 500 })],
    }),
    produto({
      codigo: "C",
      fornecedor: "OUTRO",
      linhas: [linha({ id: 3, quantidade: 5, valor: 50 })],
    }),
  ];

  it("agrupa e soma pelos documentos, não pelos produtos", () => {
    const r = agruparPorFornecedor(produtos);
    const acme = r.find((f) => f.fornecedor === "ACME")!;

    expect(acme.produtos).toHaveLength(2);
    expect(acme.documentos).toBe(2);
    expect(acme.quantidade).toBe(30);
    expect(acme.valorTransferencia).toBe(100);
    expect(acme.valorCompra).toBe(500);
  });

  it("conserva o total: fornecedor é a soma dos produtos", () => {
    const r = agruparPorFornecedor(produtos);
    for (const f of r) {
      const soma = f.produtos.flatMap((p) => p.linhas).reduce((a, l) => a + l.quantidade, 0);
      expect(f.quantidade).toBe(soma);
    }
  });

  it("conserva o total também no terceiro nível", () => {
    // O invariante completo da tela: fornecedor = soma dos produtos, e produto
    // = soma dos destinos.
    const r = agruparPorFornecedor(produtos);
    for (const f of r) {
      for (const p of f.produtos) {
        const destinos = agruparPorDestino(p.linhas);
        const soma = destinos.reduce((a, d) => a + d.quantidade, 0);
        expect(soma).toBe(p.linhas.reduce((a, l) => a + l.quantidade, 0));
      }
    }
  });

  it("ordena pelo maior valor em transferência", () => {
    const r = agruparPorFornecedor([
      produto({ fornecedor: "POUCO", linhas: [linha({ id: 1, valor: 10, quantidade: 900 })] }),
      produto({ fornecedor: "MUITO", linhas: [linha({ id: 2, valor: 5000, quantidade: 1 })] }),
    ]);
    // Pelo valor, não pela quantidade: POUCO move mais caixa, MUITO move mais
    // dinheiro, e é o dinheiro em trânsito que decide a ordem.
    expect(r.map((f) => f.fornecedor)).toEqual(["MUITO", "POUCO"]);
  });

  it("desempata pelo valor de compra, sem somar as duas origens", () => {
    // Sem transferência nenhuma, os dois empatam em zero. O valor de compra
    // decide — assim quem só triangula compra fica ordenado entre os pares, em
    // vez de cair no fim da lista.
    const r = agruparPorFornecedor([
      produto({
        fornecedor: "MENOR",
        linhas: [linha({ id: 1, origem: "compra", valor: 100 })],
      }),
      produto({
        fornecedor: "MAIOR",
        linhas: [linha({ id: 2, origem: "compra", valor: 900 })],
      }),
    ]);
    expect(r.map((f) => f.fornecedor)).toEqual(["MAIOR", "MENOR"]);
  });

  it("trata valor nulo como zero, sem quebrar a soma", () => {
    const r = agruparPorFornecedor([
      produto({ fornecedor: "X", linhas: [linha({ valor: null, quantidade: 3 })] }),
    ]);
    expect(r[0].valorTransferencia).toBe(0);
    expect(r[0].quantidade).toBe(3);
  });
});
