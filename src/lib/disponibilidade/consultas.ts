import { prisma } from "@/lib/prisma";
import { joinFornecedor, nomeFornecedor } from "@/lib/fornecedor";
export { FILIAL_CIA } from "@/lib/disponibilidade/constantes";
import {
  COLUNAS_ESTOQUE_CHAO,
  COLUNAS_ESTOQUE_TOTAL,
  DIAS_NO_MES,
  faixaSql,
  somaSql,
  torreValidaSql,
  type FaixaId,
  snapshotMensalSql,
} from "@/utils/dias-estoque";
import { simuladorPorCd } from "@/utils/cds-virtuais";

const EST_CHAO = somaSql(COLUNAS_ESTOQUE_CHAO, "s");
const EST_TOTAL = somaSql(COLUNAS_ESTOQUE_TOTAL, "s");
const DIAS_CHAO = `(COALESCE(${EST_CHAO},0) / (f.forecast_m0 / ${DIAS_NO_MES}.0))`;
const DIAS_TOTAL = `(COALESCE(${EST_TOTAL},0) / (f.forecast_m0 / ${DIAS_NO_MES}.0))`;

/**
 * Base comum: itens válidos do forecast do mês, com o estoque do dia de
 * referência ao lado.
 *
 * LEFT JOIN de propósito — 334 itens válidos não têm linha no simulador do dia.
 * COALESCE joga esses para estoque zero, que é a leitura correta: sem posição,
 * sem cobertura.
 *
 * A origem é `simuladorPorCd()` e não a tabela crua: sem isso os CDs "90" nunca
 * casariam com o forecast e todo item deles apareceria rompido.
 */
function baseSql(comFornecedor: boolean): string {
  return `
    FROM forecast f
    LEFT JOIN ${simuladorPorCd("s.data_snapshot = $1::date")} s
      ON s.codigo = f.codigo AND s.filial = f.filial
     AND s.data_snapshot = $1::date
    ${joinFornecedor("s")}
   WHERE f.data_snapshot >= $2::date
     AND f.data_snapshot <  $3::date
     AND ${snapshotMensalSql("forecast", "f", "$1")}
     AND f.forecast_m0 > 0
     AND ${torreValidaSql("f")}
     AND f.filial IS NOT NULL
     ${comFornecedor ? `AND ${nomeFornecedor("s")} = $4` : ""}`;
}

export type ContagemFaixa = {
  filial: string;
  faixa: FaixaId;
  /** Classificação ABC vinda do forecast; "—" quando o item não tem curva. */
  curva: string;
  /** Unidade de negócio; "—" quando o item não tem BU definida. */
  bu: string;
  /** Analista responsável; "—" quando o item não tem analista atribuído. */
  analista: string;
  itens: number;
};

export type ItemDisponibilidade = {
  codigo: string;
  filial: string;
  forecast: number;
  estoqueChao: number;
  estoqueTotal: number;
  diasChao: number;
  diasTotal: number;
};

/** Limites do mês da data de referência (forecast tem escopo mensal). */
function limitesDoMes(data: string): [string, string] {
  const [ano, mes] = data.split("-").map(Number);
  return [
    new Date(Date.UTC(ano, mes - 1, 1)).toISOString().slice(0, 10),
    new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10),
  ];
}

export async function contarPorFaixa(
  data: string,
  fornecedor?: string
): Promise<ContagemFaixa[]> {
  const [inicio, fim] = limitesDoMes(data);
  const args: unknown[] = [data, inicio, fim];
  if (fornecedor) args.push(fornecedor);

  return prisma.$queryRawUnsafe<ContagemFaixa[]>(
    `SELECT f.filial,
            ${faixaSql(DIAS_CHAO)} AS faixa,
            COALESCE(NULLIF(upper(trim(f.curva)), ''), '—') AS curva,
            COALESCE(NULLIF(trim(f.b_u), ''), '—') AS bu,
            COALESCE(NULLIF(trim(f.analista), ''), '—') AS analista,
            COUNT(*)::int AS itens
       ${baseSql(Boolean(fornecedor))}
      GROUP BY f.filial, 2, 3, 4, 5
      ORDER BY f.filial`,
    ...args
  );
}

