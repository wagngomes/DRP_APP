/**
 * A rodada: carrega, diagnostica e grava.
 *
 * Carrega as bases da janela **uma vez** e monta tudo em memória. O volume
 * medido para sessenta dias é da ordem de 350 mil linhas e 456 MB de heap —
 * mesma ordem de grandeza do que a importação diária já faz, e dentro do
 * limite de 4 GB do contêiner. Perguntar por evento multiplicaria as idas ao
 * banco por centenas.
 *
 * Roda quando alguém clica, não no fim da importação: a carga diária continua
 * com a duração de hoje, e uma falha aqui nunca derruba o que está no ar.
 */
import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { carregarSaldoPlano } from "@/lib/compras/saldo-plano";
import { lerCoberturas } from "@/lib/parametros.server";
import { snapshotMensalSql } from "@/utils/dias-estoque";

import { limitesDoMes } from "@/utils/mes";
import { subtrairDiasUteis } from "@/utils/projecao-transferencias";
import { somarDias } from "./serie";
import { aberturasDeForecast, carregarAbertura, chave } from "./abertura";
import { classificar, type Classificacao, type ContextoArvore } from "./arvore";
import { carregarSinais, saldoEm } from "./sinais";
import { carregarSlaAtivo, type SlaAtivo } from "./sla-ativo";
import {
  apenasEmRuptura,
  carregarPosicoes,
  cargasSuspeitas,
  custoPorItem,
  diasDeAviso,
  montarEventos,
  sobraDetalhada,
  sobraPorDia,
  type CargaSuspeita,
  type Evento,
  type PosicaoDia,
  type SobraNoCd,
} from "./eventos";
import { carregarEntregas, carregarFatos, carregarPrazos } from "./janela";
import {
  oportunidadeDeTransferencia,
  type Oportunidade,
} from "./balanceamento";
import { evidenciar, replayDivergiu, type Evidencia } from "./evidencias";
import { consumoComoDemanda, rompidaPorDia } from "./replay";
import { LIMITES, VERSAO_REGRAS } from "./parametros";

export type ResultadoRodada = {
  eventos: number;
  /** Quantas causas distintas a árvore apontou na rodada. */
  causas: number;
  /** Quantos saíram com o replay divergindo do estoque real. */
  avisos: number;
  duracaoMs: number;
  abertura: { data: string | null; origem: string };
};

/**
 * Lead time padrão quando o par fornecedor × CD não tem cadastro.
 *
 * A mediana real medida na base inteira. Melhor que zero, que faria toda
 * compra parecer instantânea, e melhor que um número inventado.
 */
const LEAD_TIME_PADRAO = 8;

/**
 * Tudo que a janela tem a dizer, carregado uma vez.
 *
 * Separado de `processar` para que a comparação entre os dois diagnósticos — o
 * contrafactual e a árvore — possa montar os mesmos contextos sem repetir o
 * carregamento nem, pior, divergir dele. Quem compara duas réguas tem de usar
 * exatamente o mesmo dado nas duas.
 */
export type Bases = {
  de: string;
  ate: string;
  foto: Awaited<ReturnType<typeof carregarAbertura>>;
  aberturas: Awaited<ReturnType<typeof aberturasDeForecast>>;
  fatos: Awaited<ReturnType<typeof carregarFatos>>;
  planos: Awaited<ReturnType<typeof carregarSaldoPlano>>;
  entregas: Awaited<ReturnType<typeof carregarEntregas>>;
  prazos: Awaited<ReturnType<typeof carregarPrazos>>;
  sinais: Awaited<ReturnType<typeof carregarSinais>>;
  eventos: Evento[];
  estado: Map<string, Map<string, boolean>>;
  forecastDa: Map<string, number>;
  retidoDa: Map<string, number>;
  /** Sobra acima do Alvo no dia de referência, aberta por CD. */
  sobras: Map<string, SobraNoCd[]>;
  /** A mesma sobra, dia a dia: `data -> item -> doadores`. */
  sobrasPorDia: Map<string, Map<string, SobraNoCd[]>>;
  /**
   * SLA entre CDs, só os pares **ativos** e abertos por tipo de produto.
   *
   * Não é o `carregarSla()` compartilhado: aquele cai para o tempo da linha
   * inativa quando o par não tem nenhuma ativa, e são 10 dos 81 pares nessa
   * situação. Transferência em par inativo não é permitida, e acusar a
   * operação por não a ter feito é cobrar o impossível.
   */
  sla: Map<string, SlaAtivo>;
  coberturas: Awaited<ReturnType<typeof lerCoberturas>>;
  fornecedores: Map<string, string>;
  /** BU por posição item × CD. */
  bus: Map<string, string>;
  /** Dias de aviso por `posição|início`; nulo quando não há histórico. */
  avisoDe: Map<string, number | null>;
  descricoes: Map<string, string | null>;
  /** Dias cuja carga não passou no teste de sanidade. */
  ignorar: Set<string>;
  /** O detalhe de cada carga reprovada, para virar evidência. */
  suspeitas: Map<string, CargaSuspeita>;
};

