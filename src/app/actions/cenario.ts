"use server";

import { headers } from "next/headers";

import { revalidatePath } from "next/cache";

import { exigirAdminOuErro, lerSessao } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import { lerDataReferencia } from "@/lib/data-referencia.server";
import { lerParametros } from "@/lib/parametros.server";
import { simular, type PosicaoSimulada, type ResultadoSimulacao } from "@/lib/simulacao/motor";
import {
  analisarCenario,
  interpretarPergunta,
  paraAcoesDoMotor,
  type AcaoComTexto,
} from "@/lib/simulacao/ia";

/**
 * Roda um cenário hipotético de ponta a ponta.
 *
 * A sequência é deliberada: a IA traduz a pergunta, o motor simula, a IA lê o
 * resultado e propõe contingências, e o motor simula **de novo** com elas. A
 * terceira seção da tela é, por isso, um número recalculado e não uma promessa.
 *
 * Tudo o que sai daqui é serializável: datas viram texto, porque o resultado
 * atravessa a fronteira para um componente cliente.
 */

/** Posição já formatada para a tela. */
export type PosicaoTela = {
  codigo: string;
  descricao: string | null;
  filial: string;
  estoqueInicial: number;
  consumoDiario: number;
  dataRuptura: string | null;
  diasDescobertos: number;
  faltaUnidades: number;
  entradaFutura: number;
  chegadaFutura: string | null;
  percurso: { cd: string; chegada: string | null; transitTime: number | null }[];
  /** Pedidos e transferências já colocados, com data prevista de chegada. */
  entradasAbertas: {
    origem: "compra" | "transferencia";
    quantidade: number;
    chegada: string;
    documento: string | null;
    rota: string | null;
  }[];
  /**
   * Em que grupo a posição entra na tabela:
   * - `hoje`: já está zerada na data de referência
   * - `ate_entrada`: rompe entre hoje e a data da premissa
   * - `depois`: rompe depois disso, ou não rompe
   */
  grupo: "hoje" | "ate_entrada" | "depois";
  aviso?: string;
};

export type ResumoCenario = {
  rompem: number;
  jaZeradas: number;
  diasDescobertos: number;
  unidadesFaltando: number;
  posicoesAvaliadas: number;
  semProjecao: number;
};

export type ResultadoTela = {
  ok: true;
  /** Id no banco. Ausente só enquanto a gravação não aconteceu. */
  id?: string;
  fornecedor: string;
  pergunta: string;
  interpretacao: string;
  dataEntrada: string;
  dataBase: string;
  saldoTotal: number;
  itensComSaldo: number;
  /** Cenário sem intervenção. */
  antes: ResumoCenario;
  criticas: PosicaoTela[];
  resumoIa: string;
  destaques: { codigo: string; filial: string; titulo: string; porque: string }[];
  acoes: AcaoComTexto[];
  /** Cenário recalculado com as ações aplicadas. */
  depois: ResumoCenario | null;
  /** Ações propostas que o motor não conseguiu aplicar, e por quê. */
  ignoradas: { descricao: string; motivo: string }[];
  /** Correção aplicada à premissa, quando houve. */
  avisoPremissa?: string;
};

export type EstadoCenario = ResultadoTela | { ok: false; erro: string } | null;

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

function resumir(r: ResultadoSimulacao): ResumoCenario {
  const criticas = r.posicoes.filter((p) => p.rompeAntesDaEntrada);
  return {
    rompem: r.totalRompem,
    jaZeradas: r.jaZeradas,
    diasDescobertos: criticas.reduce((a, p) => a + p.diasDescobertosAteEntrada, 0),
    unidadesFaltando: criticas.reduce((a, p) => a + p.faltaUnidades, 0),
    posicoesAvaliadas: r.posicoes.length,
    semProjecao: r.semProjecao,
  };
}

