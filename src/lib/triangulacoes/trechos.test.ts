import { describe, expect, it } from "vitest";

import type { LinhaTriangulacao, ProdutoTriangulando } from "./consultas";
import { montarTrechos, posicaoNaRota, totaisAgora } from "./trechos";

function etapa(de: string, para: string, chegada?: string) {
  return {
    de,
    para,
    transitTime: 2,
    chegadaPrevista: chegada ? new Date(`${chegada}T00:00:00.000Z`) : null,
  };
}

function linha(
  p: Partial<LinhaTriangulacao> & { codigo: string },
): LinhaTriangulacao {
  return {
    id: 1,
    origem: "transferencia",
    documento: "NF1",
    quantidade: 10,
    valor: 1000,
    rota: "A > B > C",
    origemAtual: "1001",
    dataEmissao: null,
    inicio: "saída",
    dataAgendada: null,
    statusLogistica: null,
    etapas: [],
    cdFinal: null,
    chegadaFinal: null,
    reprojetada: false,
    ...p,
  };
}

function produto(
  codigo: string,
  linhas: LinhaTriangulacao[],
): ProdutoTriangulando {
  return {
    codigo,
    descricao: `Produto ${codigo}`,
    fornecedor: "ACME",
    linhas,
    quantidade: 0,
    valorTransferencia: 0,
    valorCompra: 0,
    destinos: [],
  };
}

describe("posicaoNaRota", () => {
  it("acha a perna pelo par de paradas", () => {
    expect(posicaoNaRota(["DF2", "CAJ", "ES", "LDA"], "CAJ", "ES")).toBe(2);
    expect(posicaoNaRota(["DF2", "CAJ", "ES", "LDA"], "DF2", "CAJ")).toBe(1);
    expect(posicaoNaRota(["DF2", "CAJ", "ES", "LDA"], "ES", "LDA")).toBe(3);
  });

  it("não se perde em rota que passa duas vezes pelo mesmo CD", () => {
    // "ES > CAJ > ES" existe na base. Procurar só o destino acharia a perna
    // errada e a tela mostraria a carga no começo do caminho estando no fim.
    expect(posicaoNaRota(["ES", "CAJ", "ES"], "CAJ", "ES")).toBe(2);
    expect(posicaoNaRota(["ES", "CAJ", "ES"], "ES", "CAJ")).toBe(1);
  });

  it("devolve -1 quando o par não está na rota", () => {
    // Sigla fora do cadastro: melhor dizer "não sei" do que fingir a primeira.
    expect(posicaoNaRota(["DF2", "CAJ"], "ES", "LDA")).toBe(-1);
    expect(posicaoNaRota([], "A", "B")).toBe(-1);
    // Par existente, mas fora de ordem: não é uma perna daquela rota.
    expect(posicaoNaRota(["DF2", "CAJ", "ES"], "ES", "CAJ")).toBe(-1);
  });
});