export async function carregarBases(dataReferencia: string): Promise<Bases> {
  const foto = await carregarAbertura(dataReferencia);
  // Sem foto de abertura não há âncora para o replay, e diagnosticar sem ela
  // seria chutar o ponto de partida de toda a cadeia.
  const de = foto.marco.data ?? `${dataReferencia.slice(0, 7)}-01`;

  const [
    aberturas,
    fatos,
    custos,
    planos,
    entregas,
    prazos,
    coberturas,
    sinais,
    sla,
  ] = await Promise.all([
    aberturasDeForecast(de, dataReferencia),
    carregarFatos(de, dataReferencia),
    custoPorItem(),
    carregarSaldoPlano(dataReferencia),
    carregarEntregas(de, dataReferencia),
    carregarPrazos(),
    lerCoberturas(),
    carregarSinais(de, dataReferencia),
    carregarSlaAtivo(),
  ]);

  /**
   * O histórico começa no mês anterior, a janela do diagnóstico não.
   *
   * São duas perguntas diferentes sobre o mesmo dado. O **evento** e o replay
   * continuam ancorados na foto de abertura, porque é ela que define o estoque
   * inicial e o que foi contratado antes do mês. Mas o sinal de **dias de
   * aviso** precisa olhar para trás do dia 1º: medido antes desta mudança,
   * 223 das 458 posições (49%) ficavam sem resposta porque a ruptura começava
   * no primeiro dia da janela e não havia passado nenhum para medir.
   *
   * Uma consulta só, filtrada em memória depois: pedir duas vezes ao banco o
   * mesmo intervalo sobreposto custaria o dobro para a mesma informação.
   */
  const historicoDe = limitesDoMes(
    somarDias(limitesDoMes(dataReferencia).inicio, -1),
  ).inicio;
  const historico = await carregarPosicoes(
    historicoDe,
    dataReferencia,
    dataReferencia,
  );
  const posicoes = historico.filter((p) => p.data >= de);
  const reprovadas = cargasSuspeitas(posicoes);
  const suspeitas = new Map(reprovadas.map((s) => [s.data, s]));
  const ignorar = new Set(reprovadas.map((s) => s.data));
  const eventos = apenasEmRuptura(
    montarEventos(posicoes, dataReferencia, custos, ignorar),
  );

  // Índices em memória: uma passada sobre as posições serve a tudo.
  const estado = new Map<string, Map<string, boolean>>();
  const forecastDa = new Map<string, number>();
  const retidoDa = new Map<string, number>();
  for (const p of posicoes) {
    const k = chave(p.codigo, p.filial);
    const m = estado.get(k) ?? new Map<string, boolean>();
    m.set(p.data, p.rompida);
    estado.set(k, m);
    forecastDa.set(k, p.forecastMensal);
    // O maior retido da janela, não o do último dia: o estoque preso em Q40/RC
    // costuma ser liberado ou baixado antes de a ruptura fechar, e o do último
    // dia diria zero justamente onde a causa existiu.
    retidoDa.set(k, Math.max(retidoDa.get(k) ?? 0, p.retido));
  }

  // Dias de aviso por posição, do histórico inteiro. Calculado uma vez aqui:
  // por evento seria uma varredura do histórico por posição.
  const historicoPorPosicao = new Map<string, PosicaoDia[]>();
  for (const p of historico) {
    const k = chave(p.codigo, p.filial);
    const lista = historicoPorPosicao.get(k);
    if (lista) lista.push(p);
    else historicoPorPosicao.set(k, [p]);
  }
  const avisoDe = new Map<string, number | null>();
  for (const e of eventos) {
    const k = chave(e.codigo, e.filial);
    avisoDe.set(
      `${k}|${e.inicio}`,
      diasDeAviso(historicoPorPosicao.get(k) ?? [], e.inicio, coberturas.gatilho),
    );
  }

  const [fornecedores, bus, descricoes] = await Promise.all([
    fornecedorPorItem(dataReferencia),
    buPorPosicao(dataReferencia),
    descricaoPorItem([...new Set(eventos.map((e) => e.codigo))]),
  ]);

  return {
    de,
    ate: dataReferencia,
    foto,
    aberturas,
    fatos,
    planos,
    entregas,
    prazos,
    sinais,
    eventos,
    estado,
    forecastDa,
    retidoDa,
    sobras: sobraDetalhada(posicoes, dataReferencia, coberturas.alvo),
    sobrasPorDia: sobraPorDia(posicoes, coberturas.alvo),
    avisoDe,
    sla,
    coberturas,
    fornecedores,
    bus,
    descricoes,
    ignorar,
    suspeitas,
  };
}

