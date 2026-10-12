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
import { subtrairDiasUteis } from "@/utils/projecao-transferencias";
import {
  aberturasDeForecast,
  carregarAbertura,
  chave,
} from "./abertura";
import {
  classificar,
  type Classificacao,
  type ContextoArvore,
} from "./arvore";
import { carregarSinais, saldoEm } from "./sinais";
import {
  apenasEmRuptura,
  carregarPosicoes,
  cargasSuspeitas,
  custoPorItem,
  montarEventos,
  sobraPorItem,
  type Evento,
} from "./eventos";
import { carregarEntregas, carregarFatos, carregarPrazos } from "./janela";
import { candidatas } from "./regras";
import { dividirDias } from "./contrafactual";
import { prescrever } from "./prescricao";
import {
  consumoComoDemanda,
  diasEmRuptura,
  rompidaPorDia,
  type Cenario,
} from "./replay";
import { LIMITES, VERSAO_REGRAS } from "./parametros";

export type ResultadoRodada = {
  eventos: number;
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
  sobras: Map<string, number>;
  fornecedores: Map<string, string>;
  descricoes: Map<string, string | null>;
  /** Dias cuja carga não passou no teste de sanidade. */
  ignorar: Set<string>;
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
  ] = await Promise.all([
    aberturasDeForecast(de, dataReferencia),
    carregarFatos(de, dataReferencia),
    custoPorItem(),
    carregarSaldoPlano(dataReferencia),
    carregarEntregas(de, dataReferencia),
    carregarPrazos(),
    lerCoberturas(),
    carregarSinais(de, dataReferencia),
  ]);

  const posicoes = await carregarPosicoes(de, dataReferencia, dataReferencia);
  const ignorar = new Set(cargasSuspeitas(posicoes).map((s) => s.data));
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

  const [fornecedores, descricoes] = await Promise.all([
    fornecedorPorItem(dataReferencia),
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
    sobras: sobraPorItem(posicoes, dataReferencia, coberturas.alvo),
    fornecedores,
    descricoes,
    ignorar,
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
    excedenteOutrosCds: b.sobras.get(e.codigo) ?? 0,
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
    podiaTransferirENaoTransferiu: (b.sobras.get(e.codigo) ?? 0) > 0,
  };
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
    causas: linhas.reduce((a, l) => a + l.causas.length, 0),
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
  descricao: string | null;
  confianca: "alta" | "media" | "baixa";
  diasExplicados: number;
  avisoReplay: boolean;
  herdada: boolean;
  aberturaData: string | null;
  aberturaOrigem: string;
  causas: {
    causa: string;
    papel: string;
    dias: number;
    percentual: number;
    evidencias: Record<string, unknown>;
  }[];
  /**
   * O veredito da árvore de decisão, ao lado do contrafactual.
   *
   * Calculado na rodada e ainda não gravado: a comparação entre as duas réguas
   * precisa existir antes de a tela escolher qual mostrar, e gravar uma coluna
   * para um veredito que talvez mude de forma custaria uma migração a mais.
   */
  arvore: Classificacao;
  hash: string;
};

