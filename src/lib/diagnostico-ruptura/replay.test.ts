import { describe, expect, it } from "vitest";

import {
  consumoDoForecast,
  consumoLimitado,
  diasDaJanela,
  diasEmRuptura,
  diasEvitados,
  consumoComoDemanda,
  rompidaPorDia,
  type Cenario,
} from "@/lib/diagnostico-ruptura/replay";

/**
 * O replay e o contrafactual.
 *
 * O teste que dá sentido ao arquivo é "venda acelerada que não causou ruptura":
 * é a regra de ouro do método. Uma regra ter falhado não faz dela a causa — se
 * limitar a venda ao previsto não evita nenhum dia sem estoque, a aceleração
 * não explica nada e não pode levar crédito.
 *
 * Sem essa verificação o motor viraria uma máquina de casar regra: toda venda
 * 20% acima viraria causa, toda compra pequena viraria causa, e a soma das
 * explicações cobriria rupturas que elas não produziram.
 */

const consumo = (...pares: [string, number][]) => new Map(pares);

describe("diasDaJanela", () => {
  it("inclui as duas pontas", () => {
    expect(diasDaJanela("2026-09-01", "2026-09-03")).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
    ]);
  });

  it("atravessa a virada de mês", () => {
    expect(diasDaJanela("2026-08-30", "2026-09-02")).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
    ]);
  });
});

describe("diasEmRuptura", () => {
  const base: Cenario = {
    de: "2026-09-01",
    ate: "2026-09-05",
    estoqueInicial: 100,
    consumo: consumo(
      ["2026-09-01", 30],
      ["2026-09-02", 30],
      ["2026-09-03", 30],
      ["2026-09-04", 30],
      ["2026-09-05", 30],
    ),
    chegadas: [],
  };

  it("conta os dias em que o estoque zerou", () => {
    // 100 unidades a 30/dia acabam no quarto dia: 01,02,03 ok; 04 e 05 sem.
    expect(diasEmRuptura(base)).toBe(2);
  });

  it("a chegada do dia atende a venda do dia", () => {
    // Sem isso, a reposição que chega exatamente no dia em que o estoque
    // acabaria criaria um dia de ruptura que não existiu — e é no limite que
    // a reposição costuma chegar.
    const r = diasEmRuptura({
      ...base,
      chegadas: [{ data: "2026-09-04", quantidade: 60 }],
    });
    expect(r).toBe(0);
  });

  it("não acumula dívida de estoque negativo", () => {
    // O que não havia não foi vendido. Se o saldo guardasse a dívida, a
    // reposição teria de cobrir o buraco antes de valer, e a tela mostraria
    // ruptura com a prateleira cheia.
    //
    // O caso distingue as duas contas: zera no dia 1 com 30 de demanda não
    // atendida, e no dia 2 chegam 30 sem mais consumo. Sem dívida, o dia 2 tem
    // 30 em estoque e a ruptura dura um dia. Com dívida, o dia 2 fecharia em
    // zero e a ruptura duraria dois.
    const r = diasEmRuptura({
      de: "2026-09-01",
      ate: "2026-09-03",
      estoqueInicial: 0,
      consumo: consumo(["2026-09-01", 30]),
      chegadas: [{ data: "2026-09-02", quantidade: 30 }],
    });
    expect(r).toBe(1);
  });

  it("ignora chegada fora da janela", () => {
    const r = diasEmRuptura({
      ...base,
      chegadas: [{ data: "2026-09-20", quantidade: 1000 }],
    });
    expect(r).toBe(2);
  });

  it("dia sem consumo não consome", () => {
    const r = diasEmRuptura({
      ...base,
      consumo: consumo(["2026-09-01", 100]),
    });
    // Zera no dia 1 e fica zerada: cinco dias.
    expect(r).toBe(5);
  });
});

describe("contrafactual", () => {
  const janela = { de: "2026-09-01", ate: "2026-09-10" };

  it("NÃO credita a venda acelerada quando a compra bastou", () => {
    // A regra de ouro. A venda veio 50% acima do previsto, mas a reposição foi
    // grande e chegou cedo: não houve um dia sequer sem estoque, nem no real
    // nem no cenário corrigido. A aceleração existiu e não causou nada.
    const real: Cenario = {
      ...janela,
      estoqueInicial: 100,
      consumo: new Map(diasDaJanela(janela.de, janela.ate).map((d) => [d, 15])),
      chegadas: [{ data: "2026-09-05", quantidade: 500 }],
    };
    const teto = consumoDoForecast(janela.de, janela.ate, 300); // 10/dia
    const corrigido: Cenario = {
      ...real,
      consumo: consumoLimitado(real.consumo, teto),
    };

    expect(diasEmRuptura(real)).toBe(0);
    expect(diasEvitados(real, corrigido)).toBe(0);
  });

  it("credita a venda acelerada quando ela de fato antecipou a falta", () => {
    // Mesmo estoque e mesma chegada, mas agora a chegada é tarde. Vendendo o
    // previsto o estoque teria durado até ela; vendendo acima, não durou.
    const real: Cenario = {
      ...janela,
      estoqueInicial: 100,
      consumo: new Map(diasDaJanela(janela.de, janela.ate).map((d) => [d, 15])),
      chegadas: [{ data: "2026-09-09", quantidade: 500 }],
    };
    const teto = consumoDoForecast(janela.de, janela.ate, 300);
    const corrigido: Cenario = {
      ...real,
      consumo: consumoLimitado(real.consumo, teto),
    };

    expect(diasEmRuptura(real)).toBeGreaterThan(0);
    expect(diasEvitados(real, corrigido)).toBeGreaterThan(0);
  });

  it("não credita nada quando o cenário corrigido é pior", () => {
    const real: Cenario = {
      ...janela,
      estoqueInicial: 100,
      consumo: new Map(diasDaJanela(janela.de, janela.ate).map((d) => [d, 10])),
      chegadas: [],
    };
    const pior: Cenario = {
      ...real,
      consumo: new Map(diasDaJanela(janela.de, janela.ate).map((d) => [d, 50])),
    };
    expect(diasEvitados(real, pior)).toBe(0);
  });

  it("credita a abertura quando o estoque inicial era o problema", () => {
    const real: Cenario = {
      ...janela,
      estoqueInicial: 20,
      consumo: new Map(diasDaJanela(janela.de, janela.ate).map((d) => [d, 10])),
      chegadas: [],
    };
    // 20 unidades a 10/dia zeram no segundo dia: nove dos dez dias sem
    // estoque, contando o dia que fecha em zero, que é ruptura pela definição.
    // Com a política cumprida — 15 dias de cobertura — não romperia nenhum.
    const corrigido: Cenario = { ...real, estoqueInicial: 150 };
    expect(diasEmRuptura(real)).toBe(9);
    expect(diasEmRuptura(corrigido)).toBe(0);
    expect(diasEvitados(real, corrigido)).toBe(9);
  });
});

