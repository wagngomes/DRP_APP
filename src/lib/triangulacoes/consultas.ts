/**
 * Triangulações: reposições que percorrem uma rota com mais de um trecho.
 *
 * Vêm de duas origens, e a tela mostra as duas juntas:
 *
 *   transferências — `transferencias_abertas.rota` ("DF2 > CAJ > ES > LDA").
 *     Quando a coluna traz só "-", é transferência simples e fica de fora.
 *   compras ........ `pedidos_de_compra.tp_ped_transf_descricao`. Quando é
 *     "N/A" ou vazio, é compra direta na filial e também fica de fora.
 *
 * O valor de cada origem sai de uma coluna diferente — `valor` na nota de
 * transferência, `saldo_ajustado` no pedido de compra — e por isso os totais
 * ficam separados na tela, em vez de somados num número só.
 *
 * Agrupado por produto de propósito: a pergunta é "o que está triangulando
 * deste item e quando chega", não "qual documento está onde".
 */
import { prisma } from "@/lib/prisma";
import {
  carregarFiliais,
  carregarSla,
  type LinhaTransferencia,
} from "@/lib/transferencias/consultas";
import { parseRota, projetar, type Etapa } from "@/utils/projecao-transferencias";
import { ehCompraDireta, projetarPedido } from "@/utils/projecao-pedidos";
import { carregarChegadas, chaveChegada } from "@/lib/reposicoes/chegadas";
import { simuladorPorCd } from "@/utils/cds-virtuais";
import {
  COLUNAS_ESTOQUE_CHAO,
  snapshotMensalSql,
  somaSql,
} from "@/utils/dias-estoque";
import { joinFornecedor, nomeFornecedor } from "@/lib/fornecedor";

const EST_CHAO = somaSql(COLUNAS_ESTOQUE_CHAO, "s");

/**
 * Uma reposição triangulando, com origem e percurso já resolvidos.
 *
 * Formato comum às duas origens para a tela renderizar uma lista só, em vez de
 * duas seções que o leitor teria de cruzar mentalmente.
 */
export type LinhaTriangulacao = {
  id: number;
  codigo: string;
  origem: "compra" | "transferencia";
  /** NF nas transferências, número do pedido nas compras. */
  documento: string | null;
  quantidade: number;
  valor: number | null;
  /** Rota textual como vem da base. */
  rota: string | null;
  /** CD de onde saiu na perna atual; nas compras, o ponto de entrega. */
  origemAtual: string | null;
  dataEmissao: Date | null;
  /** Rótulo da primeira parada do workflow: "saída" ou a data pedra. */
  inicio: string;
  etapas: Etapa[];
  cdFinal: string | null;
  chegadaFinal: Date | null;
  reprojetada: boolean;
};

/** Situação do produto no CD onde a triangulação termina. */
export type PosicaoDestino = {
  filial: string;
  estoqueChao: number;
  emTransferencia: number;
  emCompra: number;
  /** Forecast do mês para este item neste CD; `null` quando não há previsão. */
  forecastM0: number | null;
};

export type ProdutoTriangulando = {
  codigo: string;
  descricao: string | null;
  /** Nome normalizado, como em todas as visões por fornecedor. */
  fornecedor: string;
  linhas: LinhaTriangulacao[];
  quantidade: number;
  /** Valores separados por origem: as colunas de origem são diferentes. */
  valorTransferencia: number;
  valorCompra: number;
  destinos: PosicaoDestino[];
};

export type DadosTriangulacoes = {
  produtos: ProdutoTriangulando[];
  fornecedores: string[];
  valorTransferencia: number;
  valorCompra: number;
  linhasTransferencia: number;
  linhasCompra: number;
  /** Linhas cuja rota não pôde ser resolvida (sigla fora do cadastro). */
  semPercurso: number;
};

function dataBr(d: Date | null): string {
  return d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "sem data";
}

