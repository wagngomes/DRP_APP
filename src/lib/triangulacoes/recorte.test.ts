import { describe, expect, it } from "vitest";

import { recortar, type ProdutoRecortavel } from "@/lib/triangulacoes/recorte";
import { normalizarTributacao } from "@/utils/tributacao";

/**
 * O recorte cumulativo da tela de triangulações.
 *
 * O que estes testes cobrem é exatamente o que a conferência contra o banco
 * mostraria: que as duas travas se somam, que a ordem não importa, e que cada
 * seletor continua oferecendo opções que levam a algum lugar.
 */
const item = (
  codigo: string,
  fornecedor: string,
  tributacao: string | null,
  descricao = `Produto ${codigo}`,
): ProdutoRecortavel => ({
  codigo,
  descricao,
  fornecedor,
  tributacao: normalizarTributacao(tributacao),
});

const BASE: ProdutoRecortavel[] = [
  item("1", "ACME", "Nacional 7%"),
  item("2", "ACME", "Importado"),
  item("3", "ACME", "Nacional 12%"),
  item("4", "BRAVO", "Nacional 7%"),
  item("5", "BRAVO", "Importado"),
  item("6", "CICLO", "Importado"),
  item("7", "CICLO", null),
];

describe("recortar", () => {
  it("sem filtro devolve tudo e todas as opções", () => {
    const r = recortar(BASE, {});
    expect(r.visiveis).toHaveLength(7);
    expect(r.fornecedores).toEqual(["ACME", "BRAVO", "CICLO"]);
    expect(r.tributacoes.map((t) => t.rotulo)).toEqual([
      "Importado",
      "Nacional 12%",
      "Nacional 7%",
      "Sem fiscal",
    ]);
  });

  it("as travas se somam", () => {
    const r = recortar(BASE, {
      fornecedor: "ACME",
      tributacao: normalizarTributacao("Nacional 7%").chave,
    });
    expect(r.visiveis.map((p) => p.codigo)).toEqual(["1"]);
  });

  /** "Um laboratório e, dentro dele, uma tributação — ou o contrário." */
  it("a ordem dos filtros não muda o resultado", () => {
    const trib = normalizarTributacao("Importado").chave;

    // Escolhe laboratório primeiro, depois a tributação que ele oferece.
    const passo1 = recortar(BASE, { fornecedor: "ACME" });
    expect(passo1.tributacoes.map((t) => t.rotulo)).toContain("Importado");
    const porFornecedor = recortar(BASE, { fornecedor: "ACME", tributacao: trib });

    // Agora o contrário.
    const passo2 = recortar(BASE, { tributacao: trib });
    expect(passo2.fornecedores).toContain("ACME");
    const porTributacao = recortar(BASE, { tributacao: trib, fornecedor: "ACME" });

    expect(porFornecedor.visiveis.map((p) => p.codigo)).toEqual(
      porTributacao.visiveis.map((p) => p.codigo),
    );
    expect(porFornecedor.visiveis.map((p) => p.codigo)).toEqual(["2"]);
  });

  /**
   * A regra que evita beco sem saída: as opções oferecidas levam a algum
   * resultado.
   */
  it("escolher um laboratório encurta as tributações para as que existem nele", () => {
    const r = recortar(BASE, { fornecedor: "BRAVO" });
    expect(r.tributacoes.map((t) => t.rotulo)).toEqual([
      "Importado",
      "Nacional 7%",
    ]);
    // E toda opção oferecida devolve pelo menos um produto.
    for (const t of r.tributacoes) {
      const comAmbos = recortar(BASE, { fornecedor: "BRAVO", tributacao: t.chave });
      expect(comAmbos.visiveis.length).toBeGreaterThan(0);
    }
  });

  it("escolher uma tributação encurta os laboratórios", () => {
    const r = recortar(BASE, {
      tributacao: normalizarTributacao("Nacional 12%").chave,
    });
    expect(r.fornecedores).toEqual(["ACME"]);
  });

  /** Sem isto o seletor se esvaziaria no instante em que fosse usado. */
  it("cada lista ignora o próprio filtro", () => {
    const comFornecedor = recortar(BASE, { fornecedor: "ACME" });
    expect(comFornecedor.fornecedores).toEqual(["ACME", "BRAVO", "CICLO"]);

    const comTributacao = recortar(BASE, {
      tributacao: normalizarTributacao("Importado").chave,
    });
    expect(comTributacao.tributacoes.map((t) => t.rotulo)).toEqual([
      "Importado",
      "Nacional 12%",
      "Nacional 7%",
      "Sem fiscal",
    ]);
  });

  it("grafias diferentes da mesma tributação viram uma opção só", () => {
    const r = recortar(
      [
        item("1", "ACME", "Nacional 7%"),
        item("2", "ACME", "nacional 7%"),
        item("3", "ACME", "7% Nacional"),
      ],
      {},
    );
    expect(r.tributacoes).toHaveLength(1);
    expect(r.tributacoes[0].rotulo).toBe("Nacional 7%");

    // E o filtro pega os três.
    const filtrado = recortar(
      [
        item("1", "ACME", "Nacional 7%"),
        item("2", "ACME", "nacional 7%"),
        item("3", "ACME", "7% Nacional"),
      ],
      { tributacao: normalizarTributacao("Nacional 7%").chave },
    );
    expect(filtrado.visiveis).toHaveLength(3);
  });

  it("item sem fiscal é filtrável, não some", () => {
    const r = recortar(BASE, {
      tributacao: normalizarTributacao(null).chave,
    });
    expect(r.visiveis.map((p) => p.codigo)).toEqual(["7"]);
  });

  it("a busca por produto soma com os outros dois", () => {
    const r = recortar(
      [
        item("100", "ACME", "Importado", "Dipirona 500mg"),
        item("200", "ACME", "Importado", "Paracetamol"),
        item("300", "BRAVO", "Importado", "Dipirona 1g"),
      ],
      { fornecedor: "ACME", produto: "dipirona" },
    );
    expect(r.visiveis.map((p) => p.codigo)).toEqual(["100"]);
  });

  it("combinação sem resultado devolve lista vazia, não erro", () => {
    const r = recortar(BASE, {
      fornecedor: "CICLO",
      tributacao: normalizarTributacao("Nacional 12%").chave,
    });
    expect(r.visiveis).toEqual([]);
    // E os seletores continuam oferecendo saída.
    expect(r.fornecedores.length).toBeGreaterThan(0);
    expect(r.tributacoes.length).toBeGreaterThan(0);
  });
});
