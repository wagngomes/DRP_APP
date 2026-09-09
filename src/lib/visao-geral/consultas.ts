import { prisma } from "@/lib/prisma";
import { joinFornecedor, nomeFornecedor } from "@/lib/fornecedor";
import { simuladorPorCd } from "@/utils/cds-virtuais";
import { snapshotMensalSql } from "@/utils/dias-estoque";

/**
 * Somatórios do simulador conforme a Task_05. Todas as métricas são
 * quantidade × custo unitário. COALESCE em cada parcela para que um armazém
 * vazio não anule a linha inteira.
 */
const QTD_ESTOQUE = `(COALESCE(est_arm_01,0)+COALESCE(est_arm_11,0)+COALESCE(est_arm_26,0)
                    +COALESCE(est_arm_nac,0)+COALESCE(est_arm_q40,0)+COALESCE(est_arm_rc,0))`;
const QTD_VENDIDO = `(COALESCE(vendido_m0_arm_01,0)+COALESCE(vendido_m0_arm_26,0)
                    +COALESCE(vendido_m0_arm_11,0)+COALESCE(vendido_m0_arm_tr,0))`;
const QTD_COMPRAS = `(COALESCE(compras_arm_01,0)+COALESCE(compras_arm_26,0)+COALESCE(compras_arm_nac,0))`;
const QTD_TRANSF = `COALESCE(total_trans,0)`;
/**
 * Custo unitário para valorizar quantidades.
 *
 * Usa `cmv_unitario` e não `cmv_unitario_1`: a segunda é a versão preenchida da
 * primeira e injeta R$ 1.557,03 como padrão onde não há custo real — 2.412
 * linhas, 1.398 produtos. Como nenhuma linha com estoque tem custo nulo, o
 * estoque dava o mesmo pelos dois caminhos, mas compras e transferências de
 * itens sem posição inflavam (compras iam a R$ 1,41 bi em vez de R$ 287 mi).
 * Com `cmv_unitario` o total bate com as colunas que a própria origem calcula
 * (`estoque_cmv` e `valor_pedido_aberto_cmv`).
 */
const CMV = `COALESCE(cmv_unitario,0)`;

/** Tributação sem cadastro fiscal — vira fatia própria em vez de sumir. */
const SEM_FISCAL = "Sem classificação fiscal";
/**
 * Chave de agrupamento da tributação. A base traz o mesmo valor escrito de
 * formas diferentes ("Nacional 7%" e "nacional 7%"), então o agrupamento é
 * pela versão normalizada e o rótulo exibido vem de MIN() (variante
 * capitalizada). A mesma chave é usada nas rotas, para as duas consultas
 * casarem na tela.
 */
const CHAVE_TRIB = `lower(trim(COALESCE(f.tributacao, '${SEM_FISCAL}')))`;

export type TotaisCd = {
  filial: string;
  estoque: number;
  vendido: number;
  compras: number;
  transferencias: number;
  itens: number;
};

export type FatiaFiscal = {
  filial: string;
  chave: string;
  tributacao: string;
  valor: number;
};

export type RotaAbastecimento = {
  filial: string;
  chave: string;
  rota: string;
  valor: number;
  itens: number;
};

export type DadosVisaoGeral = {
  data: string;
  datasDisponiveis: string[];
  fornecedores: string[];
  totaisPorCd: TotaisCd[];
  perfilFiscal: FatiaFiscal[];
  rotas: RotaAbastecimento[];
};

/** Filtro de laboratório pelo nome normalizado, em todas as consultas da página. */
function filtroFornecedor(fornecedor: string | undefined, alias: string): string {
  return fornecedor ? `AND ${nomeFornecedor(alias)} = $2` : "";
}

