/**
 * A divisão dos dias de ruptura entre as causas que a produziram.
 *
 * O problema: três coisas falharam, a ruptura durou nove dias, e consertar
 * qualquer uma delas sozinha teria evitado cinco. Quanto cabe a cada uma?
 * Somar os cinco de cada daria quinze dias numa ruptura de nove.
 *
 * A resposta é o **valor de Shapley**: o que cada causa contribui, em média,
 * considerando todas as ordens em que as causas poderiam ter sido corrigidas.
 * É a única divisão que satisfaz as três propriedades que a tela precisa —
 * a soma fecha com o total, causas iguais recebem igual, e causa que não muda
 * nada recebe zero.
 *
 * **Custo.** O PRD estimava 720 execuções para seis causas (6!). São 64: o
 * valor se calcula a partir dos **subconjuntos**, 2ⁿ, não das permutações, n!.
 * Onze vezes mais barato, e exato do mesmo jeito.
 */

/** Uma causa candidata e quantos dias o conserto dela teria evitado sozinho. */
export type Candidata = {
  slug: string;
  /** Dias de ruptura que sumiriam se só esta causa fosse corrigida. */
  diasEvitados: number;
  /** A prova: o que o motor leu para chegar a esse número. */
  evidencias: Record<string, unknown>;
};

/** O resultado da divisão. */
export type Atribuicao = {
  slug: string;
  dias: number;
  percentual: number;
  /**
   * `causa` quando o conserto reduziria a ruptura; `observacao` quando a regra
   * falhou mas corrigi-la não mudaria nada.
   *
   * A distinção é o que impede o diagnóstico de acusar por acusar: comprar
   * pouco é um erro mesmo quando o pedido chegou a tempo, e dizer isso sem
   * cobrar dias dele é mais útil que esconder ou que culpar.
   */
  papel: "causa" | "observacao";
  evidencias: Record<string, unknown>;
};

/**
 * Quantos dias a ruptura teria durado a menos se um conjunto de causas fosse
 * corrigido junto.
 *
 * Os efeitos não se somam indefinidamente: a ruptura tem um teto, que é a
 * própria duração dela. Corrigir duas causas que evitariam seis dias cada uma
 * não evita doze dias numa ruptura de nove — evita nove.
 *
 * O teto é o que torna a divisão interessante. Sem ele, cada causa levaria
 * exatamente o que evita sozinha e Shapley seria uma soma.
 */
function valor(
  conjunto: Candidata[],
  totalDias: number,
): number {
  const soma = conjunto.reduce((a, c) => a + c.diasEvitados, 0);
  return Math.min(totalDias, soma);
}

/** Fatorial pequeno, memorizado; n nunca passa de uma dúzia aqui. */
const FAT: number[] = [1];
function fatorial(n: number): number {
  for (let i = FAT.length; i <= n; i++) FAT[i] = FAT[i - 1] * i;
  return FAT[n];
}

/**
 * Divide os dias entre as causas.
 *
 * `totalDias` é a duração real da ruptura. O que sobra depois da divisão — os
 * dias que nenhuma causa explica — fica de fora e vira `sem_evidencia` em
 * quem chama: é informação, não resíduo a esconder.
 *
 * Acima de doze causas a enumeração de subconjuntos passa de quatro mil por
 * evento. Não acontece com o catálogo atual, e se um dia acontecer é melhor
 * falhar visivelmente do que ficar lento em silêncio.
 */
export function dividirDias(
  candidatas: Candidata[],
  totalDias: number,
): Atribuicao[] {
  const uteis = candidatas.filter((c) => c.diasEvitados > 0);
  const inuteis = candidatas.filter((c) => c.diasEvitados <= 0);

  if (uteis.length > 12) {
    throw new Error(
      `dividirDias: ${uteis.length} causas é mais do que a enumeração suporta`,
    );
  }

  const n = uteis.length;
  const dias = new Map<string, number>();

  for (let i = 0; i < n; i++) {
    let acumulado = 0;
    // Todos os subconjuntos dos **outros**, por máscara de bits.
    const outros = uteis.filter((_, j) => j !== i);
    for (let mascara = 0; mascara < 1 << outros.length; mascara++) {
      const s = outros.filter((_, j) => (mascara & (1 << j)) !== 0);
      const marginal =
        valor([...s, uteis[i]], totalDias) - valor(s, totalDias);
      // Peso: quantas ordens põem exatamente este subconjunto antes de `i`.
      const peso =
        (fatorial(s.length) * fatorial(n - s.length - 1)) / fatorial(n);
      acumulado += peso * marginal;
    }
    dias.set(uteis[i].slug, acumulado);
  }

  const explicado = [...dias.values()].reduce((a, d) => a + d, 0);

  const atribuidas: Atribuicao[] = uteis.map((c) => {
    const d = dias.get(c.slug) ?? 0;
    return {
      slug: c.slug,
      dias: d,
      // Sobre o total da ruptura, não sobre o explicado: a tela precisa
      // mostrar que 60% foi explicado e 40% não, e normalizar pelo explicado
      // esconderia exatamente isso.
      percentual: totalDias > 0 ? (d / totalDias) * 100 : 0,
      papel: "causa",
      evidencias: c.evidencias,
    };
  });

  const observadas: Atribuicao[] = inuteis.map((c) => ({
    slug: c.slug,
    dias: 0,
    percentual: 0,
    papel: "observacao",
    evidencias: c.evidencias,
  }));

  const resto = totalDias - explicado;
  const semEvidencia: Atribuicao[] =
    resto > 0.005
      ? [
          {
            slug: "sem_evidencia",
            dias: resto,
            percentual: (resto / totalDias) * 100,
            papel: "causa",
            evidencias: {
              valores: {
                dias_totais: totalDias,
                dias_explicados: explicado,
              },
            },
          },
        ]
      : [];

  return [...atribuidas, ...semEvidencia, ...observadas].sort(
    (a, b) => b.dias - a.dias || a.slug.localeCompare(b.slug),
  );
}
