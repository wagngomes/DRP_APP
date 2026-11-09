import { prisma } from "@/lib/prisma";
import {
  COLUNAS_ESTOQUE_CHAO,
  COLUNAS_ESTOQUE_TOTAL,
  somaSql,
} from "@/utils/dias-estoque";
import {
  carregarFiliais,
  carregarSla,
  type LinhaTransferencia,
} from "@/lib/transferencias/consultas";
import { projetar, type Projecao } from "@/utils/projecao-transferencias";
import { projetarPedido, type ProjecaoPedido } from "@/utils/projecao-pedidos";
import { simuladorPorCd } from "@/utils/cds-virtuais";
import { lerParametros } from "@/lib/parametros.server";

/**
 * Novas aberturas de forecast entre duas cargas escolhidas.
 *
 * Responde a uma pergunta que o diagnóstico de ruptura não respondia: **quais
 * posições ganharam previsão agora**. Elas não aparecem como ruptura por culpa
 * de ninguém — nasceram com demanda e sem prazo para comprar — e por isso
 * merecem uma lista própria, antes de virarem evento.
 *
 * **Compara duas cargas, não dois meses.** O fato acontece de uma importação
 * para a outra: naquela carga o CD não tinha previsão, nesta tem. Medir contra
 * um marco de mês faria toda posição carregada depois do dia 1º parecer nova.
 *
 * **A data de criação é procurada dentro da janela**, e não assumida como a
 * data final: entre as duas cargas escolhidas pode haver uma dúzia de outras, e
 * o que interessa é a primeira em que a previsão passou de zero. É por isso que
 * ela é uma subconsulta correlacionada e não um `JOIN` — com `JOIN` e
 * `GROUP BY` a mesma resposta levava 23s, contra 165ms assim, porque o planner
 * trocava o índice por varredura da tabela inteira.
 *
 * **Os recortes são próprios da seção**, e não os da lista de ruptura ao lado.
 * O universo é outro: aqui se compara forecast entre duas cargas, e a seção
 * responde mesmo antes de o motor de diagnóstico ter rodado uma vez — um
 * laboratório pode ter abertura nova sem ter uma única ruptura. Um filtro só
 * para as duas listas faria cada uma prometer o conjunto da outra.
 */

const EST_CHAO = somaSql(COLUNAS_ESTOQUE_CHAO, "s");
const EST_TOTAL = somaSql(COLUNAS_ESTOQUE_TOTAL, "s");

export const POR_PAGINA = 20;

/** Uma transferência a caminho desta posição, já projetada. */
export type TransferenciaDaAbertura = LinhaTransferencia & {
  projecao: Projecao;
};

/** Um pedido de compra a caminho desta posição, já projetado. */
export type PedidoDaAbertura = {
  id: number;
  num_pedido: string | null;
  quantidade_receber: number | null;
  filial: string | null;
  rota: string | null;
  data_emissao: Date | null;
  data_pedra: Date | null;
  status_logistica: string | null;
  data_agendada: string | null;
  frete: string | null;
  projecao: ProjecaoPedido;
};

export type NovaAbertura = {
  codigo: string;
  filial: string;
  descricao: string | null;
  fornecedor: string | null;
  /** Forecast M0 atualizado na carga final. */
  forecast: number;
  /**
   * A linha não existia na carga inicial, contra ter existido zerada.
   *
   * Duas formas do mesmo fato que dizem coisas diferentes: o CD é novo para o
   * item, ou o CD já estava no cadastro e a previsão foi ligada.
   */
  linhaNova: boolean;
  /** Primeira carga da janela em que a previsão passou de zero. */
  criadoEm: string;
  estoqueChao: number;
  estoqueTotal: number;
  rotaCompra: string | null;
  bu: string | null;
  transferencias: TransferenciaDaAbertura[];
  pedidos: PedidoDaAbertura[];
};

/** Uma opção de recorte e quantas aberturas ela traz. */
export type OpcaoAbertura = { valor: string; aberturas: number };

