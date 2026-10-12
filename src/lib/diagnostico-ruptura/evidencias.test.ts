import { describe, expect, it } from "vitest";

import { causasAlcancaveis, type ContextoArvore } from "@/lib/diagnostico-ruptura/arvore";
import { evidenciar } from "@/lib/diagnostico-ruptura/evidencias";
import type { ExtrasEvidencia } from "@/lib/diagnostico-ruptura/evidencias";

/**
 * A prova de cada causa.
 *
 * O teste que mais vale é o primeiro: **toda causa que a árvore consegue
 * devolver tem de ter uma prova própria**. Sem ele, acrescentar um nó à árvore
 * passa silenciosamente a mostrar a frase genérica — que é tecnicamente
 * correta e inútil na reunião, porque não nomeia o número que decidiu o caso.
 */

function contexto(over: Partial<ContextoArvore> = {}): ContextoArvore {
  return {
    evento: {
      codigo: "100",
      filial: "1006",
      inicio: "2026-09-05",
      fim: null,
      dias: 6,
      snapshots: 4,
      valorPerdido: 1000,
      tinhaRetido: false,
    },
    de: "2026-09-01",
    ate: "2026-09-10",
    vendas: new Map([
      ["2026-09-01", 10],
      ["2026-09-02", 10],
      ["2026-09-03", 10],
      ["2026-09-04", 10],
    ]),
    chegadas: [],
    forecastMensal: 300,
    leadTime: 8,
    excedenteOutrosCds: 0,
    abertura: {
      codigo: "100",
      filial: "1006",
      disponivel: 40,
      aCaminho: 0,
      politicaDias: 15,
      consumoDiario: 10,
      coberturaDias: 4,
      abaixoDaPolitica: true,
    },
    retido: 0,
    cargaSuspeita: false,
    ...over,
  };
}

const extras = (over: Partial<ExtrasEvidencia> = {}): ExtrasEvidencia => ({
  sobraPorCd: [],
  pedidosSumidos: 0,
  ...over,
});

describe("evidenciar", () => {
  it("toda causa que a árvore alcança tem prova própria, não a genérica", () => {
    const generica = evidenciar(
      contexto(),
      "causa_que_nao_existe",
      extras(),
    ).resumo;

    const semProva = causasAlcancaveis().filter(
      (slug) => evidenciar(contexto(), slug, extras()).resumo === generica,
    );

    expect(semProva).toEqual([]);
  });

  it("nenhuma prova explode com o contexto mínimo", () => {
    // Sem abertura, sem plano, sem pedido, sem entregas: o pior caso de dado
    // faltando. A prova tem de sair mesmo assim, porque é justamente nesses
    // casos que a tela precisa dizer algo.
    const magro = contexto({
      abertura: undefined,
      planoDoMes: undefined,
      pedido: undefined,
      entregas: undefined,
      prazo: undefined,
      mesAnterior: undefined,
      aberturaForecast: undefined,
      forecastMensal: 0,
    });
    for (const slug of causasAlcancaveis()) {
      const e = evidenciar(magro, slug, extras());
      expect(e.resumo.length).toBeGreaterThan(20);
      expect(typeof e.valores).toBe("object");
    }
  });

  it("a prova nomeia os números que decidiram o caso", () => {
    const e = evidenciar(
      contexto({ planoDoMes: { plano: 0, saldo: 0 } }),
      "fora_do_plano",
      extras(),
    );
    // Necessidade = 300/30 × (8 de lead + 15 de política) = 230.
    expect(e.valores.necessidade).toBeCloseTo(230, 1);
    expect(e.valores.plano_do_mes).toBe(0);
    expect(e.resumo).toContain("230");
  });

  /**
   * A parte acionável, e a razão de o cálculo do contrafactual ter sobrevivido
   * como evidência: a frase só serve se nomear o CD.
   */
  it("a prescrição nomeia o CD doador e o que ele tinha sobrando", () => {
    const e = evidenciar(
      contexto(),
      "abertura_descoberta",
      extras({
        sobraPorCd: [
          { filial: "1002", sobra: 500, disponivel: 800, reservado: 300 },
          { filial: "1021", sobra: 40, disponivel: 90, reservado: 50 },
        ],
      }),
    );

    expect(e.prescricao).toBeDefined();
    expect(e.prescricao?.cd).toBe("1002");
    expect(e.prescricao?.sobraNoCd).toBe(500);
    expect(e.prescricao?.quantidade).toBeGreaterThan(0);
    // Os doadores vêm do maior para o menor: é por ele que a operação começa.
    expect(e.doadores?.map((d) => d.cd)).toEqual(["1002", "1021"]);
  });

  it("sem estoque na rede não há prescrição, e isso não é erro", () => {
    const e = evidenciar(contexto(), "abertura_descoberta", extras());
    expect(e.prescricao).toBeUndefined();
    expect(e.doadores).toBeUndefined();
    expect(e.resumo.length).toBeGreaterThan(20);
  });

  it("o balanceamento é modificador e viaja com a prova", () => {
    const com = evidenciar(contexto(), "fora_do_plano", extras(), true);
    const sem = evidenciar(contexto(), "fora_do_plano", extras(), false);
    expect(com.balanceamentoNaoRealizado).toBe(true);
    expect(sem.balanceamentoNaoRealizado).toBe(false);
    // Modificador não muda a causa nem a frase dela.
    expect(com.resumo).toBe(sem.resumo);
  });

  it("estoque retido converte a quantidade em dias de venda", () => {
    const e = evidenciar(contexto({ retido: 90 }), "estoque_retido", extras());
    // 90 unidades a 10/dia = 9 dias.
    expect(e.valores.dias_que_o_retido_cobriria).toBeCloseTo(9, 1);
    expect(e.resumo).toContain("90");
  });
});
