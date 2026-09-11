/**
 * Leitura e gravação da análise gerada.
 *
 * O que fica gravado é o **retrato completo**: o texto do modelo e os números
 * que o sustentavam. Recalcular os números na hora de exibir produziria uma tela
 * incoerente — justificativa citando "11 dias descobertos" ao lado de um número
 * que já mudou.
 *
 * Por isso a página lê só isto, numa consulta, em vez de rodar os motores a cada
 * carregamento (que leva ~10s).
 */
import { prisma } from "@/lib/prisma";
import type { Analise } from "./schema";
import type { Secao } from "@/lib/riscos/tipos";

/** Números de um item, congelados no momento da geração. */
export type ContextoItem = {
  codigo: string;
  filial: string;
  descricao: string | null;
  fornecedor: string;
  bu: string;
  curva: string;
  /** Analista responsável, vindo do forecast. */
  analista: string;
  secao: Secao;
  destaque: string;
  forecast: number;
  estoqueChao: number;
  diasChao: number | null;
  dataRuptura: string | null;
  diasDescobertos: number;
  /** O que está a caminho, se houver. */
  chegada: { origem: string; quantidade: number; data: string; reprojetada: boolean } | null;
  /** Sugestão de transferência, se houver. */
  transferencia: { origem: string; quantidade: number; data: string; tipo: string } | null;
  limiteCompra: string | null;
};

/**
 * Conteúdo da seção Avisos.
 *
 * Não é item × CD como o resto: uma aceleração de venda é item × cliente, e uma
 * lacuna de cadastro não tem posição nenhuma. Por isso vive fora da lista de
 * itens — foi justamente o que fez os avisos aparecerem zerados na primeira
 * versão da tela.
 */
export type Avisos = {
  vendas: {
    mesAnalisado: string;
    baseline: string[];
    anomalias: {
      codigo: string;
      cliente: string;
      grupo: string | null;
      mediana: number;
      mesAtual: number;
      fator: number;
      excedente: number;
    }[];
  };
  /** Cadastros faltando que impedem o cálculo de parte das posições. */
  lacunas: { rotulo: string; quantidade: number; efeito: string }[];
};

/**
 * Linha da lista completa — todas as posições em risco, não só as que a IA
 * comentou.
 *
 * Compacta de propósito: são milhares, e o que a tabela precisa são os números
 * que ordenam e localizam. O texto da IA existe só para as selecionadas; o resto
 * se lê pelos números.
 */
export type ItemResumo = {
  codigo: string;
  descricao: string | null;
  filial: string;
  fornecedor: string;
  bu: string;
  curva: string;
  /** Analista responsável, vindo do forecast. */
  analista: string;
  secao: Secao;
  destaque: string;
  diasChao: number | null;
  diasDescobertos: number;
  /** Unidades expostas — a ordenação da fila. */
  peso: number;
  /** True quando a IA escreveu sobre esta posição. */
  comAnalise: boolean;
};

export type ResultadoGravado = {
  analise: Analise;
  contexto: ContextoItem[];
  /** Todas as posições em risco, para navegar além do que a IA comentou. */
  todos: ItemResumo[];
  totais: Record<Secao, number>;
  totalPosicoes: number;
  /** Quantas posições existiam contra quantas foram enviadas ao modelo. */
  analisadas: { enviadas: number; disponiveis: number };
  avisos: Avisos;
};

export type AnaliseGravada = {
  id: number;
  criadoEm: Date;
  modelo: string;
  entradaHash: string;
  tokensEntrada: number;
  tokensSaida: number;
  resultado: ResultadoGravado;
};

/** A análise mais recente daquela data de referência. */
export async function lerAnalise(data: string): Promise<AnaliseGravada | null> {
  const linha = await prisma.analiseIa.findFirst({
    where: { data_snapshot: new Date(`${data}T00:00:00.000Z`) },
    orderBy: { createdAt: "desc" },
  });
  if (!linha) return null;

  return {
    id: linha.id,
    criadoEm: linha.createdAt,
    modelo: linha.modelo,
    entradaHash: linha.entrada_hash,
    tokensEntrada: linha.tokens_entrada,
    tokensSaida: linha.tokens_saida,
    resultado: linha.resultado as unknown as ResultadoGravado,
  };
}

export async function gravarAnalise(entrada: {
  data: string;
  modelo: string;
  parametros: unknown;
  resultado: ResultadoGravado;
  entradaHash: string;
  tokensEntrada: number;
  tokensSaida: number;
}): Promise<void> {
  await prisma.analiseIa.create({
    data: {
      data_snapshot: new Date(`${entrada.data}T00:00:00.000Z`),
      modelo: entrada.modelo,
      parametros: entrada.parametros as never,
      resultado: entrada.resultado as never,
      entrada_hash: entrada.entradaHash,
      tokens_entrada: entrada.tokensEntrada,
      tokens_saida: entrada.tokensSaida,
    },
  });
}