/**
 * O contexto de uma posição: os fatos dela, prontos para as duas réguas.
 *
 * Devolve `ContextoArvore`, que é `Contexto` mais os sinais que só a árvore
 * pergunta. O motor contrafactual recebe o mesmo objeto e ignora o excedente —
 * assim nenhuma das duas pode estar olhando um dado que a outra não viu.
 */
export function contextoDe(b: Bases, e: Evento): ContextoArvore {
  const k = chave(e.codigo, e.filial);
  const abertura = b.foto.posicoes.get(k);
  const forecastMensal = b.forecastDa.get(k) ?? 0;
  const fornecedor = b.fornecedores.get(e.codigo) ?? null;
  const prazo = b.prazos.get(chave(fornecedor ?? "", e.filial));
  const leadTime = prazo?.cadastrado ?? LEAD_TIME_PADRAO;

  // A demanda do replay não é a venda crua: posição rompida não vende, e usar
  // a venda observada faria o consumo cair justamente nos dias de ruptura.
  const demanda = consumoComoDemanda({
    de: b.de,
    ate: b.ate,
    vendas: b.fatos.vendas.get(k) ?? new Map(),
    rompidaEm: rompidaPorDia(b.de, b.ate, b.estado.get(k) ?? new Map()),
    forecastMensal,
  });

  // A data limite de compra: andando para trás do início da ruptura, em dias
  // úteis, o lead time do par fornecedor × CD. É a régua de B3 e de B3a.
  const dataLimite = subtrairDiasUteis(
    new Date(`${e.inicio}T00:00:00.000Z`),
    Math.round(leadTime),
  )
    .toISOString()
    .slice(0, 10);

  const pedido = b.sinais.pedidos.get(k);
  const compraAnterior = b.sinais.compraAnterior.get(k);
  const percurso = b.sinais.percurso.get(k);
  const mesAnterior = b.foto.anterior.get(k);

  return {
    evento: e,
    de: b.de,
    ate: b.ate,
    vendas: demanda,
    chegadas: b.fatos.chegadas.get(k) ?? [],
    forecastMensal,
    abertura,
    mesAnterior,
    aberturaForecast: b.aberturas.get(k),
    planoDoMes: b.planos.get(e.codigo),
    leadTime,
    excedenteOutrosCds: totalDaSobra(b, e.codigo),
    entregas: b.entregas.get(k),
    prazo,

    // --- os sinais da árvore ---
    cargaSuspeita: b.ignorar.has(e.inicio),
    retido: b.retidoDa.get(k) ?? 0,
    // A necessidade do mês anterior é medida contra o forecast *daquele* mês:
    // cobrar o plano de agosto pela previsão de setembro seria cobrar outra
    // decisão.
    planoMesAnterior:
      mesAnterior && b.sinais.planoAnterior.has(e.codigo)
        ? {
            plano: b.sinais.planoAnterior.get(e.codigo)!,
            necessidade:
              (mesAnterior.forecast / 30) *
              (leadTime + (abertura?.politicaDias ?? 0)),
          }
        : undefined,
    compraMesAnteriorNoPrazo: compraAnterior
      ? compraAnterior.atrasadas === 0
      : undefined,
    saldoNaDataLimite: b.sinais.movimento.has(e.codigo)
      ? saldoEm(b.sinais.movimento.get(e.codigo), dataLimite)
      : undefined,
    pedido: pedido
      ? {
          emitidoEm: pedido.emitidoEm,
          quantidade: pedido.quantidade,
          dataLimite,
        }
      : undefined,
    pedidoSumiuSemReceber: pedido ? b.sinais.sumidos.has(k) : undefined,
    triangulado: pedido?.triangulado,
    slaInternoEstourado: percurso ? percurso.slaEstourado : null,
    paradaNoHub: percurso ? percurso.paradaNoHub : null,
    // Não "havia sobra em algum lugar", mas "a operação teria conseguido fazer
    // esta transferência": doador com estoque no armazém 01 acima do Alvo no
    // dia do despacho, SLA cadastrado, prazo que cabia antes da ruptura e
    // quantidade que tira o destino do Gatilho. A régua frouxa marcava 45% das
    // posições e produzia frases de uma unidade.
    podiaTransferirENaoTransferiu: oportunidadeDe(b, e) !== null,
  };
}

