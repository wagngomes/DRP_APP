import type { Etapa } from "@/lib/diagnostico-ruptura/catalogo";

/**
 * Um tom por etapa da cadeia de abastecimento.
 *
 * **A cor é por etapa, não por causa.** Duas causas da mesma etapa dividem o
 * tom, e isso é intencional: a pergunta que a tela responde primeiro é "onde a
 * corrente quebrou", e só depois "qual regra exatamente".
 *
 * Vivia em `barra-causas.tsx`, junto da barra empilhada que desenhava a
 * divisão de dias do motor contrafactual. A barra saiu com ele — a árvore
 * devolve uma causa por posição, e uma barra de um só segmento não informa
 * nada. O tom ficou, porque o código de cores é o mesmo.
 */

/** Um tom por etapa da cadeia, na paleta do sistema. */
const TOM: Record<Etapa, { barra: string; texto: string }> = {
  dados: { barra: "bg-slate-400", texto: "text-slate-600 dark:text-slate-300" },
  partida: {
    barra: "bg-(--brand-petrol)",
    texto: "text-(--brand-petrol) dark:text-(--brand-turquoise)",
  },
  demanda: { barra: "bg-amber-500", texto: "text-amber-700 dark:text-amber-400" },
  plano: { barra: "bg-violet-500", texto: "text-violet-700 dark:text-violet-400" },
  compra: { barra: "bg-rose-500", texto: "text-rose-700 dark:text-rose-400" },
  fornecedor: { barra: "bg-orange-500", texto: "text-orange-700 dark:text-orange-400" },
  recebimento: { barra: "bg-teal-500", texto: "text-teal-700 dark:text-teal-400" },
  movimentacao: { barra: "bg-sky-500", texto: "text-sky-700 dark:text-sky-400" },
};

export function tomDaEtapa(etapa: Etapa) {
  return TOM[etapa] ?? TOM.dados;
}