function diagnosticar(b: Bases, e: Evento): Diagnostico {
  const { de, ate } = b;
  const k = chave(e.codigo, e.filial);
  const contexto = contextoDe(b, e);
  const { abertura, vendas: demanda } = contexto;
  const fornecedor = b.fornecedores.get(e.codigo) ?? null;

  const lista = candidatas(contexto);

  const atribuicoes = dividirDias(lista, e.dias);
  const explicados = atribuicoes
    .filter((a) => a.papel === "causa" && a.slug !== "sem_evidencia")
    .reduce((a, x) => a + x.dias, 0);

  // O replay reproduz a ruptura observada? Medido na validação, 75% dos
  // eventos passam. Os demais recebem o selo: um diagnóstico construído sobre
  // um replay que não fecha não merece a mesma confiança.
  const real: Cenario = {
    de,
    ate,
    estoqueInicial: abertura?.disponivel ?? 0,
    consumo: demanda,
    chegadas: b.fatos.chegadas.get(k) ?? [],
  };
  const simulado = diasEmRuptura(real);
  const avisoReplay =
    Math.abs(simulado - e.dias) > Math.max(2, e.dias * 0.3);

  // A prescrição entra como evidência da transferência: é a frase acionável.
  const receita = prescrever(real, b.sobras.get(e.codigo) ?? 0, e.inicio);
  const causas = atribuicoes.map((a) => ({
    causa: a.slug,
    papel: a.papel,
    dias: a.dias,
    percentual: a.percentual,
    evidencias:
      a.slug === "transferencia_nao_feita" && receita
        ? { ...a.evidencias, prescricao: receita }
        : a.evidencias,
  }));

  const fracao = e.dias > 0 ? explicados / e.dias : 0;
  const marcada = b.foto.marco.origem === "marcada";
  let confianca: "alta" | "media" | "baixa";
  if (avisoReplay || fracao < 0.7) confianca = "baixa";
  else if (fracao >= 0.9 && marcada) confianca = "alta";
  else confianca = "media";

  return {
    evento: e,
    fornecedor,
    descricao: b.descricoes.get(e.codigo) ?? null,
    confianca,
    diasExplicados: explicados,
    avisoReplay,
    // A ruptura já estava contratada quando o mês abriu.
    herdada: (abertura?.disponivel ?? 0) <= 0 || !!abertura?.abaixoDaPolitica,
    aberturaData: b.foto.marco.data,
    aberturaOrigem: b.foto.marco.origem,
    causas,
    arvore: classificar(contexto),
    hash: hashDaEntrada(
      e,
      abertura?.disponivel ?? 0,
      contexto.forecastMensal,
    ),
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

      // Em lote, e não um a um. A primeira versão criava evento por evento com
      // as causas aninhadas: quatrocentos eventos deram mais de quatrocentas
      // idas ao banco e a transação estourou os dois minutos contra o banco
      // remoto. São duas consultas agora.
      const criados = await tx.rupturaEvento.createManyAndReturn({
        select: { id: true, codigo: true, filial: true, inicio: true },
        data: linhas.map((l) => ({
          codigo: l.evento.codigo,
          filial: l.evento.filial,
          fornecedor: l.fornecedor,
          descricao: l.descricao,
          inicio: new Date(`${l.evento.inicio}T00:00:00.000Z`),
          fim: l.evento.fim ? new Date(`${l.evento.fim}T00:00:00.000Z`) : null,
          dias: l.evento.dias,
          valor_perdido: l.evento.valorPerdido,
          confianca: l.confianca,
          dias_explicados: l.diasExplicados,
          aviso_replay: l.avisoReplay,
          abertura_data: l.aberturaData
            ? new Date(`${l.aberturaData}T00:00:00.000Z`)
            : null,
          abertura_origem: l.aberturaOrigem,
          herdada_abertura: l.herdada,
          versao_regras: VERSAO_REGRAS,
          entrada_hash: l.hash,
        })),
      });

      // A chave natural casa o id gerado com o diagnóstico que o produziu —
      // `createManyAndReturn` devolve na ordem de inserção, mas depender disso
      // seria depender de detalhe não documentado.
      const idDe = new Map(
        criados.map((c) => [
          `${c.codigo}|${c.filial}|${c.inicio.toISOString().slice(0, 10)}`,
          c.id,
        ]),
      );

      const causas = linhas.flatMap((l) => {
        const id = idDe.get(
          `${l.evento.codigo}|${l.evento.filial}|${l.evento.inicio}`,
        );
        if (id === undefined) return [];
        return l.causas.map((c) => ({
          eventoId: id,
          causa: c.causa,
          papel: c.papel,
          dias: c.dias,
          percentual: c.percentual,
          evidencias: c.evidencias as object,
        }));
      });

      if (causas.length > 0) {
        await tx.rupturaCausa.createMany({ data: causas });
      }
    },
    { timeout: 120_000 },
  );
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
  >(`SELECT codigo, descricao FROM produtos WHERE codigo = ANY($1::text[])`, codigos);
  return new Map(linhas.map((l) => [l.codigo, l.descricao]));
}

export { LIMITES };
