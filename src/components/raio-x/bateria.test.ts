import { describe, expect, it } from "vitest";

import { cargaBateria } from "@/components/raio-x/cartoes";

/**
 * A barra de carga do card de venda do mês anterior.
 *
 * O pedido tinha duas metades que puxam para lados opostos: vendendo menos que
 * o previsto sobra espaço vazio no fim da barra; vendendo mais, o excedente
 * aparece em vermelho. Fixar a barra no previsto atenderia a primeira e
 * quebraria a segunda — 200% e 400% desenhariam a mesma barra cheia.
 *
 * A saída foi escalar pelo maior entre previsto e realizado. Estes testes
 * fixam as duas leituras e a passagem de uma para a outra, que é onde uma
 * mudança descuidada quebraria metade do comportamento sem tocar na outra.
 */
describe("cargaBateria", () => {
  it("deixa o espaço do que faltou quando vendeu abaixo", () => {
    const b = cargaBateria(0.79);
    expect(b.dentro).toBeCloseTo(79, 10);
    expect(b.excedente).toBe(0);
    // O vazio é o que não vendeu: 21% da barra.
    expect(100 - b.dentro - b.excedente).toBeCloseTo(21, 10);
  });

  it("enche a barra exatamente no plano", () => {
    const b = cargaBateria(1);
    expect(b.dentro).toBe(100);
    expect(b.excedente).toBe(0);
  });

  it("mostra o excedente em barra cheia quando vendeu acima", () => {
    const b = cargaBateria(1.3);
    // 1 de 1,3 é o plano; 0,3 de 1,3 é o que passou.
    expect(b.dentro).toBeCloseTo(76.923, 3);
    expect(b.excedente).toBeCloseTo(23.077, 3);
    expect(b.dentro + b.excedente).toBeCloseTo(100, 10);
  });

  it("distingue excessos de tamanhos diferentes", () => {
    // É o caso que derrubaria a barra fixa no previsto: as duas encheriam
    // igual, e o dobro pareceria o quádruplo.
    const dobro = cargaBateria(2);
    const quadruplo = cargaBateria(4);
    expect(dobro.excedente).toBeCloseTo(50, 10);
    expect(quadruplo.excedente).toBeCloseTo(75, 10);
    expect(quadruplo.excedente).toBeGreaterThan(dobro.excedente);
  });

  it("nunca passa de 100% de largura somada, em nenhum índice", () => {
    for (let i = 0; i <= 10; i += 0.05) {
      const b = cargaBateria(i);
      expect(b.dentro + b.excedente).toBeLessThanOrEqual(100.0001);
      expect(b.dentro).toBeGreaterThanOrEqual(0);
      expect(b.excedente).toBeGreaterThanOrEqual(0);
    }
  });

  it("cresce de forma monótona dentro do plano", () => {
    let anterior = -1;
    for (const i of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      const b = cargaBateria(i);
      expect(b.dentro).toBeGreaterThan(anterior);
      anterior = b.dentro;
    }
  });

  it("não desenha largura negativa com índice negativo", () => {
    // Não deveria acontecer, mas largura negativa quebra o layout em silêncio.
    const b = cargaBateria(-0.5);
    expect(b.dentro).toBe(0);
    expect(b.excedente).toBe(0);
  });
});
