import { prisma } from "@/lib/prisma";
import { joinFornecedor, nomeFornecedor } from "@/lib/fornecedor";
import {
  COLUNAS_ESTOQUE_CHAO,
  COLUNAS_VENDIDO_M0,
  DIAS_NO_MES,
  faixaSql,
  somaSql,
  torreValidaSql,
  type FaixaId,
  snapshotMensalSql,
} from "@/utils/dias-estoque";
import { simuladorPorCd } from "@/utils/cds-virtuais";
import { carregarChegadas, chaveChegada } from "@/lib/reposicoes/chegadas";
import { carregarSaldoPlano } from "@/lib/compras/saldo-plano";
import {
  VAZIO,
  type Categoria,
  type OrigemFornecedor,
  type PosicaoRompida,
} from "./agregacao";
import { limitesDoMes } from "@/utils/mes";

const EST_CHAO = somaSql(COLUNAS_ESTOQUE_CHAO, "s");
// Mesmas linhas do simulador que já trazem o estoque — nenhum join a mais.
const VENDIDO = somaSql(COLUNAS_VENDIDO_M0, "s");
const DIAS_CHAO = `(COALESCE(${EST_CHAO},0) / (f.forecast_m0 / ${DIAS_NO_MES}.0))`;

/**
 * De onde saiu o nome do fornecedor de um item.
 *
 * A tela mostra isso num badge porque as três origens não têm a mesma
 * procedência. Marca não é fornecedor: medido nos 4.322 itens que têm as duas
 * informações, elas coincidem em 91% — nos outros 9% a diferença é real, e vem
 * de quem distribui o quê (`ACHE` vende `LABOFARMA`), de aquisição de empresa
 * (`WYETH` virou `PFIZER`) ou de granularidade (`NESTLE SPO (NUTRICAO)` contra
 * `NESTLE`). Um item recuperado pela marca pode portanto cair numa linha
 * vizinha à dos seus irmãos, e quem lê precisa saber disso.
 */
export type { OrigemFornecedor } from "./agregacao";

/**
 * Nome do fornecedor por item, com as quedas em cascata.
 *
 * O simulador é a fonte boa e responde por 99,5% dos itens. Os 0,5% restantes
 * não têm nenhuma linha com fornecedor no snapshot e apareciam como "Sem
 * fornecedor" — some do agrupamento quem na verdade tem dono conhecido.
 * `produtos.marca` e, depois, `produtos.d_grp_marca` cobrem esses casos: em
 * todos eles o nome existe e casa na tabela `fornecedores`.
 *
 * Marca antes de grupo por ser o mais específico. Nos órfãos medidos os dois
 * convergem — inclusive onde a marca é `BLAU FARMACEUTICA` e o grupo é
 * `BLAUSIEGEL`, que normalizam para o mesmo `BLAU`.
 *
 * As três passam pela tabela `fornecedores`: é o mesmo nome normalizado que o
 * resto do sistema usa, e sem isso a tela ganharia linhas novas escritas de
 * outro jeito em vez de somar nas que já existem.
 *
 * CTE, e não subconsulta correlacionada como antes: aquela rodava uma vez por
 * linha do forecast. Medido, 567ms contra 302ms.
 */
const FORNECEDOR_POR_ITEM = `
  SELECT DISTINCT ON (s.codigo) s.codigo,
         ${nomeFornecedor("s")} AS nome,
         'simulador' AS origem
    FROM simulador s ${joinFornecedor("s")}
   WHERE s.data_snapshot = $1::date AND s.fornecedor IS NOT NULL
   -- Desempate pelo nome: hoje nenhum item tem dois fornecedores normalizados
   -- diferentes no mesmo snapshot, então qualquer linha serve. Se um dia tiver,
   -- é melhor a tela escolher sempre o mesmo do que alternar entre cargas.
   ORDER BY s.codigo, ${nomeFornecedor("s")}`;

