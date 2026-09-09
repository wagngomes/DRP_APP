import { prisma } from "@/lib/prisma";
import {
  chaveSla,
  projetar,
  type Projecao,
} from "@/utils/projecao-transferencias";
import { cdVirtualDe, rotuloCdVirtual } from "@/utils/cds-virtuais";
import { memoizar } from "@/lib/cache-referencia";

export type LinhaTransferencia = {
  id: number;
  numero_nf_saida: string | null;
  codigo: string | null;
  descricao_produto: string | null;
  qtde: number | null;
  filial_codigo_saida: string | null;
  filial_codigo_entrada: string | null;
  rota: string | null;
  passo: number | null;
  qtde_passo: number | null;
  data_emissao: Date | null;
};

export type TransferenciaProjetada = LinhaTransferencia & {
  projecao: Projecao;
};

/**
 * SLA entre filiais, já resolvido para um único número por par.
 *
 * MAT e MED têm tempos diferentes e a base de transferências não permite dizer
 * qual se aplica (o `tipo_produto` é sempre "PA"), então fica o maior dos dois
 * — projeção conservadora, nunca otimista.
 *
 * Pares inativos entram apenas quando não existe versão ativa: sem SLA não há
 * projeção alguma, o que é pior do que um tempo possivelmente desatualizado.
 */
export async function carregarSla(): Promise<Map<string, number>> {
  return memoizar("sla", carregarSlaDoBanco);
}

async function carregarSlaDoBanco(): Promise<Map<string, number>> {
  const linhas = await prisma.$queryRawUnsafe<
    { filial_orig: string; filial_dest: string; tt: number }[]
  >(
    `SELECT filial_orig, filial_dest,
            COALESCE(
              MAX(transit_time) FILTER (WHERE ativo::numeric = 1),
              MAX(transit_time)
            )::float8 AS tt
       FROM sla_transferencias
      WHERE filial_orig IS NOT NULL AND filial_dest IS NOT NULL
      GROUP BY filial_orig, filial_dest`
  );

  const mapa = new Map<string, number>();
  for (const l of linhas) {
    if (l.tt !== null) mapa.set(chaveSla(l.filial_orig, l.filial_dest), l.tt);
  }
  return mapa;
}

/** sigla (maiúscula) -> código, a partir do cadastro de filiais. */
export async function carregarFiliais(): Promise<Map<string, string>> {
  return memoizar("filiais", carregarFiliaisDoBanco);
}

async function carregarFiliaisDoBanco(): Promise<Map<string, string>> {
  const linhas = await prisma.filiais.findMany({
    select: { codigo: true, sigla: true },
  });
  const mapa = new Map<string, string>();
  for (const l of linhas) {
    if (l.sigla) mapa.set(l.sigla.trim().toUpperCase(), l.codigo);
  }
  return mapa;
}

/**
 * Descrições das filiais para exibição (código -> sigla).
 *
 * Os CDs virtuais (prefixo "90") não existem no cadastro — o rótulo deles é
 * derivado do CD físico correspondente, para um código novo aparecer legível
 * sem ninguém precisar cadastrá-lo.
 */
export async function carregarRotulosFiliais(): Promise<Map<string, string>> {
  return memoizar("rotulos-filiais", carregarRotulosDoBanco);
}

async function carregarRotulosDoBanco(): Promise<Map<string, string>> {
  const linhas = await prisma.filiais.findMany({
    select: { codigo: true, sigla: true, descricao: true },
  });
  const mapa = new Map<string, string>();
  for (const l of linhas) {
    mapa.set(l.codigo, l.sigla ?? l.descricao ?? l.codigo);
  }
  for (const [codigo, rotulo] of [...mapa]) {
    const virtual = cdVirtualDe(codigo);
    if (!mapa.has(virtual)) mapa.set(virtual, rotuloCdVirtual(rotulo));
  }
  return mapa;
}

export type OpcoesProjecao = {
  /** Data de referência do sistema (yyyy-mm-dd). */
  data: string;
  /** Dias úteis a partir da referência para transferências já vencidas. */
  diasParaVencidas: number;
  /** Filtra pelo CD final calculado. */
  cdFinal?: string;
};

/**
 * Carrega as transferências em aberto e projeta a chegada de cada uma.
 *
 * A projeção roda em TypeScript e não em SQL porque percorrer as pernas somando
 * dias úteis é iterativo — em SQL exigiria CTE recursiva, ficaria difícil de ler
 * e o prazo das vencidas, que é entrada do usuário, mudaria a consulta inteira.
 * O volume permite: ~1.000 transferências com até 4 pernas.
 *
 * A tabela é cumulativa: sem o filtro de snapshot, transferências de dias
 * anteriores — já entregues — seguiriam contando como em aberto.
 */
export async function projetarTransferencias(
  opcoes: OpcoesProjecao
): Promise<TransferenciaProjetada[]> {
  const [linhas, sla, siglaParaCodigo] = await Promise.all([
    prisma.$queryRawUnsafe<LinhaTransferencia[]>(
      `SELECT id, numero_nf_saida, codigo, descricao_produto,
              qtde::float8 AS qtde,
              filial_codigo_saida, filial_codigo_entrada, rota,
              passo::int AS passo, qtde_passo::int AS qtde_passo,
              data_emissao
         FROM transferencias_abertas
        WHERE data_snapshot = $1::date
        ORDER BY data_emissao, id`,
      opcoes.data
    ),
    carregarSla(),
    carregarFiliais(),
  ]);

  const dataReferencia = new Date(`${opcoes.data}T00:00:00.000Z`);

  const projetadas = linhas.map((linha) => ({
    ...linha,
    projecao: projetar({
      rota: linha.rota,
      filialSaida: linha.filial_codigo_saida,
      filialEntrada: linha.filial_codigo_entrada,
      passo: linha.passo,
      dataEmissao: linha.data_emissao,
      siglaParaCodigo,
      sla,
      dataReferencia,
      diasParaVencidas: opcoes.diasParaVencidas,
    }),
  }));

  return opcoes.cdFinal
    ? projetadas.filter((t) => t.projecao.cdFinal === opcoes.cdFinal)
    : projetadas;
}
