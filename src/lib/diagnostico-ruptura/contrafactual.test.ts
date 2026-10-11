import { describe, expect, it } from "vitest";

import {
  dividirDias,
  type Candidata,
} from "@/lib/diagnostico-ruptura/contrafactual";

/**
 * A divisão dos dias entre causas.
 *
 * É a conta que decide de quem é a ruptura, e vai para uma reunião semanal.
 * Um erro aqui não parece erro: parece um número, e alguém age sobre ele.
 *
 * Os invariantes que os testes protegem são os três que tornam a divisão
 * defensável numa discussão: a soma fecha com o total, causas equivalentes
 * recebem igual, e causa que não evita nada não recebe dia nenhum.
 */

const c = (
  slug: string,
  diasEvitados: number,
  evidencias: Record<string, unknown> = {},
): Candidata => ({ slug, diasEvitados, evidencias });

const soma = (a: { dias: number }[]) => a.reduce((x, y) => x + y.dias, 0);

describe("dividirDias", () => {
  it("reproduz o exemplo do PRD: 5 e 4 numa ruptura de 9 dias", () => {
    // Produto 7, CD XZ. Pedido na data limite evitaria 5 dias; fornecedor no
    // lead time padrão evitaria 4; os dois juntos, os 9. É o caso que o
    // documento define como resposta certa.
    const r = dividirDias([c("pedido_tarde", 5), c("fornecedor_atrasou", 4)], 9);
    const porSlug = Object.fromEntries(r.map((x) => [x.slug, x.dias]));
    expect(porSlug.pedido_tarde).toBeCloseTo(5, 6);
    expect(porSlug.fornecedor_atrasou).toBeCloseTo(4, 6);
    expect(r.some((x) => x.slug === "sem_evidencia")).toBe(false);
  });

  it("divide igualmente entre causas equivalentes", () => {
    // Duas causas que evitariam 6 dias cada, numa ruptura de 6: o teto obriga
    // a dividir, e não há motivo para uma levar mais que a outra.
    const r = dividirDias([c("a", 6), c("b", 6)], 6);
    expect(r[0].dias).toBeCloseTo(3, 6);
    expect(r[1].dias).toBeCloseTo(3, 6);
  });

  it("dá mais à causa maior quando o teto aperta", () => {
    // 5 e 4 numa ruptura de 6: a maior leva mais, mas nenhuma leva tudo.
    const r = dividirDias([c("grande", 5), c("pequena", 4)], 6);
    const porSlug = Object.fromEntries(r.map((x) => [x.slug, x.dias]));
    expect(porSlug.grande).toBeCloseTo(3.5, 6);
    expect(porSlug.pequena).toBeCloseTo(2.5, 6);
    expect(soma(r)).toBeCloseTo(6, 6);
  });

  it("a soma nunca passa do total, em nenhuma combinação", () => {
    // Varre combinações em vez de conferir uma: é onde a conta poderia estourar
    // sem ninguém notar, porque cada número isolado parece razoável.
    for (const total of [1, 3, 7, 30]) {
      for (const valores of [
        [1],
        [5, 5],
        [10, 1],
        [3, 3, 3],
        [20, 15, 10, 5],
        [2, 2, 2, 2, 2, 2],
      ]) {
        const r = dividirDias(
          valores.map((v, i) => c(`c${i}`, v)),
          total,
        );
        expect(soma(r)).toBeCloseTo(total, 6);
        for (const x of r) expect(x.dias).toBeGreaterThanOrEqual(-1e-9);
      }
    }
  });

  it("manda o resto para sem_evidencia em vez de inflar as causas", () => {
    // Uma causa evita 2 dias numa ruptura de 10: os outros 8 não têm
    // explicação, e dizer isso é o ponto. Distribuir os 8 entre as causas
    // conhecidas daria uma tela que sempre explica tudo e nunca aprende nada.
    const r = dividirDias([c("a", 2)], 10);
    const porSlug = Object.fromEntries(r.map((x) => [x.slug, x.dias]));
    expect(porSlug.a).toBeCloseTo(2, 6);
    expect(porSlug.sem_evidencia).toBeCloseTo(8, 6);
  });

  it("não cria sem_evidencia quando as causas explicam tudo", () => {
    const r = dividirDias([c("a", 6), c("b", 4)], 10);
    expect(r.some((x) => x.slug === "sem_evidencia")).toBe(false);
  });

  it("marca como observação a regra que falhou sem causar nada", () => {
    // Comprou pouco e o pedido chegou a tempo: o erro existiu, a ruptura não
    // veio dele. Aparece na tela, sem dias.
    const r = dividirDias([c("a", 5), c("comprou_pouco", 0)], 5);
    const obs = r.find((x) => x.slug === "comprou_pouco")!;
    expect(obs.papel).toBe("observacao");
    expect(obs.dias).toBe(0);
    expect(obs.percentual).toBe(0);
  });

  it("não deixa causa com papel `causa` sem dia nenhum", () => {
    const r = dividirDias([c("a", 4), c("b", 0), c("d", 0)], 4);
    for (const x of r) {
      if (x.papel === "causa") expect(x.dias).toBeGreaterThan(0);
    }
  });

  it("devolve só sem_evidencia quando nada explica", () => {
    const r = dividirDias([], 7);
    expect(r).toHaveLength(1);
    expect(r[0].slug).toBe("sem_evidencia");
    expect(r[0].dias).toBeCloseTo(7, 6);
  });

  it("percentual é sobre o total da ruptura, não sobre o explicado", () => {
    // Normalizar pelo explicado faria 2 de 10 dias virar 100%, e a tela
    // afirmaria ter explicado uma ruptura que mal arranhou.
    const r = dividirDias([c("a", 2)], 10);
    expect(r.find((x) => x.slug === "a")!.percentual).toBeCloseTo(20, 6);
  });

  it("é determinístico: mesma entrada, mesma saída", () => {
    const entrada = [c("a", 5), c("b", 3), c("d", 2)];
    const um = dividirDias(entrada, 8);
    const dois = dividirDias([...entrada].reverse(), 8);
    const chave = (r: typeof um) =>
      r.map((x) => `${x.slug}:${x.dias.toFixed(6)}`).sort().join("|");
    expect(chave(um)).toBe(chave(dois));
  });

  it("recusa mais causas do que a enumeração aguenta", () => {
    // Treze causas são 8.192 subconjuntos por evento. Falhar alto é melhor que
    // ficar lento em silêncio numa rodada de centenas de eventos.
    const muitas = Array.from({ length: 13 }, (_, i) => c(`c${i}`, 1));
    expect(() => dividirDias(muitas, 10)).toThrow(/enumeração/);
  });
});