export type ResultadoNovasAberturas = {
  linhas: NovaAbertura[];
  total: number;
  /** Cargas de forecast disponíveis, da mais recente para a mais antiga. */
  cargas: string[];
  /** Carga efetivamente usada como início — a mais recente até a data pedida. */
  de: string | null;
  /** Carga efetivamente usada como fim. */
  ate: string | null;
  /** Snapshot do simulador usado para estoque, pedidos e transferências. */
  snapshotPosicao: string | null;
  /**
   * Opções de cada recorte, apuradas **sem o próprio filtro**.
   *
   * O número ao lado de uma opção tem de antecipar o resultado do clique. Se
   * cada lista fosse apurada já com o próprio filtro aplicado, o primeiro
   * clique a reduziria a um único item e não haveria caminho de volta a não ser
   * limpar tudo.
   */
  bus: OpcaoAbertura[];
  filiais: OpcaoAbertura[];
  fornecedores: string[];
  /**
   * Posições com forecast positivo em cada uma das duas cargas.
   *
   * Existe para a tela poder duvidar de si mesma. Uma carga inicial
   * sensivelmente menor que a final produz aberturas que não aconteceram: em
   * 19/10 esta base trouxe 6.940 posições contra 8.237 no dia seguinte, e a
   * diferença virou 1.335 "aberturas novas" que eram só o retorno do que a
   * carga magra havia deixado de fora.
   */
  cobertura: { de: number; ate: number } | null;
};

/** Abaixo disto a carga inicial é fina demais para servir de base de comparação. */
export const FRACAO_COBERTURA_MINIMA = 0.9;

/** A carga inicial é magra o bastante para as aberturas serem suspeitas? */
export function coberturaSuspeita(
  cobertura: { de: number; ate: number } | null,
): boolean {
  if (!cobertura || cobertura.ate === 0) return false;
  return cobertura.de / cobertura.ate < FRACAO_COBERTURA_MINIMA;
}