/** A transferência que teria evitado a ruptura, pelas regras da operação. */
export function oportunidadeDe(b: Bases, e: Evento): Oportunidade | null {
  const forecastMensal = b.forecastDa.get(chave(e.codigo, e.filial)) ?? 0;

  // Só os doadores deste item, por dia. O índice é por data e item, então a
  // busca é direta.
  const sobraPorDiaDoItem = new Map<string, SobraNoCd[]>();
  for (const [data, porItem] of b.sobrasPorDia) {
    const lista = porItem.get(e.codigo);
    if (lista) sobraPorDiaDoItem.set(data, lista);
  }

  return oportunidadeDeTransferencia({
    destino: e.filial,
    inicioDaRuptura: e.inicio,
    de: b.de,
    consumoDiario: forecastMensal / 30,
    sobraPorDia: sobraPorDiaDoItem,
    sla: b.sla,
    bu: b.bus.get(chave(e.codigo, e.filial)) ?? null,
    gatilho: b.coberturas.gatilho,
    alvo: b.coberturas.alvo,
  });
}

/** Soma da sobra do item na rede, a partir do detalhe por CD. */
function totalDaSobra(b: Bases, codigo: string): number {
  return (b.sobras.get(codigo) ?? []).reduce((a, s) => a + s.sobra, 0);
}

export async function processar(
  dataReferencia: string,
): Promise<ResultadoRodada> {
  const comecou = Date.now();

  const bases = await carregarBases(dataReferencia);
  const linhas = bases.eventos.map((evento) => diagnosticar(bases, evento));

  await gravar(linhas);

  return {
    eventos: linhas.length,
    causas: new Set(linhas.map((l) => l.arvore.causa)).size,
    avisos: linhas.filter((l) => l.avisoReplay).length,
    duracaoMs: Date.now() - comecou,
    abertura: {
      data: bases.foto.marco.data,
      origem: bases.foto.marco.origem,
    },
  };
}

type Diagnostico = {
  evento: Evento;
  fornecedor: string | null;
  bu: string | null;
  /** Dias abaixo do Gatilho antes de zerar; nulo sem histórico. */
  diasAviso: number | null;
  descricao: string | null;
  confianca: "alta" | "media" | "baixa";
  avisoReplay: boolean;
  herdada: boolean;
  aberturaData: string | null;
  aberturaOrigem: string;
  /** O veredito: uma causa, o caminho que levou a ela e a prova. */
  arvore: Classificacao;
  evidencia: Evidencia;
  hash: string;
};

/**
 * O diagnóstico de uma posição: uma causa, com prova.
 *
 * A árvore decide; o replay e a prescrição entram como evidência. Não há mais
 * divisão de dias entre várias causas — duas réguas na mesma tela davam duas
 * verdades, e a soma dos percentuais não fechava com nada que se pudesse
 * cobrar de alguém.
 */
