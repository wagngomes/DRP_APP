/**
 * Uma ação por posição item × CD: o que o analista faz agora.
 *
 * Esta é a peça que transforma diagnóstico em trabalho. Os motores já diziam
 * *o que está errado* — rompido, vai romper, tantos dias descobertos. Faltava
 * dizer **o que fazer**, e dizer uma coisa só: uma posição que aparece em três
 * listas diferentes não é três tarefas, é uma decisão.
 *
 * A ordem de precedência é a da operação, não a da gravidade:
 *
 *   1. `cobrar`      já existe pedido ou transferência a caminho → cobrar a chegada
 *   2. `transferir`  outro CD pode mandar sem se romper
 *   3. `comprar`     ainda há saldo no plano do mês → pedir a colocação
 *   4. `verba`       o plano acabou → precisa de aprovação para comprar
 *
 * O que já está a caminho vem primeiro porque é o mais barato de resolver: uma
 * ligação antecipa uma carga que já existe. Transferir vem antes de comprar
 * porque o estoque já é da companhia. Verba é o último recurso, e é o único
 * item da lista que o analista não resolve sozinho — por isso precisa estar
 * visível em vez de diluído no meio dos outros.
 *
 * Determinístico de ponta a ponta. A IA não escolhe ação nem prioridade.
 */
import { faixaDe, type FaixaId } from "@/utils/dias-estoque";
import type { Sugestao } from "./transferencia";
import type { PosicaoRisco } from "./tipos";

export type TipoAcao = "cobrar" | "transferir" | "comprar" | "verba";

export const ORDEM_ACOES: TipoAcao[] = ["cobrar", "transferir", "comprar", "verba"];

export const ROTULO_ACAO: Record<TipoAcao, string> = {
  cobrar: "Cobrar chegada",
  transferir: "Transferir de outro CD",
  comprar: "Pedir colocação de compra",
  verba: "Pedir aprovação de verba",
};

/** Uma frase do que a ação significa, para o cabeçalho do grupo. */
export const EXPLICACAO_ACAO: Record<TipoAcao, string> = {
  cobrar: "Já existe carga a caminho. Antecipar a chegada resolve sem comprar nada.",
  transferir: "Outro CD tem sobra e continua coberto depois de doar.",
  comprar: "Ainda há saldo no plano do mês — basta pedir a colocação do pedido.",
  verba: "O plano do mês acabou. Sem aprovação de verba, não há como cobrir.",
};

/**
 * Faixas que a tela trata como trabalho do dia, na ordem em que aparecem.
 *
 * São as mesmas da Disponibilidade — preto, vermelho, amarelo. Usar a mesma
 * régua nas duas telas é o que permite ao analista olhar o gráfico e o checklist
 * e saber que falam da mesma coisa.
 */
export const FAIXAS_FOCO: FaixaId[] = ["zero", "critico", "baixo"];

/**
 * Por que a posição entrou no checklist.
 *
 * `faixa` é a cobertura pelo forecast — a régua da Disponibilidade.
 * `aceleracao` é a posição que o forecast diz estar confortável e a venda real
 * desmente: 45 dias de cobertura no papel, 1 dia no ritmo do mês. Sem esta
 * segunda origem, o item só apareceria depois de romper.
 */
export type OrigemAcao = "faixa" | "aceleracao";

export type Acao = {
  tipo: TipoAcao;
  origem: OrigemAcao;
  posicao: PosicaoRisco;
  faixa: FaixaId;
  /** Chave estável da tarefa: identifica a linha no checklist. */
  chave: string;
  /** Quantidade que a ação envolve, quando faz sentido. */
  quantidade: number | null;
  /** Data que a ação persegue: chegada a cobrar, chegada projetada da remessa. */
  data: Date | null;
  /** Sugestão de transferência quando ela existe, mesmo que a ação seja outra. */
  transferencia: Sugestao | null;
  /**
   * Ordenação: unidades que ficam descobertas. Põe item de giro alto à frente
   * de item parado com o mesmo número de dias.
   */
  peso: number;
};

