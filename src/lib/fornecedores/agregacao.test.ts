import { describe, expect, it } from "vitest";

import { agregarPorFornecedor, VAZIO, type PosicaoRompida } from "./agregacao";

/**
 * O analista que aparece ao lado do fornecedor.
 *
 * Sai das próprias posições rompidas, e não de um cadastro: interessa quem
 * cuida **dos itens que estão rompidos**. Quase todo fornecedor tem um só — nos
 * dados de hoje, 126 de 136 —, e o que os testes guardam é o comportamento nos
 * dez restantes, onde a escolha precisa ser estável.
 */
function posicao(
  p: Partial<PosicaoRompida> & { fornecedor: string },
): PosicaoRompida {
  return {
    codigo: "1",
    descricao: null,
    filial: "1006",
    bu: VAZIO,
    curva: VAZIO,
    analista: VAZIO,
    forecast: 10,
    vendido: 0,
    categoria: "sem_cobertura",
    quantidade: null,
    chegada: null,
    saldoAComprar: 0,
    ...p,
  } as PosicaoRompida;
}

describe("agregarPorFornecedor — analista", () => {
  it("traz o analista quando o fornecedor tem um só", () => {
    const r = agregarPorFornecedor([
      posicao({ fornecedor: "ACME", analista: "ANA" }),
      posicao({ fornecedor: "ACME", analista: "ANA" }),
    ]);
    expect(r[0].analista).toBe("ANA");
    expect(r[0].outrosAnalistas).toBe(0);
  });

  it("escolhe quem tem mais posições e conta os demais", () => {
    const r = agregarPorFornecedor([
      posicao({ fornecedor: "ACME", analista: "ANA" }),
      posicao({ fornecedor: "ACME", analista: "ANA" }),
      posicao({ fornecedor: "ACME", analista: "BRUNO" }),
    ]);
    expect(r[0].analista).toBe("ANA");
    expect(r[0].outrosAnalistas).toBe(1);
  });

  it("empate desempata por nome, para não trocar entre carregamentos", () => {
    // Sem desempate, o vencedor dependeria da ordem em que as linhas chegaram —
    // e o nome ao lado do fornecedor mudaria sozinho de uma tela para a outra.
    const ordem1 = agregarPorFornecedor([
      posicao({ fornecedor: "ACME", analista: "BRUNO" }),
      posicao({ fornecedor: "ACME", analista: "ANA" }),
    ]);
    const ordem2 = agregarPorFornecedor([
      posicao({ fornecedor: "ACME", analista: "ANA" }),
      posicao({ fornecedor: "ACME", analista: "BRUNO" }),
    ]);
    expect(ordem1[0].analista).toBe("ANA");
    expect(ordem2[0].analista).toBe("ANA");
  });

  it("sem analista continua sem analista, em vez de inventar um", () => {
    const r = agregarPorFornecedor([posicao({ fornecedor: "ACME" })]);
    expect(r[0].analista).toBe(VAZIO);
  });

  it("cada fornecedor tem o seu, sem vazar de um para o outro", () => {
    const r = agregarPorFornecedor([
      posicao({ fornecedor: "ACME", analista: "ANA" }),
      posicao({ fornecedor: "BETA", analista: "BRUNO" }),
    ]);
    expect(r.find((x) => x.fornecedor === "ACME")?.analista).toBe("ANA");
    expect(r.find((x) => x.fornecedor === "BETA")?.analista).toBe("BRUNO");
  });

  it("não mexe nas contagens que já existiam", () => {
    const r = agregarPorFornecedor([
      posicao({ fornecedor: "ACME", categoria: "compra", analista: "ANA" }),
      posicao({
        fornecedor: "ACME",
        categoria: "sem_cobertura",
        analista: "ANA",
      }),
    ]);
    expect(r[0]).toMatchObject({ total: 2, compra: 1, semCobertura: 1 });
  });
});
