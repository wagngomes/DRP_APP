import { describe, expect, it } from "vitest";

import {
  chaveAbertura,
  mesDaChave,
  mesesQuePodeAbrir,
  resolverAbertura,
} from "./abertura-mes";

const SNAPSHOTS = [
  "2026-07-28",
  "2026-08-06",
  "2026-08-10",
  "2026-08-26",
  "2026-09-01",
  "2026-09-11",
];

describe("chaveAbertura / mesDaChave", () => {
  it("aceita mês com ou sem dia", () => {
    expect(chaveAbertura("2026-08")).toBe("abertura:simulador:2026-08");
    expect(chaveAbertura("2026-08-01")).toBe("abertura:simulador:2026-08");
  });

  it("volta para o mês, e ignora chave de outro assunto", () => {
    expect(mesDaChave("abertura:simulador:2026-08")).toBe("2026-08");
    expect(mesDaChave("data_referencia")).toBeNull();
    expect(mesDaChave("abertura:simulador:lixo")).toBeNull();
  });
});

describe("resolverAbertura", () => {
  it("usa a marca quando existe", () => {
    const marcas = new Map([["abertura:simulador:2026-08", "2026-08-10"]]);
    expect(resolverAbertura("2026-08", marcas, SNAPSHOTS)).toEqual({
      data: "2026-08-10",
      origem: "marcada",
    });
  });

  it("aceita marca fora do próprio mês", () => {
    // A última carga de julho é a posição imediatamente anterior à virada, e
    // muitas vezes é ela a melhor foto de como agosto começou.
    const marcas = new Map([["abertura:simulador:2026-08", "2026-07-28"]]);
    expect(resolverAbertura("2026-08", marcas, SNAPSHOTS)).toMatchObject({
      data: "2026-07-28",
      origem: "marcada",
    });
  });

  it("sem marca, cai no primeiro snapshot do mês", () => {
    // Agosto não tem carga no dia 1º: a primeira é a do dia 6.
    expect(resolverAbertura("2026-08", new Map(), SNAPSHOTS)).toEqual({
      data: "2026-08-06",
      origem: "primeira-do-mes",
    });
  });

  it("ignora marca que aponta para carga apagada", () => {
    // Apontar para uma data que não existe mais devolveria tela vazia sem
    // explicação; o palpite é pior que a marca, mas melhor que o nada.
    const marcas = new Map([["abertura:simulador:2026-08", "2026-08-99"]]);
    expect(resolverAbertura("2026-08", marcas, SNAPSHOTS)).toEqual({
      data: "2026-08-06",
      origem: "primeira-do-mes",
    });
  });

  it("diz que não há abertura quando o mês não tem carga nenhuma", () => {
    expect(resolverAbertura("2026-06", new Map(), SNAPSHOTS)).toEqual({
      data: null,
      origem: "ausente",
    });
  });

  it("não confunde o mês pedido com outro de mesmo dia", () => {
    expect(resolverAbertura("2026-09", new Map(), SNAPSHOTS)).toMatchObject({
      data: "2026-09-01",
    });
  });
});

describe("mesesQuePodeAbrir", () => {
  it("oferece o mês da carga e o seguinte", () => {
    expect(mesesQuePodeAbrir("2026-07-28")).toEqual(["2026-07", "2026-08"]);
  });

  it("vira o ano corretamente", () => {
    expect(mesesQuePodeAbrir("2026-12-30")).toEqual(["2026-12", "2027-01"]);
  });
});
