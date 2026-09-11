import { describe, expect, it } from "vitest";

import { decidirAcoes } from "./acao";
import type { PosicaoRisco } from "./tipos";
import type { Sugestao } from "./transferencia";
import type { Reposicao } from "@/lib/reposicoes/chegadas";

/**
 * A regra de decisão do cockpit.
 *
 * É a peça que diz ao analista o que fazer, e a ordem de precedência dela é uma
 * escolha de negócio — não uma consequência do cálculo. Um teste que a fixe é o
 * que impede a ordem de mudar sem alguém decidir mudá-la.
 */

const CRITICO = 20;

function posicao(p: Partial<PosicaoRisco> = {}): PosicaoRisco {
  const forecast = p.forecast ?? 300;
  const consumoDiario = forecast / 30;
  return {
    codigo: "1",
    descricao: "Item",
    filial: "1006",
    fornecedor: "ACME",
    bu: "MED",
    curva: "A",
    analista: "ANA",
    forecast,
    estoqueChao: 0,
    estoqueTotal: 0,
    consumoDiario,
    diasChao: 0,
    diasTotal: 0,
    dataRuptura: new Date("2026-09-10T00:00:00.000Z"),
    primeiraChegada: null,
    diasAteChegada: null,
    diasDescobertos: 10,
    severidade: "rompido",
    reposicoes: [],
    vendidoMes: 0,
    ritmo: { percentualForecast: 0, fracaoDecorrida: 0.33, indice: 0, status: "atrasada" },
    diasNoRitmo: null,
    saldoPlano: null,
    ...p,
  };
}

function chegada(): Reposicao {
  return {
    origem: "compra",
    quantidade: 100,
    chegada: new Date("2026-09-20T00:00:00.000Z"),
    etapas: [],
    rota: null,
    direto: true,
    reprojetada: false,
    inicio: "10/09/2026",
    documento: "5103",
    emissao: null,
    statusLogistica: null,
    dataAgendada: null,
    frete: null,
  };
}

function sugestao(p: PosicaoRisco): Sugestao {
  return {
    posicao: p,
    origem: "1002",
    sla: 2,
    chegada: new Date("2026-09-12T00:00:00.000Z"),
    diasCobertos: 8,
    quantidade: 80,
    tipo: "reposicao",
    origemDepois: 35,
  };
}

describe("decidirAcoes", () => {
  it("cobra quando já há carga a caminho, mesmo havendo transferência possível", () => {
    const p = posicao({ primeiraChegada: chegada(), reposicoes: [chegada()] });
    const [a] = decidirAcoes([p], [sugestao(p)], CRITICO);

    expect(a.tipo).toBe("cobrar");
    // A transferência não some: continua disponível como alternativa na tela.
    expect(a.transferencia).not.toBeNull();
    expect(a.quantidade).toBe(100);
  });

  it("transfere quando nada vem e há CD de origem", () => {
    const p = posicao();
    const [a] = decidirAcoes([p], [sugestao(p)], CRITICO);

    expect(a.tipo).toBe("transferir");
    expect(a.quantidade).toBe(80);
  });

  it("pede compra quando não há origem e sobra saldo no plano", () => {
    const p = posicao({
      saldoPlano: { plano: 1000, aberto: 400, recebido: 200, saldo: 400 },
    });
    const [a] = decidirAcoes([p], [], CRITICO);

    expect(a.tipo).toBe("comprar");
    expect(a.quantidade).toBe(400);
  });

  it("pede verba quando o plano acabou", () => {
    const p = posicao({
      saldoPlano: { plano: 1000, aberto: 1000, recebido: 0, saldo: 0 },
    });
    const [a] = decidirAcoes([p], [], CRITICO);

    expect(a.tipo).toBe("verba");
    // A quantidade da verba é o que falta para cobrir o vão: 10 dias × 10 un/dia.
    expect(a.quantidade).toBe(100);
  });

  it("trata produto fora do plano como pedido de verba", () => {
    const [a] = decidirAcoes([posicao({ saldoPlano: null })], [], CRITICO);
    expect(a.tipo).toBe("verba");
  });

  it("não cria tarefa quando a carga chega antes da ruptura", () => {
    const p = posicao({
      estoqueChao: 150,
      diasChao: 15,
      diasDescobertos: 0,
      severidade: "no_limite",
      primeiraChegada: chegada(),
      reposicoes: [chegada()],
    });

    expect(decidirAcoes([p], [], CRITICO)).toEqual([]);
  });

  it("ignora posições fora das faixas de foco", () => {
    const p = posicao({ estoqueChao: 900, diasChao: 90, diasDescobertos: 5 });
    expect(decidirAcoes([p], [], CRITICO)).toEqual([]);
  });

  it("acusa a ruptura que o forecast não vê", () => {
    // 45 dias de cobertura pelo forecast; no ritmo do mês, 1 dia.
    const p = posicao({
      forecast: 30,
      estoqueChao: 45,
      diasChao: 45,
      diasDescobertos: 0,
      severidade: "ok",
      vendidoMes: 450,
      diasNoRitmo: 1,
      ritmo: { percentualForecast: 15, fracaoDecorrida: 0.33, indice: 45, status: "acelerada" },
      saldoPlano: { plano: 100, aberto: 0, recebido: 0, saldo: 100 },
    });
    const [a] = decidirAcoes([p], [], CRITICO);

    expect(a.origem).toBe("aceleracao");
    expect(a.tipo).toBe("comprar");
    // O peso usa o consumo observado (45 un/dia), não o previsto (1 un/dia):
    // 19 dias descobertos × 45 = 855. Com o forecast daria 19.
    expect(Math.round(a.peso)).toBe(855);
  });

  it("ordena pelas unidades em risco, não pelos dias", () => {
    const giroAlto = posicao({ codigo: "alto", forecast: 3000, diasDescobertos: 5 });
    const giroBaixo = posicao({ codigo: "baixo", forecast: 30, diasDescobertos: 15 });

    const ordem = decidirAcoes([giroBaixo, giroAlto], [], CRITICO).map((a) => a.posicao.codigo);
    expect(ordem).toEqual(["alto", "baixo"]);
  });
});
