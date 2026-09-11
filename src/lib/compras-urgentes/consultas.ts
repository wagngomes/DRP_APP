/**
 * Compras urgentes: cobertura consolidada do produto na rede (visão Cia).
 *
 * Diferente das outras telas, o grão aqui é o **produto**, não item × CD. Um
 * item pode estar rompido em três CDs e sobrando num quarto: a pergunta desta
 * tela é se a rede como um todo tem cobertura, porque comprar é decisão de rede.
 *
 * Os dias saem dos totais somados, e não da média dos CDs — é a mesma regra do
 * card "Cia" da tela de produto: um CD zerado e outro abastecido produzem uma
 * cobertura de rede que nenhuma das duas leituras isoladas mostra.
 *
 * Estoque total = chão + transferências + compras, as mesmas colunas de
 * `COLUNAS_ESTOQUE_TOTAL`, para o número bater com o resto do sistema.
 */
import { prisma } from "@/lib/prisma";
import { joinFornecedor, nomeFornecedor } from "@/lib/fornecedor";
import { simuladorPorCd } from "@/utils/cds-virtuais";
import {
  COLUNAS_COMPRAS,
  COLUNAS_ESTOQUE_CHAO,
  COLUNAS_TRANSFERENCIA,
  DIAS_NO_MES,
  snapshotMensalSql,
  somaSql,
  torreValidaSql,
} from "@/utils/dias-estoque";
import { VAZIO } from "@/lib/fornecedores/agregacao";

const EST_CHAO = somaSql(COLUNAS_ESTOQUE_CHAO, "s");
const EST_TRANSF = somaSql(COLUNAS_TRANSFERENCIA, "s");
const EST_COMPRAS = somaSql(COLUNAS_COMPRAS, "s");

/** Posição de um CD, para o detalhamento em tooltip. */
export type PosicaoCd = {
  filial: string;
  estoqueChao: number;
  transferencias: number;
  compras: number;
  forecast: number;
  /** Cobertura do estoque chão neste CD. */
  diasChao: number | null;
};

export type ProdutoUrgente = {
  codigo: string;
  descricao: string | null;
  fornecedor: string;
  bu: string;
  /** Analista responsável, vindo do forecast. */
  analista: string;
  estoqueChao: number;
  transferencias: number;
  compras: number;
  forecast: number;
  /** Cobertura consolidada do estoque chão. */
  diasChao: number | null;
  /** Cobertura consolidada de chão + transferências + compras. */
  diasTotal: number | null;
  /** Saldo do plano de compra do mês ainda não colocado. */
  saldoComprar: number;
  /** CDs por faixa de cobertura, com o detalhe para o tooltip. */
  cdsRompidos: PosicaoCd[];
  cdsAte10: PosicaoCd[];
  cds10a20: PosicaoCd[];
};

export type DadosComprasUrgentes = {
  produtos: ProdutoUrgente[];
  /** BUs presentes antes do recorte, para o filtro não se esvaziar sozinho. */
  bus: string[];
  /** Analistas presentes antes do recorte, para o filtro não se esvaziar. */
  analistas: string[];
  fornecedores: string[];
  /** Quantos produtos existem no universo, antes do corte de cobertura. */
  totalUniverso: number;
};