/** A queda para o cadastro do produto, quando o simulador não sabe. */
const FORNECEDOR_POR_MARCA = `
  SELECT pr.codigo,
         COALESCE(
           NULLIF(trim(fm.fornecedor_normalizado), ''),
           NULLIF(trim(fg.fornecedor_normalizado), ''),
           NULLIF(trim(pr.marca), ''),
           NULLIF(trim(pr.d_grp_marca), '')
         ) AS nome,
         CASE
           WHEN NULLIF(trim(pr.marca), '') IS NOT NULL THEN 'marca'
           ELSE 'grupo'
         END AS origem
    FROM produtos pr
    LEFT JOIN fornecedores fm ON fm.fornecedor = trim(pr.marca)
    LEFT JOIN fornecedores fg ON fg.fornecedor = trim(pr.d_grp_marca)
   WHERE NULLIF(trim(pr.marca), '') IS NOT NULL
      OR NULLIF(trim(pr.d_grp_marca), '') IS NOT NULL`;

export type {
  Categoria,
  PosicaoRompida,
  Reposicao,
  ResumoFornecedor,
} from "./agregacao";

export type DadosFornecedores = {
  posicoes: PosicaoRompida[];
  /** Cargas com código nulo que a tela precisa ignorar. */
  linhasIgnoradas: { pedidos: number; transferencias: number };
};