function paraTela(p: PosicaoSimulada, dataEntrada: string): PosicaoTela {
  const rompeAte = p.dataRuptura !== null && iso(p.dataRuptura)! <= dataEntrada;
  return {
    grupo: p.estoqueInicial <= 0 ? "hoje" : rompeAte ? "ate_entrada" : "depois",
    codigo: p.codigo,
    descricao: p.descricao,
    filial: p.filial,
    estoqueInicial: p.estoqueInicial,
    consumoDiario: p.consumoDiario,
    dataRuptura: iso(p.dataRuptura),
    diasDescobertos: p.diasDescobertosAteEntrada,
    faltaUnidades: p.faltaUnidades,
    entradaFutura: p.entradaFutura,
    chegadaFutura: iso(p.chegadaFutura),
    percurso: p.percurso.map((x) => ({
      cd: x.cd,
      chegada: iso(x.chegada),
      transitTime: x.transitTime,
    })),
    entradasAbertas: p.entradasAbertas.map((e) => ({
      origem: e.origem,
      quantidade: e.quantidade,
      chegada: iso(e.chegada)!,
      documento: e.documento,
      rota: e.rota,
    })),
    aviso: p.aviso,
  };
}

export async function rodarCenario(
  _anterior: EstadoCenario,
  form: FormData
): Promise<EstadoCenario> {
  const autorizado = await exigirAdminOuErro();
  if (!autorizado.ok) return { ok: false, erro: autorizado.erro };

  const fornecedor = String(form.get("fornecedor") ?? "").trim();
  const pergunta = String(form.get("pergunta") ?? "").trim();

  if (!fornecedor) return { ok: false, erro: "Escolha um fornecedor." };
  if (pergunta.length < 10) {
    return { ok: false, erro: "Descreva o cenário com um pouco mais de detalhe." };
  }

  const data = await lerDataReferencia();
  const parametros = await lerParametros();
  const projecao = {
    diasTransferencias: parametros.diasTransferencias,
    diasPedidos: parametros.diasPedidos,
  };

  const interpretada = await interpretarPergunta(pergunta, fornecedor, data);
  if (!interpretada.ok) return { ok: false, erro: interpretada.erro };

  const antes = await simular(data, interpretada.premissa, projecao);
  if (antes.posicoes.length === 0) {
    return { ok: false, erro: `Não há posições com forecast para ${fornecedor} nesta data.` };
  }

  const analise = await analisarCenario(antes, pergunta);
  if (!analise.ok) return { ok: false, erro: analise.erro };

  // Recalcula com as contingências propostas. Sem ações válidas não há segundo
  // cenário — melhor deixar a seção vazia do que exibir o mesmo número duas
  // vezes como se fosse um ganho.
  const acoes = paraAcoesDoMotor(analise.analise.acoes);
  const simulacaoDepois =
    acoes.length > 0
      ? await simular(data, interpretada.premissa, projecao, acoes)
      : null;
  const depois = simulacaoDepois ? resumir(simulacaoDepois) : null;

  const ignoradas = (simulacaoDepois?.acoesIgnoradas ?? []).map(({ acao, motivo }) => ({
    descricao:
      acao.tipo === "transferencia"
        ? `Transferir ${acao.quantidade} un de ${acao.codigo} (${acao.origem} → ${acao.destino})`
        : acao.tipo === "compra_emergencial"
          ? `Compra emergencial de ${acao.quantidade} un de ${acao.codigo} em ${acao.destino}`
          : `Antecipar entrada para ${acao.novaData}`,
    motivo,
  }));

  const resultado: ResultadoTela = {
    ok: true,
    fornecedor,
    pergunta,
    interpretacao: interpretada.interpretacao,
    // A data efetivamente simulada, que pode ter sido corrigida pelo motor.
    dataEntrada: antes.premissa.dataEntrada < antes.dataBase
      ? antes.dataBase
      : interpretada.premissa.dataEntrada,
    avisoPremissa: antes.avisoPremissa,
    dataBase: antes.dataBase,
    saldoTotal: antes.saldoTotal,
    itensComSaldo: antes.itensComSaldo,
    antes: resumir(antes),
    // Sem corte de 40: a pergunta pede a lista completa do que rompe hoje e do
    // que rompe até a data da premissa. Posições que só rompem depois entram
    // quando têm reposição a caminho — o que já está colocado faz parte da
    // decisão, mesmo onde a ruptura é mais tarde.
    criticas: antes.posicoes
      .filter(
        (p) =>
          p.estoqueInicial <= 0 ||
          (p.dataRuptura !== null &&
            iso(p.dataRuptura)! <= interpretada.premissa.dataEntrada) ||
          p.entradasAbertas.length > 0
      )
      .map((p) => paraTela(p, interpretada.premissa.dataEntrada)),
    resumoIa: analise.analise.resumo,
    destaques: analise.analise.criticos,
    acoes: analise.analise.acoes,
    depois,
    ignoradas,
  };

  // Grava para a análise sobreviver à navegação. Falha de escrita não pode
  // custar o resultado: o usuário esperou duas chamadas de IA e duas simulações,
  // e continuar sem salvar é melhor que devolver erro.
  try {
    const salvo = await prisma.cenarioSalvo.create({
      data: {
        fornecedor,
        pergunta,
        data_base: new Date(`${data}T00:00:00.000Z`),
        data_entrada: new Date(`${interpretada.premissa.dataEntrada}T00:00:00.000Z`),
        rompem: resultado.antes.rompem,
        dias_descobertos: resultado.antes.diasDescobertos,
        unidades_faltando: resultado.antes.unidadesFaltando,
        resultado,
      },
      select: { id: true },
    });
    resultado.id = salvo.id;
    revalidatePath("/cenarios");
  } catch (erro) {
    console.error("[cenario] falha ao gravar a análise:", erro);
  }

  return resultado;
}