export type FiltroNovasAberturas = {
  /** Data pedida para o início da janela; cai na carga mais próxima até ela. */
  de?: string;
  ate?: string;
  pagina: number;
  bu?: string;
  fornecedor?: string;
  produto?: string;
  /** Código do CD, como vem do forecast. */
  filial?: string;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Cargas de forecast existentes.
 *
 * Só as que têm código preenchido. Sem esse filtro uma carga quebrada — como a
 * de 26/08, com 16.178 linhas de código nulo — entraria na lista e faria toda
 * posição parecer uma abertura nova no dia seguinte.
 */
async function cargasDeForecast(): Promise<string[]> {
  const linhas = await prisma.$queryRawUnsafe<{ d: Date }[]>(
    `SELECT DISTINCT data_snapshot::date AS d
       FROM forecast
      WHERE codigo IS NOT NULL
      ORDER BY d DESC`,
  );
  return linhas.map((l) => iso(l.d));
}

/**
 * A janela de comparação, resolvida contra as cargas que existem.
 *
 * Pura e exportada para ter teste: é aqui que mora a regra que o usuário
 * percebe — escolher um sábado tem de cair na carga de sexta, e abrir a tela
 * sem escolher nada tem de mostrar algo útil em vez de uma lista vazia.
 *
 * `de` e `ate` são o que veio da URL; o retorno é o par de cargas reais.
 * Devolve nulo quando não há duas cargas distintas para comparar, que é o
 * único caso em que a seção não tem o que dizer.
 *
 * @param cargas Cargas existentes, da mais recente para a mais antiga.
 */
export function resolverJanela(
  cargas: string[],
  de: string | undefined,
  ate: string | undefined,
): { de: string; ate: string } | null {
  if (cargas.length < 2) return null;

  // A mais recente que não passa da data pedida. Sem data pedida, a última
  // carga — "o que abriu hoje" é a pergunta de todo dia.
  const fim = (ate ? cargas.find((c) => c <= ate) : cargas[0]) ?? null;
  if (!fim) return null;

  // O início padrão olha ~30 dias para trás, e não a carga imediatamente
  // anterior. Medido nesta base: entre duas cargas consecutivas o resultado é
  // zero em 7 dos 10 pares de outubro, porque forecast novo entra em lote e
  // não todo dia. Abrir a tela mostrando "nenhuma abertura" seria verdade e
  // seria inútil — a pergunta real é o que abriu no ciclo, não no último dia.
  const limite = recuar(fim, DIAS_JANELA_PADRAO);
  const inicio =
    (de ? cargas.find((c) => c <= de && c < fim) : null) ??
    // A mais antiga dentro da janela; se nenhuma alcança, a mais antiga de
    // todas, que ainda é melhor que não ter início.
    [...cargas].reverse().find((c) => c >= limite && c < fim) ??
    cargas.find((c) => c < fim) ??
    null;
  if (!inicio) return null;

  return { de: inicio, ate: fim };
}

/** Janela padrão, em dias, quando o usuário ainda não escolheu nada. */
const DIAS_JANELA_PADRAO = 30;

function recuar(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

export async function carregarNovasAberturas(
  filtro: FiltroNovasAberturas,
): Promise<ResultadoNovasAberturas> {
  const cargas = await cargasDeForecast();
  const janela = resolverJanela(cargas, filtro.de, filtro.ate);

  const vazio: ResultadoNovasAberturas = {
    linhas: [],
    total: 0,
    cargas,
    de: janela?.de ?? null,
    ate: janela?.ate ?? null,
    snapshotPosicao: null,
    bus: [],
    filiais: [],
    fornecedores: [],
    cobertura: null,
  };
  if (!janela) return vazio;
  const { de, ate } = janela;

  // O estoque e o que está a caminho são lidos **na data final da janela**, e
  // não na data de referência do sistema: a seção inteira responde "como estava
  // em `ate`", e misturar as duas épocas daria um estoque de hoje ao lado de uma
  // abertura de três semanas atrás. Quando `ate` é a carga de hoje — o caso
  // normal — as duas coincidem.
  const [posicao, contagens] = await Promise.all([
    prisma.$queryRawUnsafe<{ d: Date | null }[]>(
      `SELECT MAX(data_snapshot)::date AS d FROM simulador WHERE data_snapshot <= $1::date`,
      ate,
    ),
    prisma.$queryRawUnsafe<{ d: Date; n: bigint }[]>(
      `SELECT data_snapshot::date AS d, COUNT(*)::bigint AS n
         FROM forecast
        WHERE data_snapshot IN ($1::date, $2::date)
          AND codigo IS NOT NULL AND filial IS NOT NULL
          AND forecast_m0_atualizado > 0
        GROUP BY 1`,
      de,
      ate,
    ),
  ]);
  const snapshotPosicao = posicao[0]?.d ? iso(posicao[0].d) : null;

  const porCarga = new Map(contagens.map((c) => [iso(c.d), Number(c.n)]));
  const cobertura = {
    de: porCarga.get(de) ?? 0,
    ate: porCarga.get(ate) ?? 0,
  };

  const bu = filtro.bu?.trim() || null;
  const fornecedor = filtro.fornecedor?.trim() || null;
  const produto = filtro.produto?.trim() || null;
  const filial = filtro.filial?.trim() || null;

  // As duas cargas (`b` e `a`), a diferença entre elas (`novas`) e o que
  // descreve cada posição (`completo`). Fica separado dos recortes porque a
  // mesma base serve à página e às listas de opção — e cada uma aplica uma
  // combinação diferente deles.
  const ctes = `
    WITH b AS (
      SELECT codigo, filial,
             SUM(forecast_m0_atualizado)::float8 AS f,
             MAX(rota_compra) AS rota_compra,
             MAX(b_u)         AS bu
        FROM forecast
       WHERE data_snapshot = $2::date
         AND codigo IS NOT NULL AND filial IS NOT NULL
       GROUP BY 1, 2
      HAVING SUM(forecast_m0_atualizado) > 0
    ),
    a AS (
      SELECT codigo, filial, SUM(forecast_m0_atualizado)::float8 AS f
        FROM forecast
       WHERE data_snapshot = $1::date
         AND codigo IS NOT NULL AND filial IS NOT NULL
       GROUP BY 1, 2
    ),
    novas AS (
      SELECT b.codigo, b.filial, b.f, b.rota_compra, b.bu,
             (a.codigo IS NULL) AS linha_nova
        FROM b
        LEFT JOIN a ON a.codigo = b.codigo AND a.filial = b.filial
       WHERE COALESCE(a.f, 0) = 0
    ),
    completo AS (
      SELECT n.*,
             p.descricao,
             s.fornecedor,
             COALESCE(${EST_CHAO}, 0)  AS estoque_chao,
             COALESCE(${EST_TOTAL}, 0) AS estoque_total
        FROM novas n
        LEFT JOIN produtos p ON p.codigo = n.codigo
        LEFT JOIN ${simuladorPorCd("s.data_snapshot = $3::date")} s
               ON s.codigo = n.codigo AND s.filial = n.filial
    )`;

  // Cada recorte isolado, para poder ser combinado de formas diferentes. Os
  // `$n` são fixos de propósito: qualquer combinação continua referenciando
  // todos eles, e o Postgres recusa o bind se a instrução declarar menos
  // parâmetros do que a chamada envia.
  const recorteBu = "($4::text IS NULL OR bu = $4)";
  const recorteFornecedor = "($5::text IS NULL OR fornecedor = $5)";
  const recorteProduto =
    "($6::text IS NULL OR codigo = $6 OR descricao ILIKE '%' || $6 || '%')";
  const recorteFilial = "($7::text IS NULL OR filial = $7)";

  const base = `${ctes}
    SELECT * FROM completo
     WHERE ${recorteBu}
       AND ${recorteFornecedor}
       AND ${recorteProduto}
       AND ${recorteFilial}`;

  const argumentos = [
    de,
    ate,
    snapshotPosicao,
    bu,
    fornecedor,
    produto,
    filial,
  ];

  const [facetas, linhas] = await Promise.all([
    // Total e as três listas de opção numa consulta só: `recorte` é lido quatro
    // vezes, então o Postgres o materializa e a base é percorrida uma vez. Uma
    // consulta por lista custaria quatro varreduras desta base a cada clique —
    // e ela já cobrou caro uma vez, quando a data de criação era um `JOIN`.
    prisma.$queryRawUnsafe<{ dim: string; valor: string | null; n: bigint }[]>(
      `${ctes}, recorte AS (SELECT * FROM completo WHERE ${recorteProduto})
       SELECT 'total' AS dim, NULL::text AS valor, COUNT(*)::bigint AS n
         FROM recorte
        WHERE ${recorteBu} AND ${recorteFornecedor} AND ${recorteFilial}
       UNION ALL
       SELECT 'bu', bu, COUNT(*)::bigint
         FROM recorte
        WHERE bu IS NOT NULL AND ${recorteFornecedor} AND ${recorteFilial}
        GROUP BY 2
       UNION ALL
       SELECT 'filial', filial, COUNT(*)::bigint
         FROM recorte
        WHERE ${recorteBu} AND ${recorteFornecedor}
        GROUP BY 2
       UNION ALL
       SELECT 'fornecedor', fornecedor, COUNT(*)::bigint
         FROM recorte
        WHERE fornecedor IS NOT NULL AND ${recorteBu} AND ${recorteFilial}
        GROUP BY 2`,
      ...argumentos,
    ),
    prisma.$queryRawUnsafe<
      {
        codigo: string;
        filial: string;
        descricao: string | null;
        fornecedor: string | null;
        f: number;
        linha_nova: boolean;
        rota_compra: string | null;
        bu: string | null;
        estoque_chao: number;
        estoque_total: number;
        criado_em: Date | null;
      }[]
    >(
      `SELECT x.*,
              (SELECT MIN(f2.data_snapshot)::date
                 FROM forecast f2
                WHERE f2.codigo = x.codigo AND f2.filial = x.filial
                  AND f2.data_snapshot >  $1::date
                  AND f2.data_snapshot <= $2::date
                  AND f2.forecast_m0_atualizado > 0) AS criado_em
         FROM (${base}) x
        -- Maior forecast primeiro: a abertura que mais pesa é a que precisa de
        -- decisão hoje. Sem estoque desempata, porque é a que já nasce rompida.
        ORDER BY x.estoque_chao = 0 DESC, x.f DESC, x.codigo
        LIMIT ${POR_PAGINA} OFFSET ${(Math.max(1, filtro.pagina) - 1) * POR_PAGINA}`,
      ...argumentos,
    ),
  ]);

  const opcoes = (dim: string): OpcaoAbertura[] =>
    facetas
      .filter((f) => f.dim === dim && f.valor !== null)
      .map((f) => ({ valor: f.valor!, aberturas: Number(f.n) }))
      // Alfabética, e não por volume: as listas são curtas e estáveis, e trocar
      // a ordem a cada clique faria procurar o mesmo botão de novo toda vez.
      .sort((a, b) => a.valor.localeCompare(b.valor, "pt-BR"));

  const total = Number(facetas.find((f) => f.dim === "total")?.n ?? 0);
  const bus = opcoes("bu");
  const filiais = opcoes("filial");
  const fornecedores = opcoes("fornecedor").map((f) => f.valor);

  if (linhas.length === 0) {
    return {
      ...vazio,
      total,
      snapshotPosicao,
      bus,
      filiais,
      fornecedores,
      cobertura,
    };
  }

  // Transferências e pedidos só da página visível: carregar os 1.047 da janela
  // inteira para mostrar 20 custaria o mesmo que a tela de produto inteira,
  // vinte vezes.
  const codigos = [...new Set(linhas.map((l) => l.codigo))];
  const [transferencias, pedidos, sla, siglaParaCodigo, parametros] =
    await Promise.all([
      snapshotPosicao
        ? prisma.$queryRawUnsafe<LinhaTransferencia[]>(
            `SELECT id, numero_nf_saida, codigo, descricao_produto,
                    qtde::float8 AS qtde, filial_codigo_saida, filial_codigo_entrada,
                    rota, passo::int AS passo, qtde_passo::int AS qtde_passo, data_emissao
               FROM transferencias_abertas
              WHERE codigo = ANY($1::text[]) AND data_snapshot = $2::date
              ORDER BY data_emissao`,
            codigos,
            snapshotPosicao,
          )
        : Promise.resolve([]),
      snapshotPosicao
        ? prisma.$queryRawUnsafe<
            (Omit<PedidoDaAbertura, "projecao"> & { codigo: string | null })[]
          >(
            `SELECT id, codigo, num_pedido,
                    quantidade_receber::float8 AS quantidade_receber,
                    filial, tp_ped_transf_descricao AS rota, data_emissao, data_pedra,
                    status_logistica, data_agendada, frete
               FROM pedidos_de_compra
              WHERE codigo = ANY($1::text[]) AND data_snapshot = $2::date
                AND quantidade_receber > 0
              ORDER BY data_pedra NULLS LAST`,
            codigos,
            snapshotPosicao,
          )
        : Promise.resolve([]),
      carregarSla(),
      carregarFiliais(),
      lerParametros(),
    ]);

  const dataReferencia = new Date(`${ate}T00:00:00.000Z`);

  // Posicionadas no CD **final** da rota, não no destino da perna atual: é lá
  // que a mercadoria entra no estoque, e é esse CD que a abertura cobra.
  const transfPorPosicao = new Map<string, TransferenciaDaAbertura[]>();
  for (const linha of transferencias) {
    const projecao = projetar({
      rota: linha.rota,
      filialSaida: linha.filial_codigo_saida,
      filialEntrada: linha.filial_codigo_entrada,
      passo: linha.passo,
      dataEmissao: linha.data_emissao,
      siglaParaCodigo,
      sla,
      dataReferencia,
      diasParaVencidas: parametros.diasTransferencias,
    });
    if (!projecao.cdFinal || !linha.codigo) continue;
    const k = `${linha.codigo}|${projecao.cdFinal}`;
    const lista = transfPorPosicao.get(k) ?? [];
    lista.push({ ...linha, projecao });
    transfPorPosicao.set(k, lista);
  }

  const pedidosPorPosicao = new Map<string, PedidoDaAbertura[]>();
  for (const { codigo, ...linha } of pedidos) {
    const projecao = projetarPedido({
      rota: linha.rota,
      filial: linha.filial,
      dataPedra: linha.data_pedra,
      siglaParaCodigo,
      sla,
      dataReferencia,
      diasParaVencidos: parametros.diasPedidos,
    });
    if (!projecao.cdFinal || !codigo) continue;
    const k = `${codigo}|${projecao.cdFinal}`;
    const lista = pedidosPorPosicao.get(k) ?? [];
    lista.push({ ...linha, projecao });
    pedidosPorPosicao.set(k, lista);
  }

  return {
    linhas: linhas.map((l) => ({
      codigo: l.codigo,
      filial: l.filial,
      descricao: l.descricao,
      fornecedor: l.fornecedor,
      forecast: l.f,
      linhaNova: l.linha_nova,
      // Sem carga intermediária a abertura é a própria carga final: foi nela
      // que a previsão apareceu.
      criadoEm: l.criado_em ? iso(l.criado_em) : ate,
      estoqueChao: l.estoque_chao,
      estoqueTotal: l.estoque_total,
      rotaCompra: l.rota_compra,
      bu: l.bu,
      transferencias: transfPorPosicao.get(`${l.codigo}|${l.filial}`) ?? [],
      pedidos: pedidosPorPosicao.get(`${l.codigo}|${l.filial}`) ?? [],
    })),
    total,
    cargas,
    de,
    ate,
    snapshotPosicao,
    bus,
    filiais,
    fornecedores,
    cobertura,
  };
}