export async function carregarTriangulacoes(
  data: string,
  parametros: { diasTransferencias: number; diasPedidos: number },
  /** Código exato ou trecho da descrição. */
  filtroProduto?: string,
  /** Nome normalizado, como vem do filtro da tela. */
  filtroFornecedor?: string
): Promise<DadosTriangulacoes> {
  const [transferencias, pedidos, sla, siglaParaCodigo, chegadas] = await Promise.all([
    prisma.$queryRawUnsafe<
      (LinhaTransferencia & {
        valor: number | null;
        descricao: string | null;
        fornecedor: string;
      })[]
    >(
      // Só o snapshot do dia: a tabela é cumulativa e sem o filtro entrariam
      // transferências de dias anteriores, já entregues.
      //
      // O fornecedor é atributo do item e vive no simulador, não na nota — por
      // isso vem de subconsulta, com o nome normalizado que todas as telas usam.
      `SELECT t.id, t.numero_nf_saida, t.codigo, t.descricao_produto,
              t.qtde::float8 AS qtde, t.valor::float8 AS valor,
              t.filial_codigo_saida, t.filial_codigo_entrada, t.rota,
              t.passo::int AS passo, t.qtde_passo::int AS qtde_passo,
              t.data_emissao, p.descricao,
              COALESCE((
                SELECT ${nomeFornecedor("s2")}
                  FROM simulador s2 ${joinFornecedor("s2")}
                 WHERE s2.codigo = t.codigo AND s2.data_snapshot = $1::date
                   AND s2.fornecedor IS NOT NULL
                 LIMIT 1
              ), 'Sem fornecedor') AS fornecedor
         FROM transferencias_abertas t
         LEFT JOIN produtos p ON p.codigo = t.codigo
        WHERE t.data_snapshot = $1::date
          AND t.codigo IS NOT NULL
          AND t.rota IS NOT NULL AND t.rota LIKE '%>%'
        ORDER BY t.codigo, t.data_emissao`,
      data
    ),
    prisma.$queryRawUnsafe<
      {
        id: number; codigo: string; num_pedido: string | null;
        quantidade_receber: number | null; saldo_ajustado: number | null;
        filial: string | null; rota: string | null;
        data_emissao: Date | null; data_pedra: Date | null;
        descricao: string | null; fornecedor: string;
      }[]
    >(
      // Pedidos com rota na `tp_ped_transf_descricao`. "N/A" e vazio são compra
      // direta e não triangulam.
      `SELECT pc.id, pc.codigo, pc.num_pedido,
              pc.quantidade_receber::float8 AS quantidade_receber,
              pc.saldo_ajustado::float8 AS saldo_ajustado,
              pc.filial, pc.tp_ped_transf_descricao AS rota,
              pc.data_emissao, pc.data_pedra, p.descricao,
              COALESCE((
                SELECT ${nomeFornecedor("s2")}
                  FROM simulador s2 ${joinFornecedor("s2")}
                 WHERE s2.codigo = pc.codigo AND s2.data_snapshot = $1::date
                   AND s2.fornecedor IS NOT NULL
                 LIMIT 1
              ), 'Sem fornecedor') AS fornecedor
         FROM pedidos_de_compra pc
         LEFT JOIN produtos p ON p.codigo = pc.codigo
        WHERE pc.data_snapshot = $1::date
          AND pc.codigo IS NOT NULL
          AND pc.quantidade_receber > 0
          AND pc.tp_ped_transf_descricao LIKE '%>%'
        ORDER BY pc.codigo, pc.data_emissao`,
      data
    ),
    carregarSla(),
    carregarFiliais(),
    carregarChegadas(data, parametros),
  ]);

  const dataReferencia = new Date(`${data}T00:00:00.000Z`);
  let semPercurso = 0;

  /** Descrição e fornecedor do produto, de qualquer uma das origens. */
  const meta = new Map<string, { descricao: string | null; fornecedor: string }>();

  const linhasTransf: LinhaTriangulacao[] = transferencias
    // `parseRota` exige dois pontos: uma rota de um elemento só não triangula.
    .filter((l) => parseRota(l.rota).length >= 2)
    .map((l) => {
      const p = projetar({
        rota: l.rota,
        filialSaida: l.filial_codigo_saida,
        filialEntrada: l.filial_codigo_entrada,
        passo: l.passo,
        dataEmissao: l.data_emissao,
        siglaParaCodigo,
        sla,
        dataReferencia,
        diasParaVencidas: parametros.diasTransferencias,
      });
      if (!p.cdFinal) semPercurso += 1;
      meta.set(l.codigo!, {
        descricao: l.descricao ?? l.descricao_produto,
        fornecedor: l.fornecedor,
      });
      return {
        id: l.id,
        origem: "transferencia" as const,
        documento: l.numero_nf_saida,
        quantidade: l.qtde ?? 0,
        valor: l.valor,
        rota: l.rota,
        origemAtual: l.filial_codigo_saida,
        dataEmissao: l.data_emissao,
        inicio: "saída",
        etapas: p.etapas,
        cdFinal: p.cdFinal,
        chegadaFinal: p.chegadaFinal,
        reprojetada: p.reprojetada,
        codigo: l.codigo!,
      };
    });

  const linhasCompra = pedidos
    .filter((l) => !ehCompraDireta(l.rota))
    .map((l) => {
      const p = projetarPedido({
        rota: l.rota,
        filial: l.filial,
        dataPedra: l.data_pedra,
        siglaParaCodigo,
        sla,
        dataReferencia,
        diasParaVencidos: parametros.diasPedidos,
      });
      if (!p.cdFinal) semPercurso += 1;
      if (!meta.has(l.codigo)) {
        meta.set(l.codigo, { descricao: l.descricao, fornecedor: l.fornecedor });
      }
      return {
        id: l.id,
        origem: "compra" as const,
        documento: l.num_pedido,
        quantidade: l.quantidade_receber ?? 0,
        // Valor da compra vem de `saldo_ajustado`, não de `valor` — colunas
        // diferentes por origem, por isso os totais não se somam na tela.
        valor: l.saldo_ajustado,
        rota: l.rota,
        origemAtual: p.etapas[0]?.de ?? l.filial,
        dataEmissao: l.data_emissao,
        // Reprojetado: a data pedra está no passado; vale a recalculada.
        inicio: dataBr(p.chegadaPrimeiroPonto),
        etapas: p.etapas,
        cdFinal: p.cdFinal,
        chegadaFinal: p.chegadaFinal,
        reprojetada: p.reprojetada,
        codigo: l.codigo,
      };
    });

  const todasLinhas = [...linhasTransf, ...linhasCompra];

  // Estoque chão e forecast dos produtos envolvidos, para os cards de destino.
  const codigos = [...new Set(todasLinhas.map((l) => l.codigo))];
  const [estoques, forecasts] = codigos.length
    ? await Promise.all([
        prisma.$queryRawUnsafe<{ codigo: string; filial: string; chao: number }[]>(
          `SELECT s.codigo, s.filial, COALESCE(${EST_CHAO},0)::float8 AS chao
             FROM ${simuladorPorCd("s.data_snapshot = $1::date")} s
            WHERE s.data_snapshot = $1::date
              AND s.codigo = ANY($2::text[]) AND s.filial IS NOT NULL`,
          data,
          codigos
        ),
        prisma.$queryRawUnsafe<{ codigo: string; filial: string; fc: number }[]>(
          `SELECT f.codigo, f.filial, f.forecast_m0::float8 AS fc
             FROM forecast f
            WHERE ${snapshotMensalSql("forecast", "f", "$1")}
              AND f.codigo = ANY($2::text[]) AND f.filial IS NOT NULL`,
          data,
          codigos
        ),
      ])
    : [[], []];

  const chaoPor = new Map(estoques.map((e) => [`${e.codigo}|${e.filial}`, e.chao]));
  const forecastPor = new Map(forecasts.map((f) => [`${f.codigo}|${f.filial}`, f.fc]));

  const porProduto = new Map<string, typeof todasLinhas>();
  for (const l of todasLinhas) {
    porProduto.set(l.codigo, [...(porProduto.get(l.codigo) ?? []), l]);
  }

  const produtos: ProdutoTriangulando[] = [...porProduto.entries()].map(([codigo, linhas]) => {
    const finais = [...new Set(linhas.map((l) => l.cdFinal).filter(Boolean))] as string[];
    const destinos = finais.map((filial): PosicaoDestino => {
      const reposicoes = chegadas.get(chaveChegada(codigo, filial)) ?? [];
      const somar = (origem: "compra" | "transferencia") =>
        reposicoes.filter((r) => r.origem === origem).reduce((a, r) => a + r.quantidade, 0);
      return {
        filial,
        estoqueChao: chaoPor.get(`${codigo}|${filial}`) ?? 0,
        emTransferencia: somar("transferencia"),
        emCompra: somar("compra"),
        forecastM0: forecastPor.get(`${codigo}|${filial}`) ?? null,
      };
    });

    const soma = (origem: "compra" | "transferencia") =>
      linhas.filter((l) => l.origem === origem).reduce((a, l) => a + (l.valor ?? 0), 0);

    return {
      codigo,
      descricao: meta.get(codigo)?.descricao ?? null,
      fornecedor: meta.get(codigo)?.fornecedor ?? "Sem fornecedor",
      // Sem data projetável vai para o fim: não dá para priorizar o que não se
      // sabe quando chega.
      linhas: [...linhas].sort(
        (a, b) =>
          (a.chegadaFinal?.getTime() ?? Infinity) - (b.chegadaFinal?.getTime() ?? Infinity)
      ),
      quantidade: linhas.reduce((a, l) => a + l.quantidade, 0),
      valorTransferencia: soma("transferencia"),
      valorCompra: soma("compra"),
      destinos: destinos.sort((a, b) => a.filial.localeCompare(b.filial)),
    };
  });

  // A lista do filtro sai de todos os produtos, antes do recorte: senão filtrar
  // por um fornecedor esvaziaria o próprio seletor.
  const fornecedores = [...new Set(produtos.map((p) => p.fornecedor))].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );

  const termo = filtroProduto?.trim().toLowerCase();
  const visiveis = produtos
    .filter(
      (p) =>
        (!filtroFornecedor || p.fornecedor === filtroFornecedor) &&
        (!termo ||
          p.codigo.toLowerCase().includes(termo) ||
          (p.descricao ?? "").toLowerCase().includes(termo))
    )
    // Maior valor primeiro: é o que mais pesa em capital parado em trânsito.
    .sort(
      (a, b) => b.valorTransferencia + b.valorCompra - (a.valorTransferencia + a.valorCompra)
    );

  // Os totais do topo acompanham o recorte: mostrar o valor cheio com três
  // cards na tela seria pior do que não filtrar.
  const linhasVisiveis = visiveis.flatMap((p) => p.linhas);
  const totalDe = (origem: "compra" | "transferencia") =>
    linhasVisiveis.filter((l) => l.origem === origem);

  return {
    produtos: visiveis,
    fornecedores,
    valorTransferencia: totalDe("transferencia").reduce((a, l) => a + (l.valor ?? 0), 0),
    valorCompra: totalDe("compra").reduce((a, l) => a + (l.valor ?? 0), 0),
    linhasTransferencia: totalDe("transferencia").length,
    linhasCompra: totalDe("compra").length,
    semPercurso,
  };
}