describe("consumoLimitado", () => {
  it("corta só o excesso, não reescreve a demanda", () => {
    const real = consumo(["d1", 50], ["d2", 5]);
    const teto = consumo(["d1", 10], ["d2", 10]);
    expect([...consumoLimitado(real, teto)]).toEqual([
      ["d1", 10],
      ["d2", 5],
    ]);
  });

  it("mantém o dia sem teto definido", () => {
    const real = consumo(["d1", 50]);
    expect(consumoLimitado(real, new Map()).get("d1")).toBe(50);
  });
});

describe("rompidaPorDia", () => {
  it("carrega o estado para os dias sem carga", () => {
    // A cobertura de snapshot é de 28%: o vão entre cargas é a regra, não a
    // exceção. Tratá-lo como "tinha estoque" faria a falta sumir justamente
    // nos buracos de importação.
    const r = rompidaPorDia(
      "2026-09-01",
      "2026-09-06",
      new Map([
        ["2026-09-01", true],
        ["2026-09-05", false],
      ]),
    );
    expect([...r].sort()).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
    ]);
  });

  it("não inventa ruptura antes da primeira carga", () => {
    const r = rompidaPorDia(
      "2026-09-01",
      "2026-09-04",
      new Map([["2026-09-03", true]]),
    );
    expect([...r].sort()).toEqual(["2026-09-03", "2026-09-04"]);
  });
});

describe("consumoComoDemanda", () => {
  const janela = { de: "2026-09-01", ate: "2026-09-04" };

  it("usa a venda realizada no dia em que havia estoque", () => {
    const c = consumoComoDemanda({
      ...janela,
      vendas: new Map([["2026-09-01", 7]]),
      rompidaEm: new Set(),
      forecastMensal: 300, // 10/dia
    });
    expect(c.get("2026-09-01")).toBe(7);
    // Vender zero com estoque é um fato sobre a demanda, não uma lacuna.
    expect(c.get("2026-09-02")).toBe(0);
  });

  it("usa o forecast no dia sem estoque", () => {
    // É a correção que conserta a circularidade: a posição rompida não vende
    // porque está rompida, e sem isto o consumo some justamente na falta.
    const c = consumoComoDemanda({
      ...janela,
      vendas: new Map(),
      rompidaEm: new Set(["2026-09-03"]),
      forecastMensal: 300,
    });
    expect(c.get("2026-09-03")).toBe(10);
    expect(c.get("2026-09-02")).toBe(0);
  });

  it("respeita a venda parcial maior que o forecast", () => {
    // Atendeu parte antes de acabar: a demanda foi pelo menos isso.
    const c = consumoComoDemanda({
      ...janela,
      vendas: new Map([["2026-09-03", 25]]),
      rompidaEm: new Set(["2026-09-03"]),
      forecastMensal: 300,
    });
    expect(c.get("2026-09-03")).toBe(25);
  });

  it("faz o replay reproduzir a ruptura que a venda realizada escondia", () => {
    // O caso que motivou a correção, em miniatura: posição abre zerada, não
    // vende nada (porque não tem o que vender) e o snapshot a mostra rompida.
    // Com venda realizada, o estoque simulado nunca cai e uma unidade
    // "resolveria". Com demanda, a falta aparece do tamanho que é.
    const rompida = rompidaPorDia(
      janela.de,
      janela.ate,
      new Map([["2026-09-01", true]]),
    );
    const comVendaReal = diasEmRuptura({
      ...janela,
      estoqueInicial: 0,
      consumo: new Map(),
      chegadas: [{ data: "2026-09-01", quantidade: 1 }],
    });
    const comDemanda = diasEmRuptura({
      ...janela,
      estoqueInicial: 0,
      consumo: consumoComoDemanda({
        ...janela,
        vendas: new Map(),
        rompidaEm: rompida,
        forecastMensal: 300,
      }),
      chegadas: [{ data: "2026-09-01", quantidade: 1 }],
    });
    expect(comVendaReal).toBe(0); // uma unidade "resolvia" — ficção
    expect(comDemanda).toBe(4); // a falta aparece inteira
  });
});