export async function carregarVisaoGeral(
  data: string,
  fornecedor?: string
): Promise<DadosVisaoGeral> {
  // O mês da data de referência recorta o forecast (escopo "month"), enquanto
  // o simulador é do dia — mesma regra do resto do sistema.
  const [ano, mes] = data.split("-").map(Number);
  const inicioMes = new Date(Date.UTC(ano, mes - 1, 1)).toISOString().slice(0, 10);
  const proximoMes = new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10);

  const args = fornecedor ? [data, fornecedor] : [data];

  // Consultas independentes em paralelo: o custo aqui é round-trip de rede
  // até o Postgres, não processamento — serializá-las multiplicaria a espera.
  const [datasLinhas, fornecedoresLinhas, totaisPorCd, perfilFiscal, rotas] = await Promise.all([
    prisma.$queryRawUnsafe<{ d: Date }[]>(
      `SELECT DISTINCT data_snapshot AS d FROM simulador ORDER BY d DESC`
    ),
    prisma.$queryRawUnsafe<{ fornecedor: string }[]>(
      /* Tabela crua: a divisão por CD virtual não muda o conjunto de
         fornecedores, e a lista sai mais barata sem o UNION. */
      `SELECT DISTINCT ${nomeFornecedor("s")} AS fornecedor
         FROM simulador s ${joinFornecedor("s")}
        WHERE s.fornecedor IS NOT NULL AND s.data_snapshot = $1::date
        ORDER BY 1`,
      data
    ),
    prisma.$queryRawUnsafe<TotaisCd[]>(
      `SELECT filial,
              (SUM(${QTD_ESTOQUE} * ${CMV}))::float8 AS estoque,
              (SUM(${QTD_VENDIDO} * ${CMV}))::float8 AS vendido,
              (SUM(${QTD_COMPRAS} * ${CMV}))::float8 AS compras,
              (SUM(${QTD_TRANSF} * ${CMV}))::float8  AS transferencias,
              COUNT(*)::int                          AS itens
         FROM ${simuladorPorCd("s.data_snapshot = $1::date")} s ${joinFornecedor("s")}
        WHERE data_snapshot = $1::date AND filial IS NOT NULL
              ${filtroFornecedor(fornecedor, "s")}
        GROUP BY filial
        ORDER BY estoque DESC`,
      ...args
    ),
    // Cruza o código do simulador com a guia fiscal. `fiscal.codigo` é único,
    // então o LEFT JOIN não multiplica valores.
    prisma.$queryRawUnsafe<FatiaFiscal[]>(
      `SELECT s.filial,
              ${CHAVE_TRIB} AS chave,
              MIN(COALESCE(f.tributacao, '${SEM_FISCAL}')) AS tributacao,
              (SUM(${QTD_ESTOQUE} * ${CMV}))::float8 AS valor
         FROM ${simuladorPorCd("s.data_snapshot = $1::date")} s ${joinFornecedor("s")}
         LEFT JOIN fiscal f ON f.codigo = s.codigo
        WHERE s.data_snapshot = $1::date AND s.filial IS NOT NULL
              ${filtroFornecedor(fornecedor, "s")}
        GROUP BY s.filial, ${CHAVE_TRIB}
       HAVING SUM(${QTD_ESTOQUE} * ${CMV}) <> 0
        ORDER BY s.filial, valor DESC`,
      ...args
    ),
    // Rotas que abastecem cada tributação dentro do CD. A rota vive por item e
    // filial no forecast — (codigo, filial) é único lá, então o join também não
    // multiplica. INNER JOIN de propósito: item sem forecast não tem rota a
    // exibir, e a diferença aparece como "sem rota definida" na tela.
    prisma.$queryRawUnsafe<RotaAbastecimento[]>(
      `SELECT s.filial,
              ${CHAVE_TRIB} AS chave,
              fo.rota_compra AS rota,
              (SUM(${QTD_ESTOQUE} * ${CMV}))::float8 AS valor,
              COUNT(*)::int AS itens
         FROM ${simuladorPorCd("s.data_snapshot = $1::date")} s ${joinFornecedor("s")}
         LEFT JOIN fiscal f ON f.codigo = s.codigo
         JOIN forecast fo
           ON fo.codigo = s.codigo AND fo.filial = s.filial
          AND fo.data_snapshot >= '${inicioMes}'::date
          AND fo.data_snapshot <  '${proximoMes}'::date
          AND ${snapshotMensalSql("forecast", "fo", "$1")}
        WHERE s.data_snapshot = $1::date AND s.filial IS NOT NULL
              AND fo.rota_compra IS NOT NULL
              ${filtroFornecedor(fornecedor, "s")}
        GROUP BY s.filial, ${CHAVE_TRIB}, fo.rota_compra
        ORDER BY s.filial, valor DESC`,
      ...args
    ),
  ]);

  return {
    data,
    datasDisponiveis: datasLinhas.map((l) => l.d.toISOString().slice(0, 10)),
    fornecedores: fornecedoresLinhas.map((l) => l.fornecedor),
    totaisPorCd,
    perfilFiscal,
    rotas,
  };
}
