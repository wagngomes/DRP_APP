/**
 * O recorte da tela de triangulações: quais produtos ficam e o que cada
 * seletor oferece.
 *
 * Função pura, separada da consulta de propósito. É a parte que decide o que a
 * pessoa vê, e a única forma de conferi-la dentro da consulta seria com banco
 * de pé — o que, no dia em que foi escrita, não havia.
 *
 * **Os recortes são cumulativos.** Laboratório, tributação e busca por produto
 * são travas independentes que se somam: dá para escolher um laboratório e,
 * dentro dele, uma tributação, ou o contrário, e a ordem não muda o resultado.
 *
 * **Cada lista de opções é apurada sem o próprio filtro.** Escolher um
 * laboratório encurta as tributações para as que existem dentro dele; escolher
 * uma tributação encurta os laboratórios. O que nenhuma lista faz é aplicar a
 * si mesma — isso a esvaziaria no instante em que fosse usada. É o mesmo
 * princípio dos chips do diagnóstico: o que a lista oferece tem de antecipar o
 * resultado do clique.
 */
import type { Tributacao } from "@/utils/tributacao";

/** O mínimo que o recorte precisa saber de um produto. */
export type ProdutoRecortavel = {
  codigo: string;
  descricao: string | null;
  fornecedor: string;
  tributacao: Tributacao;
};

export type Filtros = {
  fornecedor?: string;
  /** Chave normalizada, não o rótulo. */
  tributacao?: string;
  /** Código ou trecho da descrição. */
  produto?: string;
};

export type Recorte<T> = {
  visiveis: T[];
  /** Laboratórios disponíveis, já considerando tributação e busca. */
  fornecedores: string[];
  /** Tributações disponíveis, já considerando laboratório e busca. */
  tributacoes: Tributacao[];
};

export function recortar<T extends ProdutoRecortavel>(
  produtos: T[],
  filtros: Filtros,
): Recorte<T> {
  const termo = filtros.produto?.trim().toLowerCase();

  const casaFornecedor = (p: T) =>
    !filtros.fornecedor || p.fornecedor === filtros.fornecedor;
  const casaTributacao = (p: T) =>
    !filtros.tributacao || p.tributacao.chave === filtros.tributacao;
  const casaTermo = (p: T) =>
    !termo ||
    p.codigo.toLowerCase().includes(termo) ||
    (p.descricao ?? "").toLowerCase().includes(termo);

  const fornecedores = [
    ...new Set(
      produtos.filter((p) => casaTributacao(p) && casaTermo(p)).map((p) => p.fornecedor),
    ),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));

  // Indexada pela chave, e não pelo rótulo: "Nacional 7%" e "nacional 7%" são
  // a mesma tributação, e listá-las duas vezes dividiria o volume de uma delas
  // entre duas opções que fazem a mesma coisa.
  const porChave = new Map<string, Tributacao>();
  for (const p of produtos.filter((x) => casaFornecedor(x) && casaTermo(x))) {
    porChave.set(p.tributacao.chave, p.tributacao);
  }
  const tributacoes = [...porChave.values()].sort((a, b) =>
    a.rotulo.localeCompare(b.rotulo, "pt-BR"),
  );

  return {
    visiveis: produtos.filter(
      (p) => casaFornecedor(p) && casaTributacao(p) && casaTermo(p),
    ),
    fornecedores,
    tributacoes,
  };
}