export function chaveAcao(codigo: string, filial: string): string {
  return `${codigo}|${filial}`;
}

/**
 * Decide a ação de cada posição das faixas de foco.
 *
 * `sugestoes` vem de `calcularTransferencias` — só há sugestão para posições no
 * gatilho, então a faixa amarela normalmente cai direto em compra ou verba. É o
 * comportamento pretendido: o gatilho é o parâmetro que o usuário controla no
 * Painel para decidir a partir de quando vale mover carga entre CDs.
 */
export function decidirAcoes(
  posicoes: PosicaoRisco[],
  sugestoes: Sugestao[],
  critico: number
): Acao[] {
  const porChave = new Map<string, Sugestao>();
  for (const s of sugestoes) {
    porChave.set(chaveAcao(s.posicao.codigo, s.posicao.filial), s);
  }

  const acoes: Acao[] = [];

  for (const p of posicoes) {
    const faixa = faixaDe(p.diasChao);
    if (faixa === null) continue;

    const naFaixa = FAIXAS_FOCO.includes(faixa);
    // Aceleração: cobertura confortável pelo forecast, apertada pela venda real.
    const porRitmo =
      !naFaixa &&
      p.ritmo.status === "acelerada" &&
      p.diasNoRitmo !== null &&
      p.diasNoRitmo < critico;

    if (!naFaixa && !porRitmo) continue;

    // Sem vão a cobrir não há tarefa. Uma posição amarela cujo pedido chega
    // antes do estoque acabar está sob controle: listá-la só gastaria a atenção
    // do analista no item que já foi resolvido. É este corte que separa "1.368
    // posições em risco" de uma lista de trabalho que cabe num dia.
    if (naFaixa && p.diasDescobertos <= 0) continue;

    // No caso da aceleração, o vão é medido pelo consumo observado: usar o
    // forecast aqui daria zero, que é justamente o número errado que fez a
    // posição passar despercebida.
    const consumoRitmo = p.diasNoRitmo !== null && p.diasNoRitmo > 0
      ? p.estoqueChao / p.diasNoRitmo
      : p.consumoDiario;
    const descobertos = porRitmo
      ? Math.max(0, critico - (p.diasNoRitmo ?? 0))
      : p.diasDescobertos;

    const transferencia = porChave.get(chaveAcao(p.codigo, p.filial)) ?? null;
    const chegada = p.primeiraChegada;
    // Saldo ausente e saldo zerado são a mesma decisão para o analista: não há
    // o que colocar sem aprovação. O texto da tela distingue os dois casos.
    const saldo = p.saldoPlano?.saldo ?? 0;

    const tipo: TipoAcao = chegada
      ? "cobrar"
      : transferencia
        ? "transferir"
        : saldo > 0
          ? "comprar"
          : "verba";

    const quantidade =
      tipo === "cobrar"
        ? chegada!.quantidade
        : tipo === "transferir"
          ? transferencia!.quantidade
          : tipo === "comprar"
            ? saldo
            : // Verba: o que falta comprar para chegar ao horizonte, já que o
              // plano não cobre. É a quantidade que o analista leva na aprovação.
              Math.max(0, descobertos * consumoRitmo);

    acoes.push({
      tipo,
      origem: porRitmo ? "aceleracao" : "faixa",
      posicao: p,
      faixa,
      chave: chaveAcao(p.codigo, p.filial),
      quantidade: quantidade > 0 ? quantidade : null,
      data: tipo === "cobrar" ? chegada!.chegada : (transferencia?.chegada ?? null),
      transferencia,
      peso: descobertos * consumoRitmo,
    });
  }

  return acoes.sort((a, b) => b.peso - a.peso);
}

/** Posição cuja venda do mês está acima do ritmo esperado. */
export function acelerada(p: PosicaoRisco): boolean {
  return p.ritmo.status === "acelerada";
}
