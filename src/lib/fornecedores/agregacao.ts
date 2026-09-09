/**
 * Tipos e agregação da análise de rupturas por fornecedor.
 *
 * Vive separado de `consultas.ts` de propósito: aquele módulo importa o Prisma
 * e só roda no servidor. Como o filtro de BU recalcula o resumo no cliente,
 * a agregação precisa de um módulo que o navegador possa carregar.
 */
import type { Etapa } from "@/utils/projecao-transferencias";

/**
 * Situação de uma posição rompida (item × CD).
 *
 * Cada posição cai em exatamente uma categoria: quando há compra e
 * transferência a caminho, vale a que chega primeiro — o objetivo é saber
 * quando a ruptura acaba, não quantas reposições existem.
 */
export type Categoria = "compra" | "transferencia" | "a_comprar" | "sem_cobertura";

/**
 * Uma reposição a caminho de um CD, com o percurso completo já projetado — o
 * mesmo desenho da tela de produto, para o percurso ser lido igual nos dois
 * lugares.
 */
export type Reposicao = {
  origem: "compra" | "transferencia";
  quantidade: number;
  chegada: Date;
  etapas: Etapa[];
  /** Rota textual da origem ("DF2 > CAJ > ES"); null em compra direta/simples. */
  rota: string | null;
  /** True em compra direta: entra na própria filial, sem trecho de SLA. */
  direto: boolean;
  /** True quando a data original venceu e o prazo do Painel foi aplicado. */
  reprojetada: boolean;
  /** Rótulo da primeira parada: data pedra nos pedidos, "saída" nas transferências. */
  inicio: string;
  /** Identificação: número do pedido ou da NF. */
  documento: string | null;
  emissao: Date | null;
  /** Só nos pedidos de compra. */
  statusLogistica: string | null;
  dataAgendada: string | null;
  frete: string | null;
};

/** Rótulo usado quando a classificação não está preenchida no forecast. */
export const VAZIO = "—";

export type PosicaoRompida = {
  codigo: string;
  descricao: string | null;
  filial: string;
  fornecedor: string;
  /** Unidade de negócio do forecast (coluna b_u); `VAZIO` quando ausente. */
  bu: string;
  /** Classificação ABC do forecast (coluna curva); `VAZIO` quando ausente. */
  curva: string;
  forecast: number;
  categoria: Categoria;
  /** Quantidade e chegada da reposição que define a categoria. */
  quantidade: number | null;
  chegada: Date | null;
  /** Todas as reposições a caminho deste CD, da que chega antes para a depois. */
  reposicoes: Reposicao[];
  /** Saldo do plano de compra do mês ainda não colocado. */
  saldoComprar: number;
};

export type ResumoFornecedor = {
  fornecedor: string;
  total: number;
  compra: number;
  transferencia: number;
  aComprar: number;
  semCobertura: number;
};

/** Conta as posições por fornecedor e categoria, do maior total para o menor. */
export function agregarPorFornecedor(posicoes: PosicaoRompida[]): ResumoFornecedor[] {
  const mapa = new Map<string, ResumoFornecedor>();
  for (const p of posicoes) {
    const atual = mapa.get(p.fornecedor) ?? {
      fornecedor: p.fornecedor,
      total: 0,
      compra: 0,
      transferencia: 0,
      aComprar: 0,
      semCobertura: 0,
    };
    atual.total += 1;
    if (p.categoria === "compra") atual.compra += 1;
    else if (p.categoria === "transferencia") atual.transferencia += 1;
    else if (p.categoria === "a_comprar") atual.aComprar += 1;
    else atual.semCobertura += 1;
    mapa.set(p.fornecedor, atual);
  }
  return [...mapa.values()].sort(
    (a, b) => b.total - a.total || a.fornecedor.localeCompare(b.fornecedor, "pt-BR")
  );
}

/** BUs presentes nas posições, em ordem alfabética e com "sem BU" no fim. */
export function listarBus(posicoes: PosicaoRompida[]): string[] {
  return [...new Set(posicoes.map((p) => p.bu))].sort((a, b) =>
    a === VAZIO ? 1 : b === VAZIO ? -1 : a.localeCompare(b, "pt-BR")
  );
}

/**
 * Curvas presentes, em ordem ABC. Uma curva fora de A/B/C vai depois delas, e
 * a ausência de curva fica sempre por último — a mesma ordem da Disponibilidade.
 */
export function listarCurvas(posicoes: PosicaoRompida[]): string[] {
  const presentes = [...new Set(posicoes.map((p) => p.curva))];
  const abc = ["A", "B", "C"];
  return [
    ...abc.filter((c) => presentes.includes(c)),
    ...presentes
      .filter((c) => !abc.includes(c) && c !== VAZIO)
      .sort((a, b) => a.localeCompare(b, "pt-BR")),
    ...presentes.filter((c) => c === VAZIO),
  ];
}
