/**
 * Tipos compartilhados pelos motores de risco.
 *
 * Todo motor devolve `ItemDeRisco[]`, com a seção de criticidade já atribuída por
 * regra determinística. Acrescentar uma análise nova no futuro é criar um arquivo
 * em `src/lib/riscos/` que devolva este mesmo tipo — o dossiê e a tela não mudam.
 */
import type { Reposicao } from "@/lib/reposicoes/chegadas";
import type { SaldoPlano } from "@/lib/compras/saldo-plano";
import type { Ritmo } from "@/utils/ritmo-venda";

/**
 * Seções da tela, do mais urgente para o mais informativo.
 *
 * Atribuídas sempre pelo motor, nunca pela IA: mesma base, mesma classificação.
 */
export type Secao = "urgente" | "recomendada" | "alerta" | "aviso";

export const ORDEM_SECOES: Secao[] = ["urgente", "recomendada", "alerta", "aviso"];

export const ROTULO_SECAO: Record<Secao, string> = {
  urgente: "Ações urgentes",
  recomendada: "Ações recomendadas",
  alerta: "Alertas",
  aviso: "Avisos",
};

/** Situação de cobertura de uma posição item × CD. */
export type Severidade =
  /** Estoque chão zerado hoje. */
  | "rompido"
  /** Rompe dentro do crítico e a reposição não cobre a tempo. */
  | "vai_romper"
  /** Rompe dentro do crítico, mas a reposição chega antes. */
  | "no_limite"
  /** Cobertura além do crítico. */
  | "ok";

export const ROTULO_SEVERIDADE: Record<Severidade, string> = {
  rompido: "Rompido",
  vai_romper: "Vai romper",
  no_limite: "No limite",
  ok: "Coberto",
};

/** Uma posição item × CD avaliada pelo motor. */
export type PosicaoRisco = {
  codigo: string;
  descricao: string | null;
  filial: string;
  fornecedor: string;
  bu: string;
  curva: string;
  /** Analista responsável pelo item, vindo do forecast. */
  analista: string;
  forecast: number;
  estoqueChao: number;
  estoqueTotal: number;
  /** Consumo diário derivado do forecast do mês. */
  consumoDiario: number;
  /** Cobertura do estoque chão, em dias. `null` quando não há consumo. */
  diasChao: number | null;
  /** Cobertura considerando o que já está a caminho. */
  diasTotal: number | null;
  /** Data em que o estoque chão acaba. `null` quando não há consumo. */
  dataRuptura: Date | null;
  /** Primeira reposição a chegar neste CD, se houver. */
  primeiraChegada: Reposicao | null;
  /** Dias entre a referência e a primeira chegada. `null` se nada vem. */
  diasAteChegada: number | null;
  /**
   * Dias sem cobertura: o vão entre o estoque acabar e a reposição chegar.
   * Sem reposição, o que falta para completar o horizonte crítico.
   */
  diasDescobertos: number;
  severidade: Severidade;
  /** Todas as reposições a caminho, da que chega antes para a que chega depois. */
  reposicoes: Reposicao[];
  /** Vendido no mês corrente neste CD. */
  vendidoMes: number;
  /** Ritmo de venda do mês contra o forecast proporcional aos dias decorridos. */
  ritmo: Ritmo;
  /**
   * Cobertura do estoque chão pelo consumo **observado** no mês, em vez do
   * previsto. `null` quando não houve venda no mês. É o que revela a ruptura
   * que o forecast não vê.
   */
  diasNoRitmo: number | null;
  /**
   * Saldo do plano de compra do mês, do produto inteiro (não do CD). `null`
   * quando o produto não está no plano — que é diferente de saldo zerado.
   */
  saldoPlano: SaldoPlano | null;
};

/** Item pronto para a tela e para o dossiê da IA. */
export type ItemDeRisco = {
  /** Qual motor produziu — permite filtrar e explicar a origem. */
  tipo: "risco" | "comprar" | "followup" | "transferencia" | "venda";
  secao: Secao;
  codigo: string;
  filial: string;
  fornecedor: string;
  /** Número que sustenta a prioridade, já formatado pelo motor. */
  destaque: string;
  /** Ordenação dentro da seção, do mais grave para o menos. */
  peso: number;
  posicao: PosicaoRisco;
};
