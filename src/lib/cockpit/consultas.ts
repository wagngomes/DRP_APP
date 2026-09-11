/**
 * O checklist do dia: uma linha por decisão que o analista precisa tomar.
 *
 * Roda os mesmos motores determinísticos das outras telas e os reduz a uma
 * lista de tarefas ordenada por gravidade. Nenhum número nasce aqui — este
 * módulo escolhe o que mostrar e em que ordem, não o que é verdade.
 *
 * Independe da IA de propósito. A análise gerada acrescenta briefing e texto
 * por item quando existe, mas a fila de trabalho está pronta sem ela: um dia em
 * que a API falhe não pode ser um dia em que a operação fica sem direção.
 */
import { prisma } from "@/lib/prisma";
import { calcularRiscos } from "@/lib/riscos/motor";
import { calcularTransferencias } from "@/lib/riscos/transferencia";
import { decidirAcoes, type Acao, type OrigemAcao, type TipoAcao } from "@/lib/riscos/acao";
import { carregarSla } from "@/lib/transferencias/consultas";
import type { Coberturas } from "@/lib/parametros";
import type { ParametrosProjecao } from "@/lib/reposicoes/chegadas";
import type { FaixaId } from "@/utils/dias-estoque";

/**
 * Uma linha do checklist, já serializável.
 *
 * Datas viram texto e nada de `Date` ou classe atravessa para o componente
 * cliente — a fronteira servidor→cliente serializa, e objeto rico quebra nela.
 */
export type LinhaCockpit = {
  chave: string;
  codigo: string;
  descricao: string | null;
  filial: string;
  fornecedor: string;
  bu: string;
  curva: string;
  analista: string;
  faixa: FaixaId;
  origem: OrigemAcao;
  acao: TipoAcao;
  /** Cobertura pelo forecast, em dias. */
  diasChao: number | null;
  /** Cobertura pelo consumo observado no mês. */
  diasNoRitmo: number | null;
  /** Índice do ritmo: 1 = exatamente no previsto, 2 = vendendo o dobro. */
  indiceRitmo: number | null;
  acelerada: boolean;
  forecast: number;
  estoqueChao: number;
  vendidoMes: number;
  diasDescobertos: number;
  /** Unidades que ficam descobertas — é o que ordena a fila. */
  impacto: number;
  dataRuptura: string | null;
  /** Quantidade envolvida na ação. */
  quantidade: number | null;
  /** Data que a ação persegue. */
  data: string | null;
  /** Carga a caminho, quando a ação é cobrar. */
  chegada: {
    origem: "compra" | "transferencia";
    documento: string | null;
    quantidade: number;
    data: string;
    reprojetada: boolean;
    rota: string | null;
    statusLogistica: string | null;
    dataAgendada: string | null;
  } | null;
  /** Transferência possível, mesmo quando a ação principal é outra. */
  transferencia: {
    origem: string;
    quantidade: number;
    data: string;
    sla: number;
    tipo: "ponte" | "reposicao";
  } | null;
  /** Saldo do plano de compra do mês, do produto. */
  plano: { plano: number; aberto: number; recebido: number; saldo: number } | null;
  /** Marcação do checklist, quando alguém já tratou. */
  feito: { por: string; em: string } | null;
};

export type DadosCockpit = {
  linhas: LinhaCockpit[];
  /** Posições avaliadas no total — o denominador honesto do recorte. */
  totalPosicoes: number;
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

function serializar(a: Acao, feitos: Map<string, { por: string; em: Date }>): LinhaCockpit {
  const p = a.posicao;
  const c = a.tipo === "cobrar" ? p.primeiraChegada : null;
  const f = feitos.get(a.chave);

  return {
    chave: a.chave,
    codigo: p.codigo,
    descricao: p.descricao,
    filial: p.filial,
    fornecedor: p.fornecedor,
    bu: p.bu,
    curva: p.curva,
    analista: p.analista,
    faixa: a.faixa,
    origem: a.origem,
    acao: a.tipo,
    diasChao: p.diasChao,
    diasNoRitmo: p.diasNoRitmo,
    indiceRitmo: p.ritmo.indice,
    acelerada: p.ritmo.status === "acelerada",
    forecast: p.forecast,
    estoqueChao: p.estoqueChao,
    vendidoMes: p.vendidoMes,
    diasDescobertos: p.diasDescobertos,
    impacto: a.peso,
    dataRuptura: iso(p.dataRuptura),
    quantidade: a.quantidade,
    data: iso(a.data),
    chegada: c
      ? {
          origem: c.origem,
          documento: c.documento,
          quantidade: c.quantidade,
          data: iso(c.chegada)!,
          reprojetada: c.reprojetada,
          rota: c.rota,
          statusLogistica: c.statusLogistica,
          dataAgendada: c.dataAgendada,
        }
      : null,
    transferencia: a.transferencia
      ? {
          origem: a.transferencia.origem,
          quantidade: a.transferencia.quantidade,
          data: iso(a.transferencia.chegada)!,
          sla: a.transferencia.sla,
          tipo: a.transferencia.tipo,
        }
      : null,
    plano: p.saldoPlano,
    feito: f ? { por: f.por, em: f.em.toISOString() } : null,
  };
}

export async function carregarCockpit(
  data: string,
  parametros: ParametrosProjecao,
  coberturas: Coberturas
): Promise<DadosCockpit> {
  const risco = await calcularRiscos(data, parametros, coberturas);

  const [sla, marcadas] = await Promise.all([
    carregarSla(),
    prisma.tarefaCockpit.findMany({
      where: { data_snapshot: new Date(`${data}T00:00:00.000Z`) },
      select: { codigo: true, filial: true, concluida_por: true, concluida_em: true },
    }),
  ]);

  const transferencia = calcularTransferencias(
    risco.posicoes,
    coberturas,
    sla,
    new Date(`${data}T00:00:00.000Z`)
  );

  const acoes = decidirAcoes(risco.posicoes, transferencia.sugestoes, coberturas.critico);

  const feitos = new Map(
    marcadas.map((m) => [
      `${m.codigo}|${m.filial}`,
      { por: m.concluida_por, em: m.concluida_em },
    ])
  );

  return {
    linhas: acoes.map((a) => serializar(a, feitos)),
    totalPosicoes: risco.posicoes.length,
  };
}
