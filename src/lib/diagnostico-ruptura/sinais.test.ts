import { describe, expect, it } from "vitest";

import { saldoEm, type MovimentoPlano } from "@/lib/diagnostico-ruptura/sinais";

/**
 * O saldo do plano numa data.
 *
 * A parte testável de `sinais.ts`: as outras cinco consultas são SQL contra as
 * bases e vivem pela medição, não por teste de unidade. Esta conta, não — ela
 * é a diferença entre duas conversas muito diferentes com Compras, e o erro
 * que ela evita é sutil.
 */
function movimento(over: Partial<MovimentoPlano> = {}): MovimentoPlano {
  return {
    plano: 1000,
    colocado: [
      { data: "2026-09-03", quantidade: 200 },
      { data: "2026-09-12", quantidade: 500 },
    ],
    recebido: [{ data: "2026-09-20", quantidade: 100 }],
    ...over,
  };
}

describe("saldoEm", () => {
  it("conta só o que já havia acontecido até a data", () => {
    // No dia 5 apenas a primeira colocação existia.
    expect(saldoEm(movimento(), "2026-09-05")).toBe(800);
    // No dia 15, as duas.
    expect(saldoEm(movimento(), "2026-09-15")).toBe(300);
    // No fim do mês, as duas mais o recebimento.
    expect(saldoEm(movimento(), "2026-09-30")).toBe(200);
  });

  it("inclui o próprio dia", () => {
    // A decisão de comprar cabe no dia do limite: excluir o dia encurtaria o
    // prazo em 24 horas e viraria "sem saldo" num caso em que havia.
    expect(saldoEm(movimento(), "2026-09-03")).toBe(800);
    expect(saldoEm(movimento(), "2026-09-02")).toBe(1000);
  });

  /**
   * A razão de esta função existir.
   *
   * `carregarSaldoPlano` devolve o saldo do mês inteiro — aqui, 200. Mas B3a
   * pergunta se havia verba **quando a decisão precisava ser tomada**, e nessa
   * data havia 800. Responder com o saldo do mês seria circular: o próprio
   * pedido atrasado entra no "aberto" e faz parecer que a verba já estava
   * comprometida antes de alguém ter decidido nada.
   */
  it("não confunde saldo na data limite com saldo do mês", () => {
    const m = movimento();
    const noMes = saldoEm(m, "2026-09-30");
    const noLimite = saldoEm(m, "2026-09-05");
    expect(noMes).toBe(200);
    expect(noLimite).toBe(800);
    expect(noLimite).toBeGreaterThan(noMes);
  });

  it("devolve negativo quando o plano foi estourado", () => {
    const m = movimento({ plano: 300 });
    expect(saldoEm(m, "2026-09-30")).toBe(-500);
  });

  it("item sem plano nem movimento devolve zero, sem explodir", () => {
    expect(saldoEm(undefined, "2026-09-15")).toBe(0);
    expect(
      saldoEm({ plano: 0, colocado: [], recebido: [] }, "2026-09-15"),
    ).toBe(0);
  });
});
