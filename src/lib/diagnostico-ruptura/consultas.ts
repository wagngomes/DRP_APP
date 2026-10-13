/**
 * Leitura da tela de diagnóstico.
 *
 * Lê só as tabelas do próprio motor, que já têm o resultado calculado. É a
 * consulta mais barata do sistema — nenhum join com as bases, nenhuma conta
 * em tempo de request. O trabalho pesado aconteceu na rodada.
 */
import { prisma } from "@/lib/prisma";
import { causaPorSlug, type Etapa } from "./catalogo";
import type { Evidencia } from "./evidencias";
import { VERSAO_REGRAS } from "./parametros";

export type FiltrosDiagnostico = {
  /** Código exato ou trecho da descrição. */
  produto?: string;
  fornecedor?: string;
  /** BU da posição, como gravada no evento. */
  bu?: string;
  /** Slug do catálogo — a causa que a árvore apontou. */
  causa?: string;
  /** Só as rupturas que a abertura do mês já tinha contratado. */
  herdadas?: boolean;
  /** Só os eventos em que a árvore parou por falta de dado. */
  incompletas?: boolean;
  /** Só onde outro CD tinha sobra acima do Alvo e nada saiu. */
  balanceamento?: boolean;
  /**
   * "com": a posição passou dias abaixo do Gatilho antes de zerar.
   * "sem": caiu de uma vez, ninguém tinha como reagir.
   */
  aviso?: "com" | "sem";
  pagina?: number;
};

/**
 * O veredito: uma causa por posição.
 *
 * Era uma de duas réguas — o contrafactual dividia os dias entre várias causas
 * e a árvore apontava uma. Duas verdades na mesma tela não davam uma conversa:
 * a soma dos percentuais não fechava com nada que se pudesse cobrar de alguém.
 * O que o contrafactual mede sobreviveu como **prova**, em `Evidencia`.
 */
export type VereditoArvore = {
  slug: string;
  rotulo: string;
  etapa: Etapa;
  dono: string;
  /** O percurso parou numa pergunta sem dado. */
  incompleta: boolean;
  /** Qual pergunta travou, quando travou. */
  noTravou: string | null;
};

export type LinhaRuptura = {
  id: number;
  codigo: string;
  descricao: string | null;
  filial: string;
  fornecedor: string | null;
  bu: string | null;
  inicio: string;
  dias: number;
  valorPerdido: number;
  confianca: string;
  avisoReplay: boolean;
  herdada: boolean;
  /** Nulo nos eventos de uma rodada anterior à árvore. */
  arvore: VereditoArvore | null;
  /** A frase da prova, para a linha não precisar do detalhe aberto. */
  resumo: string | null;
  /** Outro CD tinha sobra acima do Alvo e nada saiu. */
  balanceamento: boolean;
  /** Dias abaixo do Gatilho antes de zerar; nulo sem histórico medido. */
  diasAviso: number | null;
};

export const POR_PAGINA = 25;

/** Contagem por causa, para os chips que filtram. */
export type ContagemCausa = {
  slug: string;
  rotulo: string;
  etapa: Etapa;
  eventos: number;
  dias: number;
};

export type DadosDiagnostico = {
  linhas: LinhaRuptura[];
  total: number;
  pagina: number;
  paginas: number;
  /** Totais do recorte, não da página. */
  resumo: {
    eventos: number;
    dias: number;
    valorPerdido: number;
    herdadas: number;
    comAviso: number;
    /** Posições em que cabia transferência, contadas sem o filtro dele. */
    comBalanceamento: number;
    /** Passaram dias abaixo do Gatilho antes de zerar: alerta ignorado. */
    comAviso_: number;
    /** Caíram de uma vez: ninguém tinha como reagir. */
    semAviso: number;
  };
  contagens: ContagemCausa[];
  /**
   * Onde a árvore ficou sem dado, por nó.
   *
   * É a lista de tarefas de dados, não de diagnóstico: cada linha diz quantos
   * eventos travaram naquela pergunta e, portanto, qual carga repor primeiro.
   */
  lacunas: { no: string; eventos: number }[];
  /** BUs presentes no recorte, com a contagem de posições de cada uma. */
  bus: { valor: string; eventos: number }[];
  fornecedores: string[];
  /** Quando a última rodada foi calculada; nulo se nunca rodou. */
  calculadoEm: Date | null;
};

/**
 * Monta o `where` do Prisma a partir dos filtros da tela.
 *
 * O filtro por causa é uma coluna do próprio evento, e não um `some` sobre uma
 * tabela filha: a árvore devolve uma causa por posição, então a comparação é
 * direta e usa o índice.
 */
