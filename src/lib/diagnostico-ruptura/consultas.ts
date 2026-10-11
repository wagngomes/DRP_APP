/**
 * Leitura da tela de diagnóstico.
 *
 * Lê só as tabelas do próprio motor, que já têm o resultado calculado. É a
 * consulta mais barata do sistema — nenhum join com as bases, nenhuma conta
 * em tempo de request. O trabalho pesado aconteceu na rodada.
 */
import { prisma } from "@/lib/prisma";
import { causaPorSlug, type Etapa } from "./catalogo";
import { VERSAO_REGRAS } from "./parametros";

export type FiltrosDiagnostico = {
  /** Código exato ou trecho da descrição. */
  produto?: string;
  fornecedor?: string;
  /** Slug do catálogo. */
  causa?: string;
  /** Só as rupturas que a abertura do mês já tinha contratado. */
  herdadas?: boolean;
  pagina?: number;
};

export type CausaNaLinha = {
  slug: string;
  rotulo: string;
  etapa: Etapa;
  dono: string;
  dias: number;
  percentual: number;
  papel: string;
};

export type LinhaRuptura = {
  id: number;
  codigo: string;
  descricao: string | null;
  filial: string;
  fornecedor: string | null;
  inicio: string;
  dias: number;
  valorPerdido: number;
  confianca: string;
  avisoReplay: boolean;
  herdada: boolean;
  causas: CausaNaLinha[];
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
  };
  contagens: ContagemCausa[];
  fornecedores: string[];
  /** Quando a última rodada foi calculada; nulo se nunca rodou. */
  calculadoEm: Date | null;
};

/**
 * Monta o `where` do Prisma a partir dos filtros da tela.
 *
 * O filtro por causa usa `some` sobre as causas do evento e exige
 * `papel = "causa"`: filtrar por observação traria eventos em que a regra
 * falhou sem ter causado nada, que é o oposto do que o chip promete.
 */
function where(f: FiltrosDiagnostico) {
  const termo = f.produto?.trim();
  return {
    versao_regras: VERSAO_REGRAS,
    ...(f.fornecedor ? { fornecedor: f.fornecedor } : {}),
    ...(f.herdadas ? { herdada_abertura: true } : {}),
    ...(f.causa
      ? { causas: { some: { causa: f.causa, papel: "causa" } } }
      : {}),
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

  const [eventos, total, agregado, contagens, fornecedores, ultima] =
    await Promise.all([
      prisma.rupturaEvento.findMany({
        where: filtro,
        orderBy: [{ dias: "desc" }, { valor_perdido: "desc" }],
        skip: (pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
        include: { causas: { orderBy: { dias: "desc" } } },
      }),
      prisma.rupturaEvento.count({ where: filtro }),
      prisma.rupturaEvento.aggregate({
        where: filtro,
        _sum: { dias: true, valor_perdido: true },
      }),
      contarPorCausa(filtros),
      listarFornecedores(),
      prisma.rupturaEvento.findFirst({
        where: { versao_regras: VERSAO_REGRAS },
        orderBy: { calculado_em: "desc" },
        select: { calculado_em: true },
      }),
    ]);

  const [herdadas, comAviso] = await Promise.all([
    prisma.rupturaEvento.count({
      where: { ...filtro, herdada_abertura: true },
    }),
    prisma.rupturaEvento.count({ where: { ...filtro, aviso_replay: true } }),
  ]);

  return {
    linhas: eventos.map((e) => ({
      id: e.id,
      codigo: e.codigo,
      descricao: e.descricao,
      filial: e.filial,
      fornecedor: e.fornecedor,
      inicio: e.inicio.toISOString().slice(0, 10),
      dias: e.dias,
      valorPerdido: Number(e.valor_perdido),
      confianca: e.confianca,
      avisoReplay: e.aviso_replay,
      herdada: e.herdada_abertura,
      causas: e.causas.map((c) => {
        const cat = causaPorSlug(c.causa);
        return {
          slug: c.causa,
          rotulo: cat?.rotulo ?? c.causa,
          etapa: cat?.etapa ?? "dados",
          dono: cat?.dono ?? "—",
          dias: Number(c.dias),
          percentual: Number(c.percentual),
          papel: c.papel,
        };
      }),
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
    },
    contagens,
    fornecedores,
    calculadoEm: ultima?.calculado_em ?? null,
  };
}

/**
 * Quantos eventos cada causa explica, dentro do recorte **sem o filtro de
 * causa**.
 *
 * Sem essa exclusão, clicar num chip zeraria todos os outros e a tela deixaria
 * de dizer o que mais existe — o número no chip tem de antecipar o resultado
 * do clique, não refletir o clique já dado.
 */
async function contarPorCausa(
  filtros: FiltrosDiagnostico,
): Promise<ContagemCausa[]> {
  const filtro = where({ ...filtros, causa: undefined });

  const linhas = await prisma.rupturaCausa.groupBy({
    by: ["causa"],
    where: { papel: "causa", evento: filtro },
    _count: { _all: true },
    _sum: { dias: true },
  });

  return linhas
    .map((l) => {
      const cat = causaPorSlug(l.causa);
      return {
        slug: l.causa,
        rotulo: cat?.rotulo ?? l.causa,
        etapa: cat?.etapa ?? ("dados" as Etapa),
        eventos: l._count._all,
        dias: Number(l._sum.dias ?? 0),
      };
    })
    .sort((a, b) => b.dias - a.dias);
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

/** O detalhe de um evento, com as evidências de cada causa. */
export type DetalheRuptura = LinhaRuptura & {
  diasExplicados: number;
  aberturaData: string | null;
  aberturaOrigem: string | null;
  evidencias: { slug: string; dados: unknown }[];
};

export async function carregarDetalhe(
  id: number,
): Promise<DetalheRuptura | null> {
  const e = await prisma.rupturaEvento.findUnique({
    where: { id },
    include: { causas: { orderBy: { dias: "desc" } } },
  });
  if (!e) return null;

  return {
    id: e.id,
    codigo: e.codigo,
    descricao: e.descricao,
    filial: e.filial,
    fornecedor: e.fornecedor,
    inicio: e.inicio.toISOString().slice(0, 10),
    dias: e.dias,
    valorPerdido: Number(e.valor_perdido),
    confianca: e.confianca,
    avisoReplay: e.aviso_replay,
    herdada: e.herdada_abertura,
    diasExplicados: Number(e.dias_explicados),
    aberturaData: e.abertura_data?.toISOString().slice(0, 10) ?? null,
    aberturaOrigem: e.abertura_origem,
    causas: e.causas.map((c) => {
      const cat = causaPorSlug(c.causa);
      return {
        slug: c.causa,
        rotulo: cat?.rotulo ?? c.causa,
        etapa: cat?.etapa ?? ("dados" as Etapa),
        dono: cat?.dono ?? "—",
        dias: Number(c.dias),
        percentual: Number(c.percentual),
        papel: c.papel,
      };
    }),
    evidencias: e.causas.map((c) => ({ slug: c.causa, dados: c.evidencias })),
  };
}
