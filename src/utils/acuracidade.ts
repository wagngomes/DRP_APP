/**
 * Medidas de acerto de previsão.
 *
 * Três números que respondem perguntas diferentes e são fáceis de confundir:
 *
 * - **Erro absoluto (APE)** diz o tamanho do erro, sem sinal. É o "errou 28%".
 * - **Viés** diz a direção. Previsão que erra 20% para cima todo mês é um
 *   problema diferente de uma que erra 20% para cima e para baixo alternando —
 *   o primeiro se corrige somando um fator, o segundo não.
 * - **WMAPE** agrega vários itens ponderando pelo volume. A média simples dos
 *   erros (MAPE clássico) trata um item de 3 unidades igual a um de 3.000, e
 *   num portfólio com cauda longa ela fica dominada por itens irrelevantes.
 *
 * Convenção do denominador: sempre o **realizado**. É o que de fato aconteceu,
 * e usar o previsto faria o erro encolher só por ter previsto alto.
 */

/** Um par previsto × realizado. */
export type ParPrevisao = { previsto: number; realizado: number };

/**
 * Erro absoluto percentual de um par.
 *
 * `null` quando o realizado é zero: não existe percentual de zero, e devolver
 * infinito ou 100% seria inventar um número. Quem chama decide como exibir.
 */
export function erroAbsoluto(par: ParPrevisao): number | null {
  if (par.realizado === 0) return null;
  return Math.abs(par.realizado - par.previsto) / Math.abs(par.realizado);
}

/**
 * Viés: positivo quando se previu mais do que se vendeu.
 *
 * `null` pelo mesmo motivo do erro absoluto.
 */
export function vies(par: ParPrevisao): number | null {
  if (par.realizado === 0) return null;
  return (par.previsto - par.realizado) / Math.abs(par.realizado);
}

/**
 * WMAPE: soma dos erros dividida pela soma do realizado.
 *
 * Ponderado por construção — um item que vende mil pesa mil vezes mais que um
 * que vende um. Também é o que salva o cálculo quando alguns realizados são
 * zero: eles entram no numerador (o erro é real) sem estourar o denominador.
 *
 * `null` só quando nada foi realizado em nenhum par.
 */
export function wmape(pares: ParPrevisao[]): number | null {
  let erro = 0;
  let total = 0;
  for (const p of pares) {
    erro += Math.abs(p.realizado - p.previsto);
    total += Math.abs(p.realizado);
  }
  if (total === 0) return null;
  return erro / total;
}

/**
 * Acuracidade como complemento do erro, nunca negativa.
 *
 * Um erro de 150% viraria "-50% de acerto", que não quer dizer nada para quem
 * lê. O piso em zero mantém a escala legível: 0% é "errou tudo".
 */
export function acuracidade(erro: number | null): number | null {
  if (erro === null) return null;
  return Math.max(0, 1 - erro);
}

/** Faixas de leitura da acuracidade, para colorir sem inventar régua na tela. */
export type FaixaAcuracidade = "boa" | "razoavel" | "ruim" | "sem";

/**
 * O corte em 80% e 60% é a régua usual de planejamento de demanda. Fica aqui,
 * em um lugar só, para a tela não espalhar números mágicos.
 */
export function faixaAcuracidade(valor: number | null): FaixaAcuracidade {
  if (valor === null) return "sem";
  if (valor >= 0.8) return "boa";
  if (valor >= 0.6) return "razoavel";
  return "ruim";
}
