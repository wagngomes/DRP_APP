import { describe, expect, it } from "vitest";

import {
  cargasSuspeitas,
  montarEventos,
  type PosicaoDia,
} from "@/lib/diagnostico-ruptura/eventos";

/**
 * O agrupamento de snapshots em eventos.
 *
 * É a camada que decide **quantas rupturas existiram**, e todo o resto do
 * diagnóstico conta a partir dela: dias, valor perdido, percentual por causa.
 * Um erro aqui não aparece como erro — aparece como um número de rupturas que
 * ninguém consegue conferir.
 *
 * O caso que mais importa é o dia sem carga. A base não tem snapshot todo dia:
 * medido, a cobertura é de 28% em desenvolvimento e 33% em produção, com um
 * buraco de 15 dias em agosto. Se a ausência de carga fechasse o evento, uma
 * falha de importação viraria três rupturas onde houve uma.
 */

const base = {
  codigo: "100",
  filial: "1006",
  retido: 0,
  emTransito: 0,
  forecastMensal: 300,
  politica: 15,
};

/** Custo unitário por item, como `custoPorItem` devolve. */
const CUSTOS = new Map([["100", 10]]);

/** Um dia da posição; `disponivel` decide se está rompida. */
function dia(data: string, disponivel: number, extra: Partial<PosicaoDia> = {}): PosicaoDia {
  return { ...base, data, disponivel, rompida: disponivel <= 0, ...extra };
}

describe("montarEventos", () => {
  it("agrupa snapshots consecutivos em ruptura num evento só", () => {
    const eventos = montarEventos(
      [dia("2026-09-01", 0), dia("2026-09-02", 0), dia("2026-09-03", 0)],
      "2026-09-10",
    );
    expect(eventos).toHaveLength(1);
    expect(eventos[0].inicio).toBe("2026-09-01");
    expect(eventos[0].snapshots).toBe(3);
  });

  it("fecha o evento no dia em que o estoque volta", () => {
    const eventos = montarEventos(
      [dia("2026-09-01", 0), dia("2026-09-02", 0), dia("2026-09-03", 50)],
      "2026-09-10",
    );
    expect(eventos).toHaveLength(1);
    expect(eventos[0].fim).toBe("2026-09-03");
    // 01 a 03: dois dias sem estoque.
    expect(eventos[0].dias).toBe(2);
  });

  it("separa duas rupturas quando houve estoque no meio", () => {
    const eventos = montarEventos(
      [
        dia("2026-09-01", 0),
        dia("2026-09-02", 40),
        dia("2026-09-03", 0),
        dia("2026-09-04", 0),
      ],
      "2026-09-10",
    );
    expect(eventos).toHaveLength(2);
    expect(eventos.map((e) => e.inicio)).toEqual(["2026-09-01", "2026-09-03"]);
  });

  it("NÃO fecha o evento num buraco de carga", () => {
    // Entre 02 e 17 não houve importação — é o buraco de agosto, que existe de
    // verdade na base. A posição seguiu rompida, e isto é UMA ruptura de 16
    // dias, não duas de poucos dias.
    const eventos = montarEventos(
      [dia("2026-09-01", 0), dia("2026-09-02", 0), dia("2026-09-17", 0)],
      "2026-09-20",
    );
    expect(eventos).toHaveLength(1);
    expect(eventos[0].inicio).toBe("2026-09-01");
    expect(eventos[0].snapshots).toBe(3);
  });

  it("mede o evento aberto até a data de referência", () => {
    const eventos = montarEventos([dia("2026-09-01", 0)], "2026-09-11");
    expect(eventos[0].fim).toBeNull();
    expect(eventos[0].dias).toBe(10);
  });

  it("nunca devolve evento com zero dias", () => {
    // Rompeu e voltou no mesmo snapshot seria duração zero, e um evento de zero
    // dia com valor perdido zero só ocuparia linha na tela.
    const eventos = montarEventos([dia("2026-09-01", 0)], "2026-09-01");
    expect(eventos[0].dias).toBeGreaterThanOrEqual(1);
  });

  it("separa posições diferentes do mesmo item", () => {
    const eventos = montarEventos(
      [
        dia("2026-09-01", 0),
        dia("2026-09-01", 0, { filial: "1002" }),
        dia("2026-09-02", 0),
      ],
      "2026-09-10",
    );
    expect(eventos).toHaveLength(2);
    expect(new Set(eventos.map((e) => e.filial))).toEqual(
      new Set(["1006", "1002"]),
    );
  });

  it("calcula o valor perdido pelo consumo do forecast", () => {
    // forecast 300/mês = 10/dia; 2 dias a R$ 10 = R$ 200.
    const eventos = montarEventos(
      [dia("2026-09-01", 0), dia("2026-09-02", 0)],
      "2026-09-03",
      CUSTOS,
    );
    expect(eventos[0].valorPerdido).toBeCloseTo(200, 6);
  });

  it("não inventa valor quando o item não tem custo conhecido", () => {
    // Sem recebimento do item, não há custo real — e um palpite viraria um
    // valor perdido que ninguém consegue conferir. Zero é honesto; o campo do
    // simulador, que seria a alternativa, mente justamente nos rompidos.
    const eventos = montarEventos(
      [dia("2026-09-01", 0), dia("2026-09-02", 0)],
      "2026-09-03",
      new Map(),
    );
    expect(eventos[0].valorPerdido).toBe(0);
  });

  it("marca a ruptura que tinha estoque preso em Q40 ou RC", () => {
    const eventos = montarEventos(
      [dia("2026-09-01", 0), dia("2026-09-02", 0, { retido: 500 })],
      "2026-09-03",
    );
    expect(eventos[0].tinhaRetido).toBe(true);
  });

  it("ignora as cargas marcadas como suspeitas", () => {
    // O dia 02 é uma carga quebrada. Sem ignorá-la, o evento de 01 a 03 existe;
    // ignorando, ela não interfere — nem fecha, nem conta.
    const eventos = montarEventos(
      [dia("2026-09-01", 0), dia("2026-09-02", 999), dia("2026-09-03", 0)],
      "2026-09-10",
      CUSTOS,
      new Set(["2026-09-02"]),
    );
    expect(eventos).toHaveLength(1);
    expect(eventos[0].snapshots).toBe(2);
  });
});

describe("cargasSuspeitas", () => {
  it("acusa o dia em que quase tudo rompeu", () => {
    // Em 26/08/2026 a carga de forecast veio com todos os códigos nulos e o
    // motor veria 100% das posições rompidas. É dado quebrado, não catástrofe.
    const posicoes = [
      ...Array.from({ length: 10 }, (_, i) =>
        dia("2026-08-26", 0, { codigo: String(i) }),
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        dia("2026-08-27", i === 0 ? 0 : 100, { codigo: String(i) }),
      ),
    ];
    const suspeitas = cargasSuspeitas(posicoes);
    expect(suspeitas).toHaveLength(1);
    expect(suspeitas[0].data).toBe("2026-08-26");
    expect(suspeitas[0].motivo).toBe("quase-tudo-rompido");
  });

  it("não acusa um dia normal", () => {
    const posicoes = Array.from({ length: 20 }, (_, i) =>
      dia("2026-09-11", i < 2 ? 0 : 100, { codigo: String(i) }),
    );
    expect(cargasSuspeitas(posicoes)).toEqual([]);
  });
});