export async function carregarFornecedores(
  data: string,
  parametros: { diasTransferencias: number; diasPedidos: number },
  /**
   * Faixa de cobertura analisada. `zero` (sem estoque) é o padrão e reproduz o
   * comportamento original da tela. As faixas são as mesmas da Disponibilidade,
   * via `faixaSql`, para "vermelho" significar a mesma coisa nas duas telas.
   */
  faixa: FaixaId = "zero",
): Promise<DadosFornecedores> {
  const { inicio: inicioMes, fim: proximoMes } = limitesDoMes(data);

  const [rompidas, chegadas, ignoradas, saldos] = await Promise.all([
    // Posições da faixa escolhida: itens válidos (torre "considerar") com
    // forecast no mês, classificados pela mesma régua da Disponibilidade.
    // O filtro de torre importa: sem ele a tela mostrava 1.582 posições, das
    // quais 1.105 são itens que o negócio manda desconsiderar.
    //
    // LEFT JOIN de propósito: item com forecast que nem aparece no simulador
    // do CD conta como estoque zero — é o caso mais comum da ruptura.
    //
    // O fornecedor vem de qualquer linha do produto no simulador: é atributo
    // do item, não da filial — sem isso, a maioria das posições ficaria
    // órfã, já que o item rompido costuma nem aparecer no CD.
    prisma.$queryRawUnsafe<
      {
        codigo: string;
        descricao: string | null;
        filial: string;
        fornecedor: string;
        origem_fornecedor: OrigemFornecedor;
        forecast: number;
        vendido: number;
        bu: string;
        curva: string;
        analista: string;
      }[]
    >(
      `WITH forn_sim AS (${FORNECEDOR_POR_ITEM}),
             forn_marca AS (${FORNECEDOR_POR_MARCA})
         SELECT f.codigo,
                pr.descricao,
                f.filial,
                COALESCE(NULLIF(trim(f.b_u), ''), '${VAZIO}') AS bu,
                COALESCE(NULLIF(trim(f.curva), ''), '${VAZIO}') AS curva,
                COALESCE(NULLIF(trim(f.analista), ''), '${VAZIO}') AS analista,
                COALESCE(fsim.nome, fmar.nome, 'Sem fornecedor') AS fornecedor,
                CASE
                  WHEN fsim.nome IS NOT NULL THEN fsim.origem
                  WHEN fmar.nome IS NOT NULL THEN fmar.origem
                  ELSE 'sem'
                END AS origem_fornecedor,
                f.forecast_m0::float8 AS forecast,
                COALESCE(${VENDIDO}, 0)::float8 AS vendido
           FROM forecast f
           LEFT JOIN ${simuladorPorCd("s.data_snapshot = $1::date")} s
             ON s.codigo = f.codigo AND s.filial = f.filial AND s.data_snapshot = $1::date
           LEFT JOIN produtos pr ON pr.codigo = f.codigo
           LEFT JOIN forn_sim fsim ON fsim.codigo = f.codigo
           LEFT JOIN forn_marca fmar ON fmar.codigo = f.codigo
          WHERE f.data_snapshot >= $2::date AND f.data_snapshot < $3::date
            AND ${snapshotMensalSql("forecast", "f", "$1")}
            AND f.forecast_m0 > 0
            AND ${torreValidaSql("f")}
            AND f.filial IS NOT NULL
            AND ${faixaSql(DIAS_CHAO)} = $4`,
      data,
      inicioMes,
      proximoMes,
      faixa,
    ),
    // Projeção das chegadas: mesma fonte usada pelos motores de risco.
    carregarChegadas(data, parametros),
    // Restrito ao snapshot em uso, e não à tabela inteira, por dois motivos.
    // O aviso diz "ficaram de fora desta análise", e linha de snapshot antigo
    // não entra nela — contar tudo apontava 27 mil linhas quando o dia tinha
    // zero. E varrer as duas tabelas completas custava ~460 ms por abertura
    // da tela, contra ~10 ms com o índice de `data_snapshot`.
    prisma.$queryRawUnsafe<{ pedidos: bigint; transferencias: bigint }[]>(
      `SELECT (SELECT COUNT(*) FROM pedidos_de_compra
                  WHERE codigo IS NULL AND data_snapshot = $1::date)::bigint AS pedidos,
                (SELECT COUNT(*) FROM transferencias_abertas
                  WHERE codigo IS NULL AND data_snapshot = $1::date)::bigint AS transferencias`,
      data,
    ),
    // Saldo do plano de compra do mês — fonte única em `lib/compras`, também
    // usada pelo cockpit. Duas cópias da mesma conta já divergiram aqui antes.
    carregarSaldoPlano(data),
  ]);

  const posicoes: PosicaoRompida[] = rompidas.map((r) => {
    // Já vem ordenada por data de chegada de `carregarChegadas`.
    const lista = chegadas.get(chaveChegada(r.codigo, r.filial)) ?? [];
    // A primeira a chegar define a categoria; as demais são redundantes para
    // a pergunta "quando esta ruptura acaba".
    const primeira = lista[0];
    const plano = saldos.get(r.codigo);
    const saldoComprar = plano?.saldo ?? 0;

    const categoria: Categoria = primeira
      ? primeira.origem
      : saldoComprar > 0
        ? "a_comprar"
        : "sem_cobertura";

    // Item sem linha em `plano_compra` nem entra no mapa de saldos, e plano
    // zerado conta como não planejado — zero não é uma decisão de comprar nada,
    // é a ausência de decisão. Só quem tem plano positivo e consumiu tudo é
    // "gasto", que é a situação em que já existe verba reconhecida.
    const motivoSemCobertura =
      categoria === "sem_cobertura"
        ? plano && plano.plano > 0
          ? ("plano_gasto" as const)
          : ("sem_plano" as const)
        : null;

    return {
      codigo: r.codigo,
      descricao: r.descricao,
      filial: r.filial,
      fornecedor: r.fornecedor,
      origemFornecedor: r.origem_fornecedor,
      bu: r.bu,
      curva: r.curva,
      analista: r.analista,
      forecast: r.forecast,
      vendido: r.vendido,
      categoria,
      motivoSemCobertura,
      quantidade: primeira?.quantidade ?? null,
      chegada: primeira?.chegada ?? null,
      reposicoes: lista,
      saldoComprar,
    };
  });

  // O resumo por fornecedor é agregado na tela: como o filtro de BU recorta as
  // posições no cliente, os totais têm de ser recalculados junto com ele.
  return {
    posicoes,
    linhasIgnoradas: {
      pedidos: Number(ignoradas[0]?.pedidos ?? 0),
      transferencias: Number(ignoradas[0]?.transferencias ?? 0),
    },
  };
}
