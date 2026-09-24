/**
 * Junta grafias diferentes do mesmo rótulo.
 *
 * As bases de S&OP e contratos vêm de planilhas preenchidas à mão, e o mesmo
 * valor aparece escrito de várias formas: "Reportado no último forecast" e
 * "Reportado no ultimo forecast" (sem acento), "Adicional de Contratos" e
 * "Adicional Contratos". Agrupar pelo texto cru produz duas linhas para a
 * mesma coisa — e a soma de cada uma parece pequena demais.
 *
 * A chave ignora acento, caixa, pontuação e palavras de ligação. O rótulo
 * exibido é a grafia mais frequente, não a primeira encontrada: assim a tela
 * mostra como a maioria escreve, e não como escreveu quem digitou primeiro.
 */

/** Palavras que só ligam e não distinguem um rótulo de outro. */
const LIGACOES = new Set(["de", "da", "do", "das", "dos", "e", "no", "na", "em"]);

export function chaveRotulo(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((p) => p && !LIGACOES.has(p))
    .sort()
    .join(" ");
}

/**
 * Agrupa itens por rótulo normalizado, somando o valor e escolhendo a grafia
 * mais usada como nome do grupo.
 */
export function agruparPorRotulo<T>(
  itens: T[],
  rotuloDe: (item: T) => string,
  valorDe: (item: T) => number
): { rotulo: string; valor: number }[] {
  const grupos = new Map<string, { valor: number; grafias: Map<string, number> }>();

  for (const item of itens) {
    const rotulo = rotuloDe(item).trim();
    if (!rotulo) continue;
    const chave = chaveRotulo(rotulo);
    const g = grupos.get(chave) ?? { valor: 0, grafias: new Map() };
    g.valor += valorDe(item);
    // Conta ocorrências, não soma de valor: a grafia mais escrita é a que a
    // equipe reconhece, mesmo que a outra apareça numa linha de valor alto.
    g.grafias.set(rotulo, (g.grafias.get(rotulo) ?? 0) + 1);
    grupos.set(chave, g);
  }

  return [...grupos.values()].map((g) => ({
    rotulo: [...g.grafias.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
    valor: g.valor,
  }));
}