/** Itens de um recorte (CD + faixa), para a tabela que abre ao clicar na barra. */
export async function listarItens(
  data: string,
  filial: string,
  faixa: FaixaId,
  fornecedor?: string,
  curva?: string,
  bu?: string,
  analista?: string,
  limite = 500
): Promise<ItemDisponibilidade[]> {
  const [inicio, fim] = limitesDoMes(data);
  const args: unknown[] = [data, inicio, fim];
  if (fornecedor) args.push(fornecedor);
  const posFilial = args.length + 1;
  args.push(filial, faixa);
  const posCurva = args.length + 1;
  if (curva) args.push(curva);
  const posBu = args.length + 1;
  if (bu) args.push(bu);
  const posAnalista = args.length + 1;
  if (analista) args.push(analista);

  return prisma.$queryRawUnsafe<ItemDisponibilidade[]>(
    `SELECT f.codigo,
            f.filial,
            (f.forecast_m0)::float8            AS "forecast",
            (COALESCE(${EST_CHAO},0))::float8  AS "estoqueChao",
            (COALESCE(${EST_TOTAL},0))::float8 AS "estoqueTotal",
            (${DIAS_CHAO})::float8             AS "diasChao",
            (${DIAS_TOTAL})::float8            AS "diasTotal"
       ${baseSql(Boolean(fornecedor))}
        AND f.filial = $${posFilial}
        AND ${faixaSql(DIAS_CHAO)} = $${posFilial + 1}
        ${curva ? `AND COALESCE(NULLIF(upper(trim(f.curva)), ''), '—') = $${posCurva}` : ""}
        ${bu ? `AND COALESCE(NULLIF(trim(f.b_u), ''), '—') = $${posBu}` : ""}
        ${analista ? `AND COALESCE(NULLIF(trim(f.analista), ''), '—') = $${posAnalista}` : ""}
      ORDER BY ${DIAS_CHAO} ASC, f.codigo
      LIMIT ${limite}`,
    ...args
  );
}

/** Laboratórios disponíveis, para o filtro da página. */
export async function listarFornecedores(data: string): Promise<string[]> {
  const linhas = await prisma.$queryRawUnsafe<{ fornecedor: string }[]>(
    `SELECT DISTINCT ${nomeFornecedor("s")} AS fornecedor
       FROM simulador s ${joinFornecedor("s")}
      WHERE s.fornecedor IS NOT NULL AND s.data_snapshot = $1::date
      ORDER BY 1`,
    data
  );
  return linhas.map((l) => l.fornecedor);
}

/**
 * Visão Cia: o somatório das posições item × CD de todos os CDs.
 *
 * Cada posição mantém a faixa que tem no seu próprio CD — a barra apenas
 * empilha todas juntas em vez de abrir por filial. Um produto rompido em três
 * CDs conta três vezes na faixa preta, exatamente como conta nas três barras
 * daqueles CDs.
 *
 * Ou seja, é a mesma consulta das barras por CD sem o agrupamento por filial:
 * o total da barra Cia é igual à soma dos totais das demais.
 */
export type ContagemCia = {
  curva: string;
  bu: string;
  analista: string;
  faixa: FaixaId;
  itens: number;
};

export async function contarCia(data: string, fornecedor?: string): Promise<ContagemCia[]> {
  const [inicio, fim] = limitesDoMes(data);
  const args: unknown[] = [data, inicio, fim];
  if (fornecedor) args.push(fornecedor);

  return prisma.$queryRawUnsafe<ContagemCia[]>(
    `SELECT ${faixaSql(DIAS_CHAO)} AS faixa,
            COALESCE(NULLIF(upper(trim(f.curva)), ''), '—') AS curva,
            COALESCE(NULLIF(trim(f.b_u), ''), '—') AS bu,
            COALESCE(NULLIF(trim(f.analista), ''), '—') AS analista,
            COUNT(*)::int AS itens
       ${baseSql(Boolean(fornecedor))}
      GROUP BY 1, 2, 3, 4`,
    ...args
  );
}

/**
 * Posições de um recorte da visão Cia: os mesmos itens que apareceriam ao
 * clicar naquela faixa em cada CD, reunidos numa lista só. A filial vem junto
 * porque a posição é item × CD, e o mesmo código pode aparecer mais de uma vez.
 */
export async function listarItensCia(
  data: string,
  faixa: FaixaId,
  fornecedor?: string,
  curva?: string,
  bu?: string,
  analista?: string,
  limite = 500
): Promise<ItemDisponibilidade[]> {
  const [inicio, fim] = limitesDoMes(data);
  const args: unknown[] = [data, inicio, fim];
  if (fornecedor) args.push(fornecedor);
  const posFaixa = args.length + 1;
  args.push(faixa);
  const posCurva = args.length + 1;
  if (curva) args.push(curva);
  const posBu = args.length + 1;
  if (bu) args.push(bu);
  const posAnalista = args.length + 1;
  if (analista) args.push(analista);

  return prisma.$queryRawUnsafe<ItemDisponibilidade[]>(
    `SELECT f.codigo,
            f.filial,
            (f.forecast_m0)::float8            AS "forecast",
            (COALESCE(${EST_CHAO},0))::float8  AS "estoqueChao",
            (COALESCE(${EST_TOTAL},0))::float8 AS "estoqueTotal",
            (${DIAS_CHAO})::float8             AS "diasChao",
            (${DIAS_TOTAL})::float8            AS "diasTotal"
       ${baseSql(Boolean(fornecedor))}
        AND ${faixaSql(DIAS_CHAO)} = $${posFaixa}
        ${curva ? `AND COALESCE(NULLIF(upper(trim(f.curva)), ''), '—') = $${posCurva}` : ""}
        ${bu ? `AND COALESCE(NULLIF(trim(f.b_u), ''), '—') = $${posBu}` : ""}
        ${analista ? `AND COALESCE(NULLIF(trim(f.analista), ''), '—') = $${posAnalista}` : ""}
      ORDER BY ${DIAS_CHAO} ASC, f.codigo, f.filial
      LIMIT ${limite}`,
    ...args
  );
}