function diagnosticar(b: Bases, e: Evento): Diagnostico {
  const contexto = contextoDe(b, e);
  const { abertura } = contexto;
  const arvore = classificar(contexto);

  const evidencia = evidenciar(
    contexto,
    arvore.causa,
    {
      sobraPorCd: b.sobras.get(e.codigo) ?? [],
      oportunidade: oportunidadeDe(b, e),
      pedidosSumidos: b.sinais.sumidos.get(chave(e.codigo, e.filial)) ?? 0,
      percurso: b.sinais.percurso.get(chave(e.codigo, e.filial)),
      cargaSuspeita: b.suspeitas.get(e.inicio),
    },
    arvore.balanceamentoNaoRealizado,
  );

  // Um diagnóstico construído sobre um balanço que não fecha não merece a
  // mesma confiança — e a tela precisa dizer isso, em vez de apresentar o
  // veredito com a mesma cara dos demais.
  const avisoReplay = replayDivergiu(contexto);

  // A confiança agora olha a árvore, e não a fração de dias explicados: sem
  // atribuição, aquela fração não existe. Percurso que travou por falta de
  // dado derruba a confiança, que é o mesmo princípio de antes aplicado à
  // régua nova.
  const marcada = b.foto.marco.origem === "marcada";
  let confianca: "alta" | "media" | "baixa";
  if (avisoReplay || arvore.incompleta) confianca = "baixa";
  else if (marcada) confianca = "alta";
  else confianca = "media";

  return {
    evento: e,
    fornecedor: b.fornecedores.get(e.codigo) ?? null,
    bu: b.bus.get(chave(e.codigo, e.filial)) ?? null,
    diasAviso: b.avisoDe.get(`${chave(e.codigo, e.filial)}|${e.inicio}`) ?? null,
    descricao: b.descricoes.get(e.codigo) ?? null,
    confianca,
    avisoReplay,
    // A ruptura já estava contratada quando o mês abriu.
    herdada: (abertura?.disponivel ?? 0) <= 0 || !!abertura?.abaixoDaPolitica,
    aberturaData: b.foto.marco.data,
    aberturaOrigem: b.foto.marco.origem,
    arvore,
    evidencia,
    hash: hashDaEntrada(e, abertura?.disponivel ?? 0, contexto.forecastMensal),
  };
}

/**
 * Hash das entradas: mesma entrada e mesma versão, mesmo diagnóstico.
 *
 * Serve para a tela saber se um evento foi recalculado porque o dado mudou ou
 * porque a régua mudou — sem isso, os dois casos são indistinguíveis.
 */
function hashDaEntrada(
  e: Evento,
  estoqueAbertura: number,
  forecast: number,
): string {
  return createHash("sha256")
    .update(
      [e.codigo, e.filial, e.inicio, e.dias, estoqueAbertura, forecast].join(
        "|",
      ),
    )
    .digest("hex")
    .slice(0, 16);
}

/**
 * Grava a rodada, substituindo a anterior da mesma versão de regras.
 *
 * Idempotente por construção: reprocessar o mesmo dia com a mesma versão
 * apaga e regrava, em vez de duplicar. Versão nova **acrescenta**, e os
 * diagnósticos antigos ficam — é o que permite comparar as duas réguas.
 *
 * Tudo numa transação: uma falha no meio deixaria a tela com metade dos
 * eventos do dia, o que é pior que nenhum.
 */
