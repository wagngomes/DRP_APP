/**
 * Formatação e paleta compartilhadas pela tela de raio-X.
 *
 * Num módulo próprio porque os mesmos números aparecem em quatro componentes
 * diferentes, e cada um com a sua cópia de `toLocaleString` acabaria com
 * arredondamentos que divergem entre cartão e tabela.
 */

/** Quantidade inteira, no formato do país. */
export function num(v: number): string {
  return Math.round(v).toLocaleString("pt-BR");
}

/** Percentual; `null` vira travessão, nunca zero. */
export function pct(v: number | null, casas = 1): string {
  return v === null ? "—" : `${(v * 100).toFixed(casas)}%`;
}

const NOMES_MES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** "2026-08-01" -> "agosto de 2026". */
export function mesBr(iso: string): string {
  const [ano, mes] = iso.split("-");
  return `${NOMES_MES[Number(mes) - 1]} de ${ano}`;
}

/**
 * Verde, âmbar ou vermelho pela régua de acuracidade.
 *
 * Nunca por número solto na tela: a régua vive em `utils/acuracidade`, e estas
 * são só as cores que a traduzem.
 */
export const TOM_FAIXA = {
  boa: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  razoavel: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  ruim: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
  sem: "bg-muted text-muted-foreground",
} as const;

/**
 * Cores das divisões do consenso.
 *
 * Só "Contratos" e "Spot" ganham cor própria: são as duas que a venda consegue
 * reconhecer, e portanto as únicas que a tela consegue medir. As demais ficam
 * em cinza, o que já diz que delas não há realizado.
 */
const COR_DIVISAO: Record<string, { barra: string; texto: string }> = {
  contratos: {
    barra: "bg-teal-500",
    texto: "text-teal-700 dark:text-teal-300",
  },
  spot: { barra: "bg-amber-500", texto: "text-amber-700 dark:text-amber-400" },
};

const NEUTRO = { barra: "bg-slate-400", texto: "text-muted-foreground" };

export function corDivisao(nome: string) {
  return COR_DIVISAO[nome.toLowerCase()] ?? NEUTRO;
}
