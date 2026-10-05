import { describe, expect, it } from "vitest";

import {
  PAINEL_LARGURA,
  posicaoPainel,
} from "@/components/disponibilidade/tabela-periodica";

/**
 * Onde o painel de detalhe da tabela de cobertura é desenhado.
 *
 * O arquivo existe por um bug que chegou ao uso: o painel virou `fixed` quando
 * o cabeçalho foi congelado, e a primeira versão *estimava* a altura dele em
 * 300px para decidir se cabia abaixo da célula. Com o painel mais alto que o
 * chute, a conta o posicionava em cima da própria célula — ele nascia debaixo
 * do cursor, roubava o hover, a célula disparava `onMouseLeave` e ele fechava
 * no mesmo quadro. Para quem usava, era tooltip que simplesmente não abria.
 *
 * A correção foi parar de adivinhar: ancorar a borda oposta, e deixar o painel
 * crescer para longe da célula seja qual for o tamanho dele. O que estes testes
 * protegem é essa propriedade — **o painel nunca cobre a célula que o abriu**,
 * em nenhuma posição da tela.
 */

const JANELA = { largura: 1440, altura: 900 };

/** Uma célula de 80px, como as da grade. */
const celula = (top: number, left: number) => ({
  top,
  bottom: top + 80,
  left,
  right: left + 80,
});

describe("posicaoPainel", () => {
  it("abre abaixo da célula quando há espaço", () => {
    const p = posicaoPainel(celula(100, 200), JANELA);
    expect(p.top).toBe(184); // 100 + 80 + 4
    expect(p.bottom).toBeUndefined();
    expect(p.left).toBe(200);
  });

  it("abre acima quando o espaço de baixo é menor", () => {
    const p = posicaoPainel(celula(700, 200), JANELA);
    // Ancora a borda de baixo logo acima da célula: 900 - 700 + 4.
    expect(p.bottom).toBe(204);
    expect(p.top).toBeUndefined();
  });

  it("nunca cobre a célula, em nenhuma altura da tela", () => {
    // É a propriedade que o bug violava. Varre a tela inteira em vez de testar
    // dois pontos escolhidos a dedo, que foi como ele passou despercebido.
    for (let top = 0; top <= JANELA.altura - 80; top += 10) {
      const c = celula(top, 300);
      const p = posicaoPainel(c, JANELA);

      if (p.top !== undefined) {
        // Desce: tem de começar abaixo da célula.
        expect(Number(p.top)).toBeGreaterThanOrEqual(c.bottom);
      } else {
        // Sobe: a borda de baixo do painel, convertida para coordenada de tela,
        // tem de terminar acima do topo da célula.
        const fimDoPainel = JANELA.altura - Number(p.bottom);
        expect(fimDoPainel).toBeLessThanOrEqual(c.top);
      }
    }
  });

  it("limita a altura ao espaço que existe daquele lado", () => {
    const abaixo = posicaoPainel(celula(100, 200), JANELA);
    expect(Number(abaixo.maxHeight)).toBe(900 - 180 - 8);

    const acima = posicaoPainel(celula(700, 200), JANELA);
    expect(Number(acima.maxHeight)).toBe(700 - 8);
  });

  it("nunca pede altura negativa", () => {
    // Célula colada no topo e célula colada na base: os dois extremos.
    for (const top of [0, JANELA.altura - 80]) {
      const p = posicaoPainel(celula(top, 200), JANELA);
      expect(Number(p.maxHeight)).toBeGreaterThanOrEqual(0);
    }
  });

  it("ancora à direita quando a célula está perto da borda", () => {
    const p = posicaoPainel(celula(100, 1300), JANELA);
    expect(p.left).toBeUndefined();
    // 1440 - 1380 = 60: o painel cresce para a esquerda a partir daí.
    expect(p.right).toBe(60);
  });

  it("mantém folga mínima na borda direita", () => {
    // Célula encostada na borda: sem o piso, `right` seria 0 e o painel
    // ficaria colado no limite da tela.
    const p = posicaoPainel(
      { top: 100, bottom: 180, left: 1430, right: 1440 },
      JANELA,
    );
    expect(Number(p.right)).toBeGreaterThanOrEqual(8);
  });

  it("não deixa o painel vazar da tela, em nenhuma largura", () => {
    // A propriedade é "cabe na tela", não "abre para tal lado": a célula
    // encostada à esquerda num celular ainda tem a largura inteira à direita, e
    // ancorar à esquerda ali está certo. Testar o lado engessaria a decisão sem
    // proteger nada.
    for (const janela of [
      { largura: 390, altura: 760 }, // celular
      { largura: 820, altura: 1100 }, // tablet
      { largura: 1440, altura: 900 }, // desktop
    ]) {
      for (let left = 0; left <= janela.largura - 80; left += 10) {
        const p = posicaoPainel(celula(200, left), janela);

        if (p.left !== undefined) {
          // Ancorado à esquerda: só é escolhido quando o painel cabe daí
          // até a borda.
          expect(Number(p.left) + PAINEL_LARGURA).toBeLessThanOrEqual(
            janela.largura,
          );
        } else {
          expect(Number(p.right)).toBeGreaterThanOrEqual(8);
        }
      }
    }
  });
});
