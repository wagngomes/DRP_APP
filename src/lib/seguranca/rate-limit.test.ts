import { beforeEach, describe, expect, it } from "vitest";

import { sair, tentarEntrar, verificar, verificarCamadas, zerar } from "./rate-limit";

/**
 * Armazém isolado por teste: o de produção vive no `globalThis`, e testes que
 * compartilham estado passam ou falham conforme a ordem em que rodam.
 */
function armazemDeTeste() {
  const m = new Map<string, number[]>();
  return {
    ler: (k: string) => m.get(k),
    gravar: (k: string, v: number[]) => void m.set(k, v),
    apagar: (k: string) => void m.delete(k),
  };
}

describe("verificar", () => {
  it("permite até o teto e recusa a seguinte", () => {
    const a = armazemDeTeste();
    const regra = { max: 3, janelaSegundos: 60 };
    expect(verificar("x", regra, a).permitido).toBe(true);
    expect(verificar("x", regra, a).permitido).toBe(true);
    expect(verificar("x", regra, a).permitido).toBe(true);
    expect(verificar("x", regra, a).permitido).toBe(false);
  });

  it("informa quantas ainda cabem", () => {
    const a = armazemDeTeste();
    const regra = { max: 3, janelaSegundos: 60 };
    expect(verificar("x", regra, a).restantes).toBe(2);
    expect(verificar("x", regra, a).restantes).toBe(1);
    expect(verificar("x", regra, a).restantes).toBe(0);
  });

  it("diz quanto esperar quando recusa", () => {
    const a = armazemDeTeste();
    const regra = { max: 1, janelaSegundos: 60 };
    verificar("x", regra, a);
    const r = verificar("x", regra, a);
    expect(r.permitido).toBe(false);
    expect(r.esperarSegundos).toBeGreaterThan(0);
    expect(r.esperarSegundos).toBeLessThanOrEqual(60);
  });

  it("conta cada chave separadamente", () => {
    const a = armazemDeTeste();
    const regra = { max: 1, janelaSegundos: 60 };
    expect(verificar("ip-1", regra, a).permitido).toBe(true);
    expect(verificar("ip-2", regra, a).permitido).toBe(true);
  });

  it("libera quando a janela passa", () => {
    const a = armazemDeTeste();
    const regra = { max: 1, janelaSegundos: 1 };
    // Marca uma requisição com dois segundos de idade: já fora da janela.
    a.gravar("x|1", [Date.now() - 2000]);
    expect(verificar("x", regra, a).permitido).toBe(true);
  });
});

describe("verificarCamadas", () => {
  const camadas = [
    { max: 3, janelaSegundos: 60 },
    { max: 5, janelaSegundos: 3600 },
  ];

  it("aplica a camada mais restritiva", () => {
    const a = armazemDeTeste();
    for (let i = 0; i < 3; i++) expect(verificarCamadas("x", camadas, a).permitido).toBe(true);
    // A de hora ainda tem folga, mas a de minuto estourou.
    expect(verificarCamadas("x", camadas, a).permitido).toBe(false);
  });

  it("a camada longa segura quem espera a curta liberar", () => {
    const a = armazemDeTeste();
    // Cinco na janela de hora, distribuídas fora da janela de minuto.
    a.gravar("x|3600", Array.from({ length: 5 }, (_, i) => Date.now() - (i + 2) * 60_000));
    const r = verificarCamadas("x", camadas, a);
    expect(r.permitido).toBe(false);
    // É a barreira de moagem lenta: sem ela, bastaria esperar um minuto entre
    // rajadas para tentar indefinidamente.
    expect(r.esperarSegundos).toBeGreaterThan(60);
  });

  it("zerar libera todas as camadas", () => {
    const a = armazemDeTeste();
    for (let i = 0; i < 3; i++) verificarCamadas("x", camadas, a);
    expect(verificarCamadas("x", camadas, a).permitido).toBe(false);
    zerar("x", camadas, a);
    expect(verificarCamadas("x", camadas, a).permitido).toBe(true);
  });
});

describe("controle de concorrência", () => {
  beforeEach(() => {
    // O contador de concorrência é global; devolve o que porventura ficou.
    for (let i = 0; i < 5; i++) sair("teste");
  });

  it("permite até o máximo simultâneo", () => {
    expect(tentarEntrar("teste", 1)).toBe(true);
    expect(tentarEntrar("teste", 1)).toBe(false);
  });

  it("libera a vaga ao sair", () => {
    expect(tentarEntrar("teste", 1)).toBe(true);
    sair("teste");
    expect(tentarEntrar("teste", 1)).toBe(true);
  });

  it("não fica com contagem negativa se sair demais", () => {
    sair("teste");
    sair("teste");
    expect(tentarEntrar("teste", 1)).toBe(true);
  });
});
