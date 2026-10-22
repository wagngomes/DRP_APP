/**
 * Normalização da tributação, para agrupar e filtrar.
 *
 * A coluna `fiscal.tributacao` é texto livre vindo do ERP, e a mesma tributação
 * aparece escrita de formas diferentes. Medido na base (10.924 itens): 20
 * valores crus que viram **14** depois de normalizados.
 *
 * Dois tipos de divergência, e cada um pede um tratamento:
 *
 *   **Caixa.** "Nacional 7%" (4.932 itens) e "nacional 7%" (243); "Importado"
 *   (4.039) e "importado" (12). Resolve com `lower` + `trim`, que é o que a
 *   Visão Geral já faz.
 *
 *   **Ordem das palavras.** "7% Nacional" (3 itens) é "Nacional 7%" digitado ao
 *   contrário — a normalização por caixa não pega, e precisa de apelido
 *   explícito.
 *
 * O rótulo exibido é sempre a forma canônica, não a primeira encontrada: sem
 * isso a tela mostraria "nacional 7%" em minúscula só porque aquele item veio
 * antes na ordenação.
 */

/**
 * Grafias que são a mesma tributação escrita de outro jeito.
 *
 * Chave e valor já normalizados por `lower`+`trim`. Acrescentar um apelido é
 * uma linha — e é aqui que vão as divergências que a normalização automática
 * não alcança.
 */
const APELIDOS: Record<string, string> = {
  "7% nacional": "nacional 7%",
};

/** Forma canônica de cada chave, para o rótulo não depender da ordem dos dados. */
const ROTULOS: Record<string, string> = {
  "nacional 7%": "Nacional 7%",
  "nacional 12%": "Nacional 12%",
  importado: "Importado",
};

/** Item sem linha na guia fiscal. Não é "sem tributação": é cadastro faltando. */
export const SEM_TRIBUTACAO = "Sem fiscal";

export type Tributacao = {
  /** Chave de agrupamento e de filtro. */
  chave: string;
  /** Como aparece na tela. */
  rotulo: string;
};

/**
 * Normaliza um valor cru da guia fiscal.
 *
 * Nulo e vazio viram `SEM_TRIBUTACAO`, que é um grupo próprio e não um
 * descarte: item triangulando sem linha em fiscal é cadastro a corrigir, e
 * escondê-lo faria os totais da tela não fecharem.
 */
export function normalizarTributacao(
  raw: string | null | undefined,
): Tributacao {
  const limpo = (raw ?? "").trim();
  if (limpo === "") {
    return { chave: SEM_TRIBUTACAO.toLowerCase(), rotulo: SEM_TRIBUTACAO };
  }

  const base = limpo.toLowerCase();
  const chave = APELIDOS[base] ?? base;
  return { chave, rotulo: ROTULOS[chave] ?? rotuloPadrao(chave, limpo) };
}

/**
 * Sem forma canônica cadastrada, usa o texto original — a menos que ele seja a
 * grafia de um apelido, caso em que o original diria outra coisa.
 */
function rotuloPadrao(chave: string, original: string): string {
  return chave === original.toLowerCase() ? original : capitalizar(chave);
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