function where(f: FiltrosDiagnostico) {
  const termo = f.produto?.trim();
  return {
    versao_regras: VERSAO_REGRAS,
    ...(f.fornecedor ? { fornecedor: f.fornecedor } : {}),
    ...(f.bu ? { bu: f.bu } : {}),
    ...(f.causa ? { arvore_causa: f.causa } : {}),
    ...(f.herdadas ? { herdada_abertura: true } : {}),
    ...(f.incompletas ? { arvore_incompleta: true } : {}),
    ...(f.balanceamento ? { arvore_balanceamento: true } : {}),
    ...(f.aviso === "com" ? { dias_aviso: { gt: 0 } } : {}),
    ...(f.aviso === "sem" ? { dias_aviso: 0 } : {}),
    ...(termo
      ? {
          OR: [
            { codigo: termo },
            { descricao: { contains: termo, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

export async function carregarDiagnostico(
  filtros: FiltrosDiagnostico = {},
): Promise<DadosDiagnostico> {
  const pagina = Math.max(1, filtros.pagina ?? 1);
  const filtro = where(filtros);

  const [
    eventos,
    total,
    agregado,
    contagens,
    lacunas,
    bus,
    fornecedores,
    ultima,
  ] = await Promise.all([
      prisma.rupturaEvento.findMany({
        where: filtro,
        orderBy: [{ dias: "desc" }, { valor_perdido: "desc" }],
        skip: (pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
      }),
      prisma.rupturaEvento.count({ where: filtro }),
      prisma.rupturaEvento.aggregate({
        where: filtro,
        _sum: { dias: true, valor_perdido: true },
      }),
      contarPorCausa(filtros),
      contarLacunas(filtros),
      contarPorBu(filtros),
      listarFornecedores(),
      prisma.rupturaEvento.findFirst({
        where: { versao_regras: VERSAO_REGRAS },
        orderBy: { calculado_em: "desc" },
        select: { calculado_em: true },
      }),
    ]);

  const [herdadas, comAviso, comBalanceamento, avisoSim, avisoNao] =
    await Promise.all([
    prisma.rupturaEvento.count({
      where: { ...filtro, herdada_abertura: true },
    }),
    prisma.rupturaEvento.count({ where: { ...filtro, aviso_replay: true } }),
    // Contado **sem** o próprio filtro: o número no chip tem de antecipar o
    // resultado do clique, pela mesma razão dos chips de causa.
    prisma.rupturaEvento.count({
      where: { ...where({ ...filtros, balanceamento: undefined }), arvore_balanceamento: true },
    }),
    // Contados sem o próprio filtro, pela mesma razão dos chips de causa.
    prisma.rupturaEvento.count({
      where: { ...where({ ...filtros, aviso: undefined }), dias_aviso: { gt: 0 } },
    }),
    prisma.rupturaEvento.count({
      where: { ...where({ ...filtros, aviso: undefined }), dias_aviso: 0 },
    }),
  ]);

  return {
    linhas: eventos.map((e) => ({
      id: e.id,
      codigo: e.codigo,
      descricao: e.descricao,
      filial: e.filial,
      fornecedor: e.fornecedor,
      bu: e.bu,
      inicio: e.inicio.toISOString().slice(0, 10),
      dias: e.dias,
      valorPerdido: Number(e.valor_perdido),
      confianca: e.confianca,
      avisoReplay: e.aviso_replay,
      herdada: e.herdada_abertura,
      arvore: vereditoDe(e),
      resumo: (e.arvore_evidencias as Evidencia | null)?.resumo ?? null,
      balanceamento: e.arvore_balanceamento,
      diasAviso: e.dias_aviso,
    })),
    total,
    pagina,
    paginas: Math.max(1, Math.ceil(total / POR_PAGINA)),
    resumo: {
      eventos: total,
      dias: agregado._sum.dias ?? 0,
      valorPerdido: Number(agregado._sum.valor_perdido ?? 0),
      herdadas,
      comAviso,
      comBalanceamento,
      comAviso_: avisoSim,
      semAviso: avisoNao,
    },
    contagens,
    lacunas,
    bus,
    fornecedores,
    calculadoEm: ultima?.calculado_em ?? null,
  };
}

/**
 * Monta o veredito da árvore a partir das colunas do evento.
 *
 * Devolve nulo quando `arvore_causa` está vazia — eventos de uma rodada
 * anterior à árvore. A tela mostra "—" nesses casos em vez de inventar
 * "indefinida", que significa outra coisa: lá a árvore rodou e parou por falta
 * de dado.
 */
function vereditoDe(e: {
  arvore_causa: string | null;
  arvore_incompleta: boolean;
  arvore_no_travou: string | null;
}): VereditoArvore | null {
  if (!e.arvore_causa) return null;
  const cat = causaPorSlug(e.arvore_causa);
  return {
    slug: e.arvore_causa,
    rotulo: cat?.rotulo ?? e.arvore_causa,
    etapa: cat?.etapa ?? ("dados" as Etapa),
    dono: cat?.dono ?? "—",
    incompleta: e.arvore_incompleta,
    noTravou: e.arvore_no_travou,
  };
}

/**
 * Quantas posições cada causa explica, no recorte **sem o filtro de causa**.
 *
 * Sem essa exclusão, clicar num chip zeraria todos os outros e a tela deixaria
 * de dizer o que mais existe — o número no chip tem de antecipar o resultado
 * do clique, não refletir o clique já dado.
 *
 * Conta no próprio evento, pela coluna indexada. A versão anterior agrupava
 * uma tabela filha com várias causas por evento, e a soma das contagens
 * passava do total de posições sem ninguém entender por quê.
 */
async function contarPorCausa(
  filtros: FiltrosDiagnostico,
): Promise<ContagemCausa[]> {
  const linhas = await prisma.rupturaEvento.groupBy({
    by: ["arvore_causa"],
    where: {
      ...where({ ...filtros, causa: undefined }),
      arvore_causa: { not: null },
    },
    _count: { _all: true },
    _sum: { dias: true },
  });

  return linhas
    .map((l) => {
      const cat = causaPorSlug(l.arvore_causa!);
      return {
        slug: l.arvore_causa!,
        rotulo: cat?.rotulo ?? l.arvore_causa!,
        etapa: cat?.etapa ?? ("dados" as Etapa),
        eventos: l._count._all,
        dias: l._sum.dias ?? 0,
      };
    })
    // Por eventos, e não por dias: com uma causa por posição, "quantas
    // posições" é a pergunta da reunião. Os dias desempatam.
    .sort((a, b) => b.eventos - a.eventos || b.dias - a.dias);
}

/**
 * Quantas posições cada BU tem, no recorte **sem o filtro de BU**.
 *
 * Mesma razão dos chips de causa: o número no chip tem de antecipar o
 * resultado do clique, não refletir o clique já dado.
 */
async function contarPorBu(
  filtros: FiltrosDiagnostico,
): Promise<{ valor: string; eventos: number }[]> {
  const linhas = await prisma.rupturaEvento.groupBy({
    by: ["bu"],
    where: { ...where({ ...filtros, bu: undefined }), bu: { not: null } },
    _count: { _all: true },
  });

  return linhas
    .map((l) => ({ valor: l.bu!, eventos: l._count._all }))
    // Alfabética, e não por volume: a lista de BUs é curta e estável, e trocar
    // de ordem a cada filtro faria a pessoa procurar o botão toda vez.
    .sort((a, b) => a.valor.localeCompare(b.valor, "pt-BR"));
}

/** Onde a árvore travou, por nó, do mais frequente ao menos. */
async function contarLacunas(
  filtros: FiltrosDiagnostico,
): Promise<{ no: string; eventos: number }[]> {
  const linhas = await prisma.rupturaEvento.groupBy({
    by: ["arvore_no_travou"],
    where: {
      ...where({ ...filtros, incompletas: undefined }),
      arvore_no_travou: { not: null },
    },
    _count: { _all: true },
  });

  return linhas
    .map((l) => ({ no: l.arvore_no_travou!, eventos: l._count._all }))
    .sort((a, b) => b.eventos - a.eventos);
}


async function listarFornecedores(): Promise<string[]> {
  const linhas = await prisma.rupturaEvento.findMany({
    where: { versao_regras: VERSAO_REGRAS, fornecedor: { not: null } },
    distinct: ["fornecedor"],
    select: { fornecedor: true },
    orderBy: { fornecedor: "asc" },
  });
  return linhas.map((l) => l.fornecedor!).filter(Boolean);
}

/** Um passo do percurso da árvore, como a tela mostra. */
export type PassoTrilha = {
  no: string;
  pergunta: string;
  /** Nulo quando a pergunta ficou sem dado — e foi aí que o percurso parou. */
  resposta: boolean | null;
  evidencia?: Record<string, unknown>;
};

/** O detalhe de um evento: o percurso da árvore e a prova da causa. */
export type DetalheRuptura = LinhaRuptura & {
  aberturaData: string | null;
  aberturaOrigem: string | null;
  /**
   * O percurso da árvore, pergunta por pergunta.
   *
   * É a parte da tela que dispensa confiança no motor: a pessoa segue as
   * respostas e confere o veredito sozinha, com os números que cada pergunta
   * olhou.
   */
  trilha: PassoTrilha[];
  /** A prova da causa: a frase, os números, a prescrição e os doadores. */
  evidencia: Evidencia | null;
};

export async function carregarDetalhe(
  id: number,
): Promise<DetalheRuptura | null> {
  const e = await prisma.rupturaEvento.findUnique({ where: { id } });
  if (!e) return null;

  const evidencia = (e.arvore_evidencias as Evidencia | null) ?? null;

  return {
    id: e.id,
    codigo: e.codigo,
    descricao: e.descricao,
    filial: e.filial,
    fornecedor: e.fornecedor,
    bu: e.bu,
    inicio: e.inicio.toISOString().slice(0, 10),
    dias: e.dias,
    valorPerdido: Number(e.valor_perdido),
    confianca: e.confianca,
    avisoReplay: e.aviso_replay,
    herdada: e.herdada_abertura,
    aberturaData: e.abertura_data?.toISOString().slice(0, 10) ?? null,
    aberturaOrigem: e.abertura_origem,
    arvore: vereditoDe(e),
    resumo: evidencia?.resumo ?? null,
    balanceamento: e.arvore_balanceamento,
    diasAviso: e.dias_aviso,
    trilha: (e.arvore_trilha as PassoTrilha[] | null) ?? [],
    evidencia,
  };
}
