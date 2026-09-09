/**
 * Paleta categórica usada no perfil fiscal. É a paleta de referência do guia de
 * visualização, validada nos dois modos: separação CVD adjacente ΔE 9,1 (claro)
 * e 8,4 (escuro), piso de visão normal 19,6 / 19,3, ambos acima do mínimo.
 *
 * A ORDEM é o mecanismo de segurança para daltonismo, não escolha estética —
 * não reordenar nem inserir cores no meio. Acima de 6 fatias a cauda vira
 * "Outras tributações" em vez de ganhar uma cor nova.
 *
 * Três tons no modo claro ficam abaixo de 3:1 contra a superfície, então a
 * regra de alívio se aplica: o gráfico sempre acompanha legenda e tabela com
 * os valores, nunca depende só da cor.
 */
export const CATEGORICA_CLARO = [
  "#2a78d6", // azul
  "#eb6834", // laranja
  "#1baf7a", // água
  "#eda100", // amarelo
  "#e87ba4", // magenta
  "#008300", // verde
] as const;

export const CATEGORICA_ESCURO = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
] as const;

/** Cinza de "resto", fora da sequência categórica. */
export const COR_OUTRAS_CLARO = "#8b8b86";
export const COR_OUTRAS_ESCURO = "#6f6f6a";

/** Quantas tributações ganham cor própria antes de virar "Outras". */
export const MAX_FATIAS = 6;
