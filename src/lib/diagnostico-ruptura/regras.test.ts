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

  it("o mês anterior acelerado ABSORVE a abertura quando a explica inteira", () => {
    // A precedência do PRD. O mês abriu com 50 e a política pedia 150; o mês
    // passado vendeu 150 além do previsto. Devolvido o excedente, a abertura
    // estaria exatamente na política — ela não tem nada de próprio a explicar,
    // e acusá-la seria cobrar duas vezes a mesma falha.
    const c = contexto({
      abertura: { ...contexto().abertura!, disponivel: 50, abaixoDaPolitica: true },
      mesAnterior: {
        codigo: "100", filial: "1006",
        vendido: 450, forecast: 300, indice: 1.5, excedente: 150,
      },
    });
    const slugs = candidatas(c).map((x) => x.slug);
    expect(slugs).toContain("venda_acelerada_mes_anterior");
    expect(slugs).not.toContain("abertura_descoberta");
  });

  it("a abertura fica com o resíduo quando o mês anterior explica só parte", () => {
    // Mesmo caso, com excedente menor: devolvidos 40, a abertura sobe para 90
    // e a política pede 150. Faltam 60 que a aceleração não explica, e é isso
    // que a abertura leva — nem tudo, nem nada.
    const c = contexto({
      abertura: { ...contexto().abertura!, disponivel: 50, abaixoDaPolitica: true },
      mesAnterior: {
        codigo: "100", filial: "1006",
        vendido: 340, forecast: 300, indice: 1.13 + 0.1, excedente: 40,
      },
    });
    const lista = candidatas(c);
    const slugs = lista.map((x) => x.slug);
    expect(slugs).toContain("venda_acelerada_mes_anterior");
    expect(slugs).toContain("abertura_descoberta");

    const r = dividirDias(lista, 15);
    expect(r.reduce((a, x) => a + x.dias, 0)).toBeCloseTo(15, 6);
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

describe("lead time", () => {
  const comEntrega = (leadReal: number, cadastrado: number, entregas = 1) =>
    contexto({
      abertura: { ...contexto().abertura!, disponivel: 0, abaixoDaPolitica: true },
      entregas: [
        {
          posicao: "100|1006",
          pedido: "P1",
          pedidoEm: "2026-09-01",
          chegouEm: "2026-09-12",
          quantidade: 500,
          leadReal,
        },
      ],
      chegadas: [{ data: "2026-09-12", quantidade: 500 }],
      prazo: { cadastrado, realMediano: leadReal, entregas },
    });

  it("credita o atraso quando ele custou dias de prateleira vazia", () => {
    // Pedido em 01/09 com prazo de 4 dias chegou em 11 — sete dias tarde, e a
    // posição estava zerada desde a abertura.
    const r = candidatas(comEntrega(11, 4));
    const atraso = r.find(
      (x) => x.slug === "fornecedor_atrasou" || x.slug === "lead_time_cadastro",
    );
    expect(atraso).toBeDefined();
    expect(atraso!.diasEvitados).toBeGreaterThan(0);
  });

  it("não acusa atraso dentro da tolerância", () => {
    // Dois dias além do cadastrado é a tolerância; não é atraso.
    const r = candidatas(comEntrega(10, 8)).map((x) => x.slug);
    expect(r).not.toContain("fornecedor_atrasou");
    expect(r).not.toContain("lead_time_cadastro");
  });

  it("culpa o cadastro, e não o fornecedor, quando o estouro é o padrão", () => {
    // A distinção importa: o prazo cadastrado alimenta toda data limite de
    // compra do sistema. Chamar de "atraso do fornecedor" o que acontece em
    // metade das entregas esconde um número errado no cadastro.
    const recorrente = candidatas(comEntrega(30, 4, 23)).map((x) => x.slug);
    expect(recorrente).toContain("lead_time_cadastro");
    expect(recorrente).not.toContain("fornecedor_atrasou");

    const isolado = candidatas(comEntrega(30, 4, 2)).map((x) => x.slug);
    expect(isolado).toContain("fornecedor_atrasou");
    expect(isolado).not.toContain("lead_time_cadastro");
  });

  it("guarda o pedido e as datas como prova", () => {
    // Pelo slug, não por índice: as regras rodam na ordem da cadeia e a
    // abertura vem antes do fornecedor.
    const atraso = candidatas(comEntrega(11, 4)).find(
      (x) => x.slug === "fornecedor_atrasou" || x.slug === "lead_time_cadastro",
    )!;
    const registros = (atraso.evidencias as { registros: Record<string, unknown>[] })
      .registros;
    expect(registros[0]).toMatchObject({
      tabela: "recebimento",
      chave: "P1",
      pedido_em: "2026-09-01",
      chegou_em: "2026-09-12",
      atraso: 7,
    });
  });
});
