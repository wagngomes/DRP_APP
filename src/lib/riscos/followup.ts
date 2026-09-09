/**
 * Prioridade de follow-up: o que cobrar primeiro.
 *
 * Entre centenas de pedidos e transferências em aberto, a pergunta não é qual
 * está mais atrasado — é qual, se atrasar mais, deixa um CD descoberto por mais
 * tempo. Um pedido atrasado que chega num CD com 40 dias de estoque não é
 * urgente; um no prazo que chega num CD já rompido é.
 *
 * Por isso a ordenação nasce do risco no destino (`diasDescobertos`), calculado
 * pelo motor, e não de nenhum atributo da própria reposição.
 *
 * Determinístico. A IA ordena dentro da seção e escreve o texto; a seção e o
 * peso saem daqui.
 */
import type { Reposicao } from "@/lib/reposicoes/chegadas";
import type { PosicaoRisco, Secao } from "./tipos";

export type ItemFollowup = {
  posicao: PosicaoRisco;
  /** A reposição que encerra a ruptura — a primeira a chegar. */
  reposicao: Reposicao;
  /**
   * Dias que o CD passa descoberto até esta chegada. É o que ordena a fila.
   */
  diasDescobertos: number;
  /** Unidades que ficam sem cobertura no período — desempata itens de giro alto. */
  impacto: number;
  /** True quando a data original já venceu e foi reprojetada pelo prazo do Painel. */
  atrasada: boolean;
  secao: Secao;
};

export type DadosFollowup = {
  itens: ItemFollowup[];
  totais: { urgente: number; recomendada: number; alerta: number };
};

/**
 * Fila de cobrança, da maior exposição para a menor.
 *
 * Só entram posições que dependem de uma reposição para sair do risco: sem nada
 * a caminho não há o que cobrar — esse caso é de compra, não de follow-up.
 */
export function calcularFollowup(posicoes: PosicaoRisco[]): DadosFollowup {
  const itens: ItemFollowup[] = [];

  for (const posicao of posicoes) {
    const reposicao = posicao.primeiraChegada;
    if (!reposicao) continue;
    if (posicao.severidade === "ok") continue;

    // Rompido hoje com a chegada já remarcada: o prazo original furou e o CD
    // está parado. É o caso que justifica uma ligação agora.
    const atrasada = reposicao.reprojetada;
    const secao: Secao =
      posicao.severidade === "rompido" && atrasada
        ? "urgente"
        : posicao.severidade === "rompido" || posicao.severidade === "vai_romper"
          ? "recomendada"
          : "alerta";

    itens.push({
      posicao,
      reposicao,
      diasDescobertos: posicao.diasDescobertos,
      impacto: posicao.diasDescobertos * posicao.consumoDiario,
      atrasada,
      secao,
    });
  }

  itens.sort((a, b) => b.impacto - a.impacto || b.diasDescobertos - a.diasDescobertos);

  const totais = { urgente: 0, recomendada: 0, alerta: 0 };
  for (const i of itens) {
    if (i.secao === "urgente") totais.urgente += 1;
    else if (i.secao === "recomendada") totais.recomendada += 1;
    else if (i.secao === "alerta") totais.alerta += 1;
  }

  return { itens, totais };
}