/** Resumo de um cenário guardado, para o card da lista. */
export type CenarioResumo = {
  id: string;
  fornecedor: string;
  pergunta: string;
  criadoEm: string;
  dataBase: string;
  dataEntrada: string;
  rompem: number;
  diasDescobertos: number;
  unidadesFaltando: number;
};

export async function listarCenarios(limite = 24): Promise<CenarioResumo[]> {
  // Leitura é de quem tem sessão: a tela de cenários passou a ser visível para
  // todos, e é a geração que custa dinheiro e continua restrita.
  if (!(await lerSessao())) return [];

  const linhas = await prisma.cenarioSalvo.findMany({
    orderBy: { createdAt: "desc" },
    take: limite,
    select: {
      id: true,
      fornecedor: true,
      pergunta: true,
      createdAt: true,
      data_base: true,
      data_entrada: true,
      rompem: true,
      dias_descobertos: true,
      unidades_faltando: true,
    },
  });

  return linhas.map((l) => ({
    id: l.id,
    fornecedor: l.fornecedor,
    pergunta: l.pergunta,
    criadoEm: l.createdAt.toISOString(),
    dataBase: l.data_base.toISOString().slice(0, 10),
    dataEntrada: l.data_entrada.toISOString().slice(0, 10),
    rompem: l.rompem,
    diasDescobertos: l.dias_descobertos,
    unidadesFaltando: l.unidades_faltando,
  }));
}

/**
 * Reabre um cenário guardado, exatamente como foi lido na época.
 *
 * O JSON é um retrato tirado com o formato que existia na hora, e o formato
 * muda — `grupo` e `entradasAbertas` nasceram depois das primeiras análises.
 * Normalizar aqui, na entrada, mantém o resto do código livre de defesa
 * espalhada: quem consome recebe sempre a forma atual.
 *
 * `grupo` é derivado pela mesma regra da geração, então um retrato antigo é
 * classificado como seria hoje. `entradasAbertas` fica vazio porque o dado não
 * foi guardado — e vazio é honesto: quer dizer "não sei", não "não havia".
 */
export async function carregarCenario(id: string): Promise<ResultadoTela | null> {
  if (!(await lerSessao())) return null;

  const linha = await prisma.cenarioSalvo.findUnique({
    where: { id },
    select: { resultado: true },
  });
  if (!linha) return null;

  const bruto = linha.resultado as unknown as ResultadoTela;
  return {
    ...bruto,
    criticas: (bruto.criticas ?? []).map((c) => ({
      ...c,
      entradasAbertas: c.entradasAbertas ?? [],
      grupo:
        c.grupo ??
        (c.estoqueInicial <= 0
          ? "hoje"
          : c.dataRuptura && c.dataRuptura <= bruto.dataEntrada
            ? "ate_entrada"
            : "depois"),
    })),
    destaques: bruto.destaques ?? [],
    acoes: bruto.acoes ?? [],
    ignoradas: bruto.ignoradas ?? [],
  };
}

export async function excluirCenario(form: FormData): Promise<void> {
  if (!(await exigirAdminOuErro()).ok) return;

  const id = String(form.get("id") ?? "");
  if (!id) return;

  await prisma.cenarioSalvo.delete({ where: { id } }).catch(() => undefined);
  revalidatePath("/cenarios");
}