export async function carregarComprasUrgentes(
  data: string,
  /** Corte de cobertura total: traz o que está igual ou abaixo. */
  limiteDias: number,
  filtroBu?: string,
  filtroFornecedor?: string,
  filtroAnalista?: string
): Promise<DadosComprasUrgentes> {
  const [ano, mes] = data.split("-").map(Number);
  const inicioMes = new Date(Date.UTC(ano, mes - 1, 1)).toISOString().slice(0, 10);
  const proximoMes = new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10);

  const [linhas, saldos] = await Promise.all([
    // Uma linha por item × CD. A consolidação por produto acontece no
    // TypeScript porque a mesma passagem já monta o detalhe do tooltip.
    prisma.$queryRawUnsafe<
      {
        codigo: string; descricao: string | null; filial: string; fornecedor: string;
        bu: string; analista: string; forecast: number; chao: number;
        transf: number; compras: number;
      }[]
    >(
      `SELECT f.codigo,
              pr.descricao,
              f.filial,
              COALESCE(NULLIF(trim(f.b_u), ''), '${VAZIO}') AS bu,
              COALESCE(NULLIF(trim(f.analista), ''), '${VAZIO}') AS analista,
              COALESCE((
                SELECT ${nomeFornecedor("s2")}
                  FROM simulador s2 ${joinFornecedor("s2")}
                 WHERE s2.codigo = f.codigo AND s2.data_snapshot = $1::date
                   AND s2.fornecedor IS NOT NULL
                 LIMIT 1
              ), 'Sem fornecedor') AS fornecedor,
              f.forecast_m0::float8 AS forecast,
              COALESCE(${EST_CHAO}, 0)::float8    AS chao,
              COALESCE(${EST_TRANSF}, 0)::float8  AS transf,
              COALESCE(${EST_COMPRAS}, 0)::float8 AS compras
         FROM forecast f
         LEFT JOIN ${simuladorPorCd("s.data_snapshot = $1::date")} s
           ON s.codigo = f.codigo AND s.filial = f.filial AND s.data_snapshot = $1::date
         LEFT JOIN produtos pr ON pr.codigo = f.codigo
        WHERE ${snapshotMensalSql("forecast", "f", "$1")}
          AND f.forecast_m0 > 0
          AND ${torreValidaSql("f")}
          AND f.filial IS NOT NULL`,
      data
    ),
    // Saldo a comprar do mês, por produto: plano − em aberto − recebido.
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
  ]);

  const saldoPor = new Map(saldos.map((s) => [s.codigo, s.saldo]));

  const porProduto = new Map<string, typeof linhas>();
  for (const l of linhas) {
    porProduto.set(l.codigo, [...(porProduto.get(l.codigo) ?? []), l]);
  }

  const dias = (quantidade: number, forecast: number) =>
    forecast > 0 ? quantidade / (forecast / DIAS_NO_MES) : null;

  const todos: ProdutoUrgente[] = [...porProduto.entries()].map(([codigo, cds]) => {
    const soma = (fn: (l: (typeof cds)[number]) => number) =>
      cds.reduce((a, l) => a + fn(l), 0);

    const forecast = soma((l) => l.forecast);
    const chao = soma((l) => l.chao);
    const transf = soma((l) => l.transf);
    const compras = soma((l) => l.compras);

    const posicoes: PosicaoCd[] = cds.map((l) => ({
      filial: l.filial,
      estoqueChao: l.chao,
      transferencias: l.transf,
      compras: l.compras,
      forecast: l.forecast,
      diasChao: dias(l.chao, l.forecast),
    }));

    // As três faixas usam a cobertura do próprio CD, não a consolidada — é o
    // que responde "onde está o buraco" dentro de um produto que, na rede,
    // pode até parecer coberto.
    const naFaixa = (min: number, max: number) =>
      posicoes.filter((p) => p.diasChao !== null && p.diasChao > min && p.diasChao <= max);

    return {
      codigo,
      descricao: cds[0].descricao,
      fornecedor: cds[0].fornecedor,
      bu: cds[0].bu,
      analista: cds[0].analista,
      estoqueChao: chao,
      transferencias: transf,
      compras,
      forecast,
      diasChao: dias(chao, forecast),
      diasTotal: dias(chao + transf + compras, forecast),
      saldoComprar: saldoPor.get(codigo) ?? 0,
      cdsRompidos: posicoes.filter((p) => p.estoqueChao <= 0),
      cdsAte10: naFaixa(0, 10),
      cds10a20: naFaixa(10, 20),
    };
  });

  // Listas dos filtros montadas antes do recorte: senão filtrar por uma BU
  // esvaziaria o próprio seletor.
  const bus = [...new Set(todos.map((p) => p.bu))].sort((a, b) =>
    a === VAZIO ? 1 : b === VAZIO ? -1 : a.localeCompare(b, "pt-BR")
  );
  const analistas = [...new Set(todos.map((p) => p.analista))].sort((a, b) =>
    a === VAZIO ? 1 : b === VAZIO ? -1 : a.localeCompare(b, "pt-BR")
  );
  const fornecedores = [...new Set(todos.map((p) => p.fornecedor))].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );

  const produtos = todos
    .filter(
      (p) =>
        p.diasTotal !== null &&
        p.diasTotal <= limiteDias &&
        (!filtroBu || p.bu === filtroBu) &&
        (!filtroAnalista || p.analista === filtroAnalista) &&
        (!filtroFornecedor || p.fornecedor === filtroFornecedor)
    )
    // Mais crítico primeiro: menos dias de cobertura e, no empate, mais CDs
    // rompidos. A cobertura vem primeiro porque é a dimensão do filtro.
    .sort(
      (a, b) =>
        (a.diasTotal ?? 0) - (b.diasTotal ?? 0) ||
        b.cdsRompidos.length - a.cdsRompidos.length ||
        a.codigo.localeCompare(b.codigo)
    );

  return { produtos, bus, analistas, fornecedores, totalUniverso: todos.length };
}
