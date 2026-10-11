import { describe, expect, it } from "vitest";

import { candidatas, type Contexto } from "@/lib/diagnostico-ruptura/regras";
import { dividirDias } from "@/lib/diagnostico-ruptura/contrafactual";
import { diasDaJanela } from "@/lib/diagnostico-ruptura/replay";

/**
 * As regras, contra casos montados à mão com resposta conhecida.
 *
 * O que estes testes protegem é o princípio do método: **uma regra ter falhado
 * não faz dela a causa**. Sem isso o motor vira uma máquina de casar regra —
 * toda venda acima do forecast acusa o comercial, todo plano curto acusa o
 * planejamento — e a tela produz explicações para rupturas que elas não
 * produziram, com a autoridade de um número.
 */

const JANELA = { de: "2026-09-01", ate: "2026-09-20" };

/** Consumo constante por dia na janela inteira. */
const porDia = (q: number) =>
  new Map(diasDaJanela(JANELA.de, JANELA.ate).map((d) => [d, q]));

function contexto(over: Partial<Contexto> = {}): Contexto {
  return {
    evento: {
      codigo: "100",
      filial: "1006",
      inicio: "2026-09-10",
      fim: null,
      dias: 10,
      snapshots: 5,
      valorPerdido: 0,
      tinhaRetido: false,
    },
    ...JANELA,
    vendas: porDia(10),
    chegadas: [],
    forecastMensal: 300, // 10/dia: a venda está exatamente no previsto
    abertura: {
      codigo: "100",
      filial: "1006",
      disponivel: 300,
      aCaminho: 0,
      politicaDias: 15,
      consumoDiario: 10,
      coberturaDias: 30,
      abaixoDaPolitica: false,
    },
    leadTime: 8,
    excedenteOutrosCds: 0,
    ...over,
  };
}

