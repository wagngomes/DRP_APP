/**
 * Monta o que fica gravado a partir da entrada e da resposta validada.
 *
 * Vive fora da Server Action porque um arquivo `"use server"` só pode exportar
 * funções assíncronas — e porque assim o caminho exercitado em teste é o mesmo
 * que roda em produção, em vez de uma reimplementação parecida.
 */
import type { EntradaAnalise } from "./analise";
import type { ContextoItem, ResultadoGravado } from "./persistencia";
import type { Analise } from "./schema";
import { ORDEM_SECOES, type Secao } from "@/lib/riscos/tipos";
import type { ItemConsolidado } from "@/lib/riscos/consolidar";

function iso(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Congela os números de um item junto do texto que os cita. */
function contextoDe(i: ItemConsolidado): ContextoItem {
  const p = i.posicao;
  const r = p.primeiraChegada;
  const t = i.evidencias.transferencia;
  return {
    codigo: p.codigo,
    filial: p.filial,
    descricao: p.descricao,
    fornecedor: p.fornecedor,
    bu: p.bu,
    analista: p.analista,
    curva: p.curva,
    secao: i.secao,
    destaque: i.destaque,
    forecast: p.forecast,
    estoqueChao: p.estoqueChao,
    diasChao: p.diasChao,
    dataRuptura: iso(p.dataRuptura),
    diasDescobertos: p.diasDescobertos,
    chegada: r
      ? {
          origem: r.origem,
          quantidade: r.quantidade,
          data: iso(r.chegada)!,
          reprojetada: r.reprojetada,
        }
      : null,
    transferencia: t
      ? { origem: t.origem, quantidade: t.quantidade, data: iso(t.chegada)!, tipo: t.tipo }
      : null,
    limiteCompra: iso(i.evidencias.compra?.dataLimite ?? null),
  };
}

export function montarResultado(
  entrada: EntradaAnalise,
  analise: Analise
): ResultadoGravado {
  // Só os itens citados entram no contexto: guardar as 150 do dossiê inflaria a
  // linha sem que a tela usasse.
  const citados = new Set(analise.itens.map((i) => `${i.codigo}|${i.filial}`));
  const contexto = entrada.dossie.enviados
    .filter((i) => citados.has(`${i.codigo}|${i.filial}`))
    .map(contextoDe);

  // Avisos não vêm do consolidado: aceleração de venda é item × cliente e lacuna
  // de cadastro não tem posição nenhuma.
  const lacunas = [
    {
      rotulo: "Posições sem lead time do fornecedor",
      quantidade: entrada.lacunas.sem_lead_time,
      efeito: "sem data limite de compra — ficam fora das ações urgentes",
    },
    {
      rotulo: "Posições sem SLA em alguma perna da rota",
      quantidade: entrada.lacunas.sem_sla_na_rota,
      efeito: "percurso sem prazo total, chegada não projetável",
    },
    {
      rotulo: "Posições sem rota de compra cadastrada",
      quantidade: entrada.lacunas.sem_rota,
      efeito: "não é possível saber onde o fornecedor entrega",
    },
  ].filter((l) => l.quantidade > 0);

  const avisos = {
    vendas: {
      mesAnalisado: entrada.vendas.mesAnalisado,
      baseline: entrada.vendas.baseline,
      anomalias: entrada.vendas.anomalias.slice(0, 20).map((a) => ({
        codigo: a.codigo,
        cliente: a.cliente,
        grupo: a.grupo,
        mediana: a.mediana,
        mesAtual: a.mesAtual,
        fator: a.fator,
        excedente: a.excedente,
      })),
    },
    lacunas,
  };

  const totais = Object.fromEntries(
    ORDEM_SECOES.map((s) => [
      s,
      s === "aviso"
        ? avisos.vendas.anomalias.length + lacunas.length
        : entrada.consolidado.filter((i) => i.secao === s).length,
    ])
  ) as Record<Secao, number>;

  // A lista completa: sem ela a tela mostra 22 itens e esconde 2.100.
  const todos = entrada.consolidado.map((i) => ({
    codigo: i.codigo,
    descricao: i.posicao.descricao,
    filial: i.filial,
    fornecedor: i.fornecedor,
    bu: i.posicao.bu,
    analista: i.posicao.analista,
    curva: i.posicao.curva,
    secao: i.secao,
    destaque: i.destaque,
    diasChao: i.posicao.diasChao,
    diasDescobertos: i.posicao.diasDescobertos,
    peso: i.peso,
    comAnalise: citados.has(`${i.codigo}|${i.filial}`),
  }));

  return {
    analise,
    contexto,
    todos,
    totais,
    totalPosicoes: entrada.risco.posicoes.length,
    analisadas: {
      enviadas: entrada.dossie.enviados.length,
      disponiveis: entrada.dossie.totalDisponivel,
    },
    avisos,
  };
}