describe("montarTrechos", () => {
  it("junta as rotas que passam pelo trecho, com a posição de cada uma", () => {
    const siglas = new Map([
      ["1", "DF2"],
      ["2", "CAJ"],
      ["3", "ES"],
    ]);
    const trechos = montarTrechos(
      [
        produto("A", [
          linha({
            codigo: "A",
            rota: "DF2 > CAJ > ES",
            valor: 100,
            etapas: [etapa("1", "2")],
          }),
        ]),
        produto("B", [
          linha({
            codigo: "B",
            rota: "DF2 > CAJ",
            valor: 900,
            etapas: [etapa("1", "2")],
          }),
        ]),
      ],
      siglas,
    );

    const t = trechos.find((x) => x.id === "1->2")!;
    // Ordenadas por valor: a que pesa mais aparece primeiro na capa.
    expect(t.rotas.map((r) => r.rota)).toEqual(["DF2 > CAJ", "DF2 > CAJ > ES"]);
    // Em ambas, este trecho é a primeira perna — chega na parada de índice 1.
    expect(t.rotas.every((r) => r.posicao === 1)).toBe(true);
    expect(t.rotas[0].valor).toBe(900);
    expect(t.rotas[0].documentos).toBe(1);
  });

  it("separa por origem dentro da rota, que é o que dá a cor da trilha", () => {
    const trechos = montarTrechos(
      [
        produto("A", [
          linha({
            codigo: "A",
            rota: "A > B",
            origem: "compra",
            valor: 700,
            etapas: [etapa("1", "2")],
          }),
          linha({
            codigo: "A",
            rota: "A > B",
            origem: "transferencia",
            valor: 300,
            etapas: [etapa("1", "2")],
          }),
        ]),
      ],
      new Map([
        ["1", "A"],
        ["2", "B"],
      ]),
    );
    expect(trechos[0].rotas[0].valorCompra).toBe(700);
    expect(trechos[0].rotas[0].valorTransferencia).toBe(300);
  });

  it("põe o documento em 'agora' no trecho atual e em 'depois' nos seguintes", () => {
    const trechos = montarTrechos([
      produto("A", [
        linha({
          codigo: "A",
          etapas: [
            etapa("1006", "1015", "2026-10-02"),
            etapa("1015", "1002", "2026-10-09"),
          ],
        }),
      ]),
    ]);

    const atual = trechos.find((t) => t.id === "1006->1015")!;
    const futuro = trechos.find((t) => t.id === "1015->1002")!;

    expect(atual.agora.documentos).toBe(1);
    expect(atual.depois.documentos).toBe(0);
    expect(futuro.agora.documentos).toBe(0);
    expect(futuro.depois.documentos).toBe(1);
  });

  it("soma de 'agora' reproduz o total, porque cada documento cai em um trecho só", () => {
    // É o requisito central: a visão gerencial tem de bater com a tela de
    // triangulações. Contar 'depois' junto quebraria isso, e é por isso que os
    // dois são campos separados em vez de um número somado.
    const linhas = [
      linha({
        codigo: "A",
        valor: 1000,
        etapas: [etapa("1", "2"), etapa("2", "3"), etapa("3", "4")],
      }),
      linha({
        codigo: "B",
        valor: 500,
        etapas: [etapa("2", "3"), etapa("3", "4")],
      }),
      linha({ codigo: "C", valor: 250, etapas: [etapa("3", "4")] }),
    ];
    const trechos = montarTrechos([
      produto("A", [linhas[0]]),
      produto("B", [linhas[1]]),
      produto("C", [linhas[2]]),
    ]);

    expect(totaisAgora(trechos).valor).toBe(1750);
    expect(totaisAgora(trechos).documentos).toBe(3);

    // O trecho 3->4 é percorrido por todos os três, mas só o C está nele agora.
    const t34 = trechos.find((t) => t.id === "3->4")!;
    expect(t34.agora.valor).toBe(250);
    expect(t34.depois.valor).toBe(1500);
  });

  it("separa os valores por origem, que vêm de colunas diferentes", () => {
    const trechos = montarTrechos([
      produto("A", [
        linha({
          codigo: "A",
          origem: "transferencia",
          valor: 300,
          etapas: [etapa("1", "2")],
        }),
        linha({
          codigo: "A",
          origem: "compra",
          valor: 700,
          etapas: [etapa("1", "2")],
        }),
      ]),
    ]);
    const t = trechos[0];
    expect(t.agora.valorTransferencia).toBe(300);
    expect(t.agora.valorCompra).toBe(700);
    expect(t.agora.notas).toBe(1);
    expect(t.agora.pedidos).toBe(1);
    expect(t.agora.valor).toBe(1000);
  });

  it("conta produtos distintos, não documentos", () => {
    // O mesmo item chega em várias notas; contar documentos infla a leitura de
    // "quantos produtos estão parados aqui".
    const trechos = montarTrechos([
      produto("A", [
        linha({ codigo: "A", documento: "NF1", etapas: [etapa("1", "2")] }),
        linha({ codigo: "A", documento: "NF2", etapas: [etapa("1", "2")] }),
      ]),
    ]);
    expect(trechos[0].agora.produtos).toBe(1);
    expect(trechos[0].agora.documentos).toBe(2);
  });

  it("valor nulo na origem entra como zero, sem inventar número", () => {
    const trechos = montarTrechos([
      produto("A", [
        linha({ codigo: "A", valor: null, etapas: [etapa("1", "2")] }),
      ]),
    ]);
    expect(trechos[0].agora.valor).toBe(0);
    expect(trechos[0].agora.documentos).toBe(1);
  });

  it("guarda a chegada mais próxima do trecho", () => {
    const trechos = montarTrechos([
      produto("A", [
        linha({ codigo: "A", etapas: [etapa("1", "2", "2026-10-20")] }),
        linha({ codigo: "B", etapas: [etapa("1", "2", "2026-10-05")] }),
        linha({ codigo: "C", etapas: [etapa("1", "2")] }),
      ]),
    ]);
    expect(trechos[0].agora.proximaChegada?.toISOString().slice(0, 10)).toBe(
      "2026-10-05",
    );
  });

  it("ignora linha sem etapa, que é a rota que não pôde ser resolvida", () => {
    const trechos = montarTrechos([
      produto("A", [linha({ codigo: "A", etapas: [] })]),
    ]);
    expect(trechos).toHaveLength(0);
  });

  it("ordena por valor presente, que é onde o capital está parado", () => {
    const trechos = montarTrechos([
      produto("A", [
        linha({ codigo: "A", valor: 100, etapas: [etapa("1", "2")] }),
      ]),
      produto("B", [
        linha({ codigo: "B", valor: 900, etapas: [etapa("3", "4")] }),
      ]),
    ]);
    expect(trechos.map((t) => t.id)).toEqual(["3->4", "1->2"]);
  });
});