describe("candidatas", () => {
  it("não acusa nada quando não houve ruptura", () => {
    // Estoque de 300, consumo de 10/dia por 20 dias: sobra. Nenhuma regra tem
    // o que creditar, porque não há dia de ruptura a evitar.
    const c = contexto();
    for (const x of candidatas(c)) expect(x.diasEvitados).toBe(0);
  });

  it("NÃO credita a venda acelerada quando a compra cobriu", () => {
    // O caso que o usuário levantou e que define o método. A venda veio 80%
    // acima do previsto — a regra dispara — mas chegou reposição farta no meio
    // da janela. Limitar a venda ao forecast não evita um dia sequer.
    const c = contexto({
      vendas: porDia(18),
      chegadas: [{ data: "2026-09-10", quantidade: 2000 }],
    });
    const venda = candidatas(c).find((x) => x.slug === "venda_acima_forecast");
    expect(venda).toBeDefined();
    expect(venda!.diasEvitados).toBe(0);

    // E na divisão ela aparece como observação, sem dias.
    const r = dividirDias(candidatas(c), 0);
    const atribuida = r.find((x) => x.slug === "venda_acima_forecast")!;
    expect(atribuida.papel).toBe("observacao");
    expect(atribuida.dias).toBe(0);
  });

  it("credita a venda acelerada quando ela antecipou a falta", () => {
    // Mesma aceleração, sem reposição: agora o excesso é o que esvaziou a
    // prateleira, e limitar a venda ao previsto teria evitado dias.
    const c = contexto({ vendas: porDia(18) });
    const venda = candidatas(c).find((x) => x.slug === "venda_acima_forecast");
    expect(venda!.diasEvitados).toBeGreaterThan(0);
  });

  it("não dispara a aceleração dentro da tolerância", () => {
    // 10% acima não é aceleração: é ruído de previsão. O limite é 20%.
    const c = contexto({ vendas: porDia(11) });
    expect(
      candidatas(c).some((x) => x.slug === "venda_acima_forecast"),
    ).toBe(false);
  });

  it("credita a abertura descoberta quando o estoque inicial faltou", () => {
    const c = contexto({
      abertura: {
        ...contexto().abertura!,
        disponivel: 50,
        abaixoDaPolitica: true,
      },
    });
    const ab = candidatas(c).find((x) => x.slug === "abertura_descoberta");
    expect(ab).toBeDefined();
    expect(ab!.diasEvitados).toBeGreaterThan(0);
  });

  it("não credita a abertura quando ela estava dentro da política", () => {
    expect(
      candidatas(contexto()).some((x) => x.slug === "abertura_descoberta"),
    ).toBe(false);
  });

  it("o mês anterior acelerado explica parte da abertura", () => {
    // As duas falham: o mês abriu com pouco, e abriu com pouco porque o mês
    // passado vendeu além. Shapley divide entre elas sem estourar o total.
    const c = contexto({
      abertura: {
        ...contexto().abertura!,
        disponivel: 50,
        abaixoDaPolitica: true,
      },
      mesAnterior: {
        codigo: "100",
        filial: "1006",
        vendido: 450,
        forecast: 300,
        indice: 1.5,
        excedente: 150,
      },
    });
    const lista = candidatas(c);
    expect(lista.map((x) => x.slug)).toContain("venda_acelerada_mes_anterior");
    expect(lista.map((x) => x.slug)).toContain("abertura_descoberta");

    const r = dividirDias(lista, 15);
    const soma = r.reduce((a, x) => a + x.dias, 0);
    expect(soma).toBeCloseTo(15, 6);
  });

  it("não cobra compra de forecast aberto ontem", () => {
    // A previsão nasceu três dias antes da ruptura, com lead time de oito: não
    // havia prazo material para abastecer. Cobrar compra disso seria cobrar o
    // impossível, e é por isso que a causa existe.
    const c = contexto({
      abertura: { ...contexto().abertura!, disponivel: 0, abaixoDaPolitica: true },
      aberturaForecast: {
        codigo: "100",
        filial: "1006",
        data: "2026-09-07",
        forecast: 300,
        linhaNova: true,
      },
    });
    const nova = candidatas(c).find((x) => x.slug === "nova_abertura");
    expect(nova).toBeDefined();
    expect(nova!.diasEvitados).toBeGreaterThan(0);
  });

  it("ignora forecast aberto há mais de um lead time", () => {
    // Aberto há 40 dias com lead time de 8: houve tempo de sobra para comprar,
    // e a abertura do forecast não explica mais nada.
    const c = contexto({
      aberturaForecast: {
        codigo: "100",
        filial: "1006",
        data: "2026-08-01",
        forecast: 300,
        linhaNova: true,
      },
    });
    expect(candidatas(c).some((x) => x.slug === "nova_abertura")).toBe(false);
  });

  it("fora do plano e plano insuficiente são exclusivas", () => {
    const semPlano = candidatas(
      contexto({
        abertura: { ...contexto().abertura!, disponivel: 0, abaixoDaPolitica: true },
        planoDoMes: { plano: 0, saldo: 0 },
      }),
    ).map((x) => x.slug);
    expect(semPlano).toContain("fora_do_plano");
    expect(semPlano).not.toContain("plano_insuficiente");

    const planoCurto = candidatas(
      contexto({
        abertura: { ...contexto().abertura!, disponivel: 0, abaixoDaPolitica: true },
        planoDoMes: { plano: 10, saldo: 0 },
      }),
    ).map((x) => x.slug);
    expect(planoCurto).toContain("plano_insuficiente");
    expect(planoCurto).not.toContain("fora_do_plano");
  });

  it("não acusa o plano quando ele cobria a necessidade", () => {
    // Necessidade = 10/dia × (8 de lead time + 15 de política) = 230.
    const c = contexto({ planoDoMes: { plano: 500, saldo: 200 } });
    const slugs = candidatas(c).map((x) => x.slug);
    expect(slugs).not.toContain("fora_do_plano");
    expect(slugs).not.toContain("plano_insuficiente");
  });

  it("credita a transferência não feita quando havia estoque em outro CD", () => {
    const c = contexto({
      abertura: { ...contexto().abertura!, disponivel: 0, abaixoDaPolitica: true },
      excedenteOutrosCds: 500,
    });
    const t = candidatas(c).find((x) => x.slug === "transferencia_nao_feita");
    expect(t).toBeDefined();
    expect(t!.diasEvitados).toBeGreaterThan(0);
  });

  it("não sugere transferência sem estoque em outro CD", () => {
    const c = contexto({
      abertura: { ...contexto().abertura!, disponivel: 0, abaixoDaPolitica: true },
      excedenteOutrosCds: 0,
    });
    expect(
      candidatas(c).some((x) => x.slug === "transferencia_nao_feita"),
    ).toBe(false);
  });

  it("toda candidata carrega evidência", () => {
    // O critério de aceite do PRD: nenhuma causa sem prova. Uma causa sem o
    // registro que a sustenta é uma afirmação que ninguém consegue conferir.
    const c = contexto({
      vendas: porDia(20),
      abertura: { ...contexto().abertura!, disponivel: 0, abaixoDaPolitica: true },
      planoDoMes: { plano: 0, saldo: 0 },
      excedenteOutrosCds: 500,
    });
    const lista = candidatas(c);
    expect(lista.length).toBeGreaterThan(2);
    for (const x of lista) {
      expect(x.evidencias).toBeTruthy();
      expect(Object.keys(x.evidencias).length).toBeGreaterThan(0);
    }
  });
});
