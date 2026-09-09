import { prisma } from "@/lib/prisma";
import { joinFornecedor, nomeFornecedor } from "@/lib/fornecedor";
import {
  COLUNAS_ESTOQUE_CHAO,
  DIAS_NO_MES,
  faixaSql,
  somaSql,
  torreValidaSql,
  type FaixaId,
  snapshotMensalSql,
} from "@/utils/dias-estoque";
import { simuladorPorCd } from "@/utils/cds-virtuais";
import { carregarChegadas, chaveChegada } from "@/lib/reposicoes/chegadas";
import { VAZIO, type Categoria, type PosicaoRompida } from "./agregacao";

const EST_CHAO = somaSql(COLUNAS_ESTOQUE_CHAO, "s");
const DIAS_CHAO = `(COALESCE(${EST_CHAO},0) / (f.forecast_m0 / ${DIAS_NO_MES}.0))`;

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

function limitesDoMes(data: string): [string, string] {
  const [ano, mes] = data.split("-").map(Number);
  return [
    new Date(Date.UTC(ano, mes - 1, 1)).toISOString().slice(0, 10),
    new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10),
  ];
}

export async function carregarFornecedores(
  data: string,
  parametros: { diasTransferencias: number; diasPedidos: number },
  /**
   * Faixa de cobertura analisada. `zero` (sem estoque) é o padrão e reproduz o
   * comportamento original da tela. As faixas são as mesmas da Disponibilidade,
   * via `faixaSql`, para "vermelho" significar a mesma coisa nas duas telas.
   */
  faixa: FaixaId = "zero"
): Promise<DadosFornecedores> {
  const [inicioMes, proximoMes] = limitesDoMes(data);

  const [rompidas, saldos, chegadas, ignoradas] =
    await Promise.all([
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
          codigo: string; descricao: string | null; filial: string;
          fornecedor: string; forecast: number; bu: string; curva: string;
        }[]
      >(
        `SELECT f.codigo,
                pr.descricao,
                f.filial,
                COALESCE(NULLIF(trim(f.b_u), ''), '${VAZIO}') AS bu,
                COALESCE(NULLIF(trim(f.curva), ''), '${VAZIO}') AS curva,
                COALESCE((
                  SELECT ${nomeFornecedor("s2")}
                    FROM simulador s2 ${joinFornecedor("s2")}
                   WHERE s2.codigo = f.codigo AND s2.data_snapshot = $1::date
                     AND s2.fornecedor IS NOT NULL
                   LIMIT 1
                ), 'Sem fornecedor') AS fornecedor,
                f.forecast_m0::float8 AS forecast
           FROM forecast f
           LEFT JOIN ${simuladorPorCd("s.data_snapshot = $1::date")} s
             ON s.codigo = f.codigo AND s.filial = f.filial AND s.data_snapshot = $1::date
           LEFT JOIN produtos pr ON pr.codigo = f.codigo
          WHERE f.data_snapshot >= $2::date AND f.data_snapshot < $3::date
            AND ${snapshotMensalSql("forecast", "f", "$1")}
            AND f.forecast_m0 > 0
            AND ${torreValidaSql("f")}
            AND f.filial IS NOT NULL
            AND ${faixaSql(DIAS_CHAO)} = $4`,
        data,
        inicioMes,
        proximoMes,
        faixa
      ),
      // Saldo a comprar do mês, por produto: plano − em aberto − recebido.
      //
      // `pedidos_de_compra` é cumulativa: o filtro de snapshot é obrigatório
      // além do recorte por mês de emissão. Sem ele o mesmo pedido soma uma vez
      // por importação — em agosto isso inflava o total em 6,8x.
      prisma.$queryRawUnsafe<{ codigo: string; saldo: number }[]>(
        `SELECT c.codigo, (c.plano - c.aberto - c.recebido)::float8 AS saldo FROM (
           SELECT p.codigo,
                  SUM(p.plano_de_compra) AS plano,
                  COALESCE((SELECT SUM(quantidade_receber) FROM pedidos_de_compra pc
                             WHERE pc.codigo = p.codigo AND pc.quantidade_receber > 0
                               AND pc.data_snapshot = $3::date
                               AND pc.data_emissao >= $1::date AND pc.data_emissao < $2::date), 0) AS aberto,
                  COALESCE((SELECT SUM(quantidade) FROM recebimento r
                             WHERE r.codigo = p.codigo
                               AND r.data_pedido >= $1::date AND r.data_pedido < $2::date
                               AND r.data >= $1::date AND r.data < $2::date), 0) AS recebido
             FROM plano_compra p
            WHERE p.data_snapshot >= $1::date AND p.data_snapshot < $2::date
              AND ${snapshotMensalSql("plano_compra", "p", "$3")}
            GROUP BY p.codigo
         ) c`,
        inicioMes,
        proximoMes,
        data
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
        data
      ),
    ]);

  const saldoPorCodigo = new Map(saldos.map((s) => [s.codigo, s.saldo]));

  const posicoes: PosicaoRompida[] = rompidas.map((r) => {
    // Já vem ordenada por data de chegada de `carregarChegadas`.
    const lista = chegadas.get(chaveChegada(r.codigo, r.filial)) ?? [];
    // A primeira a chegar define a categoria; as demais são redundantes para
    // a pergunta "quando esta ruptura acaba".
    const primeira = lista[0];
    const saldoComprar = saldoPorCodigo.get(r.codigo) ?? 0;

    const categoria: Categoria = primeira
      ? primeira.origem
      : saldoComprar > 0
        ? "a_comprar"
        : "sem_cobertura";

    return {
      codigo: r.codigo,
      descricao: r.descricao,
      filial: r.filial,
      fornecedor: r.fornecedor,
      bu: r.bu,
      curva: r.curva,
      forecast: r.forecast,
      categoria,
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