async function gravar(linhas: Diagnostico[]) {
  await prisma.$transaction(
    async (tx) => {
      // Apaga a rodada inteira desta versão, não só a do dia: o motor
      // diagnostica "o que está rompido agora", então a rodada nova substitui
      // o retrato anterior por completo. Versão de regra diferente sobrevive,
      // que é o que permite comparar duas réguas.
      await tx.rupturaEvento.deleteMany({
        where: { versao_regras: VERSAO_REGRAS },
      });

      if (linhas.length === 0) return;

      // Em lote, e numa consulta só. A primeira versão criava evento por
      // evento com as causas aninhadas: quatrocentos eventos deram mais de
      // quatrocentas idas ao banco e a transação estourou os dois minutos
      // contra o banco remoto. Depois foram duas — eventos e causas. Com a
      // árvore devolvendo uma causa por evento, a prova cabe na própria linha
      // e a tabela filha deixou de ser escrita.
      await tx.rupturaEvento.createMany({
        data: linhas.map((l) => ({
          codigo: l.evento.codigo,
          filial: l.evento.filial,
          fornecedor: l.fornecedor,
          bu: l.bu,
          dias_aviso: l.diasAviso,
          descricao: l.descricao,
          inicio: new Date(`${l.evento.inicio}T00:00:00.000Z`),
          fim: l.evento.fim ? new Date(`${l.evento.fim}T00:00:00.000Z`) : null,
          dias: l.evento.dias,
          valor_perdido: l.evento.valorPerdido,
          confianca: l.confianca,
          aviso_replay: l.avisoReplay,
          abertura_data: l.aberturaData
            ? new Date(`${l.aberturaData}T00:00:00.000Z`)
            : null,
          abertura_origem: l.aberturaOrigem,
          herdada_abertura: l.herdada,
          arvore_causa: l.arvore.causa,
          arvore_incompleta: l.arvore.incompleta,
          // Só o nó que travou, e não o último da trilha: num percurso
          // completo o último nó respondeu, e gravá-lo aqui faria a tela
          // apontar "falta dado em V2" sobre um caso que não tem lacuna.
          arvore_no_travou:
            l.arvore.trilha.find((p) => p.resposta === null)?.no ?? null,
          arvore_balanceamento: l.arvore.balanceamentoNaoRealizado,
          arvore_trilha: l.arvore.trilha as unknown as object,
          arvore_evidencias: l.evidencia as unknown as object,
          versao_regras: VERSAO_REGRAS,
          entrada_hash: l.hash,
        })),
      });
    },
    { timeout: 120_000 },
  );
}

/**
 * BU por posição item × CD, de `forecast.b_u`.
 *
 * Por posição e não por item: a BU vem do forecast, que tem código **e**
 * filial, e o mesmo item pode estar em BUs diferentes conforme o CD.
 *
 * A normalização é a das outras telas — vazio vira "—", que a tela mostra como
 * "Sem BU". Sem ela, item sem BU preenchida sumiria do recorte em vez de
 * aparecer num grupo próprio.
 */
async function buPorPosicao(data: string): Promise<Map<string, string>> {
  const linhas = await prisma.$queryRawUnsafe<
    { codigo: string; filial: string; bu: string }[]
  >(
    `SELECT codigo, filial,
            COALESCE(NULLIF(trim(b_u), ''), '—') AS bu
       FROM forecast f
      WHERE ${snapshotMensalSql("forecast", "f", "$1")}
        AND codigo IS NOT NULL AND filial IS NOT NULL`,
    data,
  );
  return new Map(linhas.map((l) => [chave(l.codigo, l.filial), l.bu]));
}

/** Fornecedor por item, pela mesma cadeia da tela de fornecedores. */
async function fornecedorPorItem(data: string): Promise<Map<string, string>> {
  const linhas = await prisma.$queryRawUnsafe<
    { codigo: string; nome: string }[]
  >(
    `SELECT DISTINCT ON (s.codigo) s.codigo,
            COALESCE(NULLIF(trim(f.fornecedor_normalizado), ''), s.fornecedor) AS nome
       FROM simulador s
       LEFT JOIN fornecedores f ON f.fornecedor = s.fornecedor
      WHERE s.data_snapshot = $1::date AND s.fornecedor IS NOT NULL
      ORDER BY s.codigo`,
    data,
  );
  return new Map(linhas.map((l) => [l.codigo, l.nome]));
}

async function descricaoPorItem(
  codigos: string[],
): Promise<Map<string, string | null>> {
  if (codigos.length === 0) return new Map();
  const linhas = await prisma.$queryRawUnsafe<
    { codigo: string; descricao: string | null }[]
  >(
    `SELECT codigo, descricao FROM produtos WHERE codigo = ANY($1::text[])`,
    codigos,
  );
  return new Map(linhas.map((l) => [l.codigo, l.descricao]));
}

export { LIMITES };
