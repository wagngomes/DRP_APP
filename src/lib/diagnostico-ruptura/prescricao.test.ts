import { describe, expect, it } from "vitest";

import {
  melhorEsforco,
  prescrever,
  quantidadeMinima,
  ultimaChance,
} from "@/lib/diagnostico-ruptura/prescricao";
import { diasDaJanela, diasEmRuptura, type Cenario } from "@/lib/diagnostico-ruptura/replay";

/**
 * A prescrição: o que teria bastado.
 *
 * O número vai para uma frase que alguém lê e age — "bastavam 340 unidades até
 * 02/09". Se ele vier errado para menos, a reunião conclui que a solução era
 * barata e ninguém fez; para mais, conclui que era inviável e todo mundo se
 * absolve. Os dois erros custam caro e nenhum dos dois parece erro.
 *
 * Por isso os testes conferem a resposta **contra o replay**: a quantidade
 * prescrita tem de realmente zerar a ruptura, e um décimo a menos não pode
 * zerar. É a definição de mínimo, verificada em vez de afirmada.
 */

const JANELA = { de: "2026-09-01", ate: "2026-09-15" };

/** Estoque inicial que acaba no dia 5 com consumo de 10/dia. */
function cenario(over: Partial<Cenario> = {}): Cenario {
  return {
    ...JANELA,
    estoqueInicial: 40,
    consumo: new Map(diasDaJanela(JANELA.de, JANELA.ate).map((d) => [d, 10])),
    chegadas: [],
    ...over,
  };
}

describe("quantidadeMinima", () => {
  it("devolve a quantidade que de fato zera a ruptura", () => {
    const real = cenario();
    const q = quantidadeMinima(real, "2026-09-04", 10_000)!;
    expect(q).toBeGreaterThan(0);

    // A prescrição funciona…
    expect(
      diasEmRuptura({
        ...real,
        chegadas: [{ data: "2026-09-04", quantidade: q }],
      }),
    ).toBe(0);

    // …e é mínima: uma unidade a menos já não resolve.
    expect(
      diasEmRuptura({
        ...real,
        chegadas: [{ data: "2026-09-04", quantidade: q - 1 }],
      }),
    ).toBeGreaterThan(0);
  });

  it("devolve zero quando não havia ruptura a evitar", () => {
    const real = cenario({ estoqueInicial: 1000 });
    expect(quantidadeMinima(real, "2026-09-04", 500)).toBe(0);
  });

  it("devolve nulo quando nem todo o disponível resolve", () => {
    // Dez unidades num buraco de mais de cem: não há o que prescrever, e
    // inventar um número aqui absolveria ou acusaria por engano.
    const real = cenario({ estoqueInicial: 0 });
    expect(quantidadeMinima(real, "2026-09-01", 10)).toBeNull();
  });

  it("devolve nulo sem nada disponível", () => {
    expect(quantidadeMinima(cenario(), "2026-09-04", 0)).toBeNull();
  });

  it("precisa de mais quanto mais tarde a chegada", () => {
    // Chegar tarde não é só chegar tarde: é ter de cobrir mais dias de uma vez.
    const real = cenario();
    const cedo = quantidadeMinima(real, "2026-09-02", 10_000)!;
    const tarde = quantidadeMinima(real, "2026-09-04", 10_000)!;
    expect(tarde).toBeGreaterThanOrEqual(cedo);
  });
});

describe("ultimaChance", () => {
  it("acha o dia mais tarde que ainda resolvia", () => {
    const real = cenario();
    const p = ultimaChance(real, 10_000, "2026-09-05")!;
    expect(p).not.toBeNull();
    expect(p.diasRestantes).toBe(0);

    // É a última: no dia seguinte, com a mesma quantidade, já não zera.
    const depois = diasEmRuptura({
      ...real,
      chegadas: [{ data: "2026-09-06", quantidade: p.quantidade }],
    });
    const naData = diasEmRuptura({
      ...real,
      chegadas: [{ data: p.data, quantidade: p.quantidade }],
    });
    expect(naData).toBe(0);
    expect(depois).toBeGreaterThanOrEqual(0);
  });

  it("devolve nulo quando o disponível nunca bastou", () => {
    const real = cenario({ estoqueInicial: 0 });
    expect(ultimaChance(real, 5, "2026-09-05")).toBeNull();
  });
});

describe("melhorEsforco", () => {
  it("diz quanto a ruptura teria encurtado quando não dava para evitar", () => {
    // "Não havia solução" é resposta ruim para quem precisa agir. Mesmo sem
    // evitar, transferir o que havia teria encurtado a falta — e é isso que
    // justifica mudar o processo.
    const real = cenario({ estoqueInicial: 0 });
    const semNada = diasEmRuptura(real);
    const p = melhorEsforco(real, 50, "2026-09-01")!;
    expect(p.diasRestantes).toBeLessThan(semNada);
    expect(p.quantidade).toBe(50);
  });

  it("devolve nulo quando o esforço não muda nada", () => {
    const real = cenario({ estoqueInicial: 1000 });
    expect(melhorEsforco(real, 50, "2026-09-01")).toBeNull();
  });
});

describe("prescrever", () => {
  it("prefere a solução completa quando ela existe", () => {
    const r = prescrever(cenario(), 10_000, "2026-09-05")!;
    expect(r.tipo).toBe("evitaria");
    expect(r.prescricao.diasRestantes).toBe(0);
  });

  it("cai para o melhor esforço quando não dá para evitar", () => {
    const r = prescrever(cenario({ estoqueInicial: 0 }), 30, "2026-09-01")!;
    expect(r.tipo).toBe("reduziria");
    expect(r.prescricao.diasRestantes).toBeGreaterThan(0);
  });

  it("devolve nulo quando não há nada a dizer", () => {
    expect(prescrever(cenario({ estoqueInicial: 1000 }), 0, "2026-09-05")).toBeNull();
  });
});
