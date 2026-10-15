import { describe, expect, it } from "vitest";

import { oportunidadeDeTransferencia } from "@/lib/diagnostico-ruptura/balanceamento";
import type { EntradaOportunidade } from "@/lib/diagnostico-ruptura/balanceamento";
import type { SobraNoCd } from "@/lib/diagnostico-ruptura/eventos";
import type { SlaAtivo } from "@/lib/diagnostico-ruptura/sla-ativo";

/** Par ativo nos dois tipos, que é o caso comum. */
const ativo = (dias: number): SlaAtivo => ({ mat: dias, med: dias });

/**
 * A transferência que teria resolvido.
 *
 * O teste que mais vale é o da materialidade: o motor dizia "cabia
 * transferência" sempre que qualquer sobra existisse, e produzia frases como
 * *"transferir 1 unidade teria evitado"*. Com Gatilho e Alvo na operação, uma
 * unidade não muda decisão nenhuma — e acusar alguém por ela gasta a
 * credibilidade do diagnóstico inteiro.
 */
const doador = (filial: string, sobra: number): SobraNoCd => ({
  filial,
  sobra,
  disponivel: sobra + 100,
  reservado: 100,
});

function entrada(over: Partial<EntradaOportunidade> = {}): EntradaOportunidade {
  return {
    destino: "1006",
    inicioDaRuptura: "2026-09-15",
    de: "2026-09-01",
    consumoDiario: 10,
    // 11/09 é a sexta anterior: 1002 → 1006 leva 4 dias úteis.
    sobraPorDia: new Map([["2026-09-09", [doador("1002", 500)]]]),
    sla: new Map([["1002>1006", ativo(4)]]),
    bu: "MAT",
    gatilho: 10,
    alvo: 30,
    ...over,
  };
}

describe("oportunidadeDeTransferencia", () => {
  it("encontra o doador, o prazo de despacho e a quantidade", () => {
    const o = oportunidadeDeTransferencia(entrada());

    expect(o).not.toBeNull();
    expect(o!.cd).toBe("1002");
    expect(o!.sla).toBe(4);
    // 15/09 é uma terça; quatro dias úteis atrás é 09/09.
    expect(o!.despacharAte).toBe("2026-09-09");
    // Até o Alvo: 10/dia × 30 dias = 300, dentro dos 500 de sobra.
    expect(o!.quantidade).toBe(300);
    expect(o!.diasCobertos).toBe(30);
  });

  /** O caso que motivou o módulo. */
  it("NÃO acusa transferência quando a sobra não cobre nem o Gatilho", () => {
    // Uma unidade de sobra, contra um mínimo de 10 × 10 = 100.
    const o = oportunidadeDeTransferencia(
      entrada({ sobraPorDia: new Map([["2026-09-09", [doador("1002", 1)]]]) }),
    );
    expect(o).toBeNull();
  });

  it("a sobra exatamente no Gatilho basta, e a quantidade é o que havia", () => {
    const o = oportunidadeDeTransferencia(
      entrada({ sobraPorDia: new Map([["2026-09-09", [doador("1002", 100)]]]) }),
    );
    expect(o).not.toBeNull();
    // Menos que o Alvo pede: manda o que tem.
    expect(o!.quantidade).toBe(100);
    expect(o!.diasCobertos).toBe(10);
  });

  it("sem SLA entre os CDs não há transferência a cobrar", () => {
    // O percurso não é conhecido, então a operação não tinha como despachar.
    const o = oportunidadeDeTransferencia(entrada({ sla: new Map() }));
    expect(o).toBeNull();
  });

  it("não cobra transferência que não daria tempo de chegar", () => {
    // SLA de 20 dias úteis contra uma ruptura que começou no dia 15: o
    // despacho teria de ter saído antes da janela, onde não há sobra medida.
    const o = oportunidadeDeTransferencia(
      entrada({ sla: new Map([["1002>1006", ativo(20)]]) }),
    );
    expect(o).toBeNull();
  });

  it("escolhe o menor SLA entre os doadores viáveis", () => {
    const o = oportunidadeDeTransferencia(
      entrada({
        sla: new Map([
          ["1002>1006", ativo(4)],
          ["1021>1006", ativo(2)],
        ]),
        sobraPorDia: new Map([
          ["2026-09-09", [doador("1002", 500)]],
          ["2026-09-11", [doador("1021", 500)]],
        ]),
      }),
    );
    expect(o!.cd).toBe("1021");
    expect(o!.despacharAte).toBe("2026-09-11");
  });

  it("ignora o próprio CD como doador", () => {
    const o = oportunidadeDeTransferencia(
      entrada({
        sla: new Map([["1006>1006", ativo(1)]]),
        sobraPorDia: new Map([["2026-09-14", [doador("1006", 500)]]]),
      }),
    );
    expect(o).toBeNull();
  });

  it("posição sem consumo não gera cobrança", () => {
    // Sem forecast não há ruptura a evitar, e a necessidade viraria infinita.
    const o = oportunidadeDeTransferencia(entrada({ consumoDiario: 0 }));
    expect(o).toBeNull();
  });

  it("sobra medida noutro dia não serve", () => {
    // O doador tinha sobra no dia 10, mas o despacho teria de sair no dia 9.
    const o = oportunidadeDeTransferencia(
      entrada({ sobraPorDia: new Map([["2026-09-10", [doador("1002", 500)]]]) }),
    );
    expect(o).toBeNull();
  });
});

describe("oportunidadeDeTransferencia e a coluna ativo", () => {
  /**
   * A regra que motivou o módulo `sla-ativo`.
   *
   * `ativo = 0` significa que a operação **não pode** transferir entre aquele
   * par. Cobrar uma rota proibida é cobrar o impossível — e são 10 dos 81 pares
   * sem nenhuma linha ativa, que o carregador compartilhado deixava passar.
   */
  it("não cobra transferência em par bloqueado para o tipo do item", () => {
    const bloqueadoParaMat = new Map([
      ["1002>1006", { mat: null, med: 4 }],
    ]);

    // O item é MAT, e o par está liberado só para MED.
    expect(
      oportunidadeDeTransferencia(
        entrada({ sla: bloqueadoParaMat, bu: "MAT" }),
      ),
    ).toBeNull();

    // O mesmo par, com um item MED, continua valendo.
    const med = oportunidadeDeTransferencia(
      entrada({ sla: bloqueadoParaMat, bu: "MED" }),
    );
    expect(med?.cd).toBe("1002");
    expect(med?.sla).toBe(4);
  });

  it("BU desconhecida aceita o par ativo em qualquer tipo", () => {
    // Sem saber o tipo do item, bloquear seria inventar uma restrição. O que
    // se garante é que par sem nenhuma linha ativa nunca passa.
    const o = oportunidadeDeTransferencia(
      entrada({
        sla: new Map([["1002>1006", { mat: null, med: 4 }]]),
        bu: "PREVENA",
      }),
    );
    expect(o?.sla).toBe(4);
  });

  it("par sem nenhuma linha ativa nunca passa, qualquer que seja a BU", () => {
    for (const bu of ["MAT", "MED", "PREVENA", null]) {
      expect(
        oportunidadeDeTransferencia(
          entrada({ sla: new Map([["1002>1006", { mat: null, med: null }]]), bu }),
        ),
      ).toBeNull();
    }
  });
});
