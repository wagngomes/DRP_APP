import { prisma } from "@/lib/prisma";
import {
  COLUNAS_ESTOQUE_CHAO,
  COLUNAS_ESTOQUE_TOTAL,
  COLUNAS_VENDIDO_M0,
  DIAS_NO_MES,
  ROTULO_ARMAZEM,
  somaSql,
  snapshotMensalSql,
} from "@/utils/dias-estoque";
import {
  carregarFiliais,
  carregarSla,
  type LinhaTransferencia,
} from "@/lib/transferencias/consultas";
import { projetar, type Projecao } from "@/utils/projecao-transferencias";
import { projetarPedido, type ProjecaoPedido } from "@/utils/projecao-pedidos";
import { simuladorPorCd } from "@/utils/cds-virtuais";
import {
  FATOR_CLIENTE,
  MESES_BASELINE,
  MINIMO_MESES_HISTORICO,
  MINIMO_UNIDADES_CLIENTE,
} from "@/lib/aceleracao/consultas";

const EST_CHAO = somaSql(COLUNAS_ESTOQUE_CHAO, "s");
const EST_TOTAL = somaSql(COLUNAS_ESTOQUE_TOTAL, "s");
const VENDIDO = somaSql(COLUNAS_VENDIDO_M0, "s");

export type ResumoMensal = {
  /** Plano de compra do mês. */
  plano: number;
  /** Pedidos de compra ainda a receber, emitidos no mês. */
  emAberto: number;
  /** Já recebido no mês, de pedidos do próprio mês. */
  recebido: number;
  /** plano − emAberto − recebido. */
  saldo: number;
};

export type TransferenciaChegando = LinhaTransferencia & { projecao: Projecao };

/** Pedido de compra do snapshot do dia, com a projeção de chegada. */
export type PedidoChegando = {
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

/** Quantidade de um armazém dentro do estoque chão. */
export type EstoqueArmazem = { rotulo: string; quantidade: number };

/** Venda de um mês anterior, vinda das colunas m_1..m_4 do forecast. */
export type VendaMes = { rotulo: string; quantidade: number | null };

/**
 * Cliente que comprou fora do próprio padrão **neste CD**.
 *
 * Mesma régua da tela de aceleração — mesma janela do mês, mínimo de meses com
 * histórico e fator sobre a mediana — reusando as constantes de lá, para as
 * duas telas nunca discordarem sobre o que é "fora do padrão".
 */
export type ClienteAcelerando = {
  cnpj: string;
  cliente: string;
  /** Comprado na janela do mês corrente, neste CD. */
  atual: number;
  /** Mediana do próprio cliente na mesma janela dos meses anteriores. */
  mediana: number;
  excedente: number;
};

export type PosicaoFilial = {
  filial: string;
  estoqueChao: number;
  /** Abertura do estoque chão por armazém, na ordem das colunas de origem. */
  armazens: EstoqueArmazem[];
  estoqueTotal: number;
  /**
   * Clientes fora do padrão neste CD, quando há. Vazio não significa "não
   * houve": os CDs virtuais nunca terão, porque o histórico de vendas não
   * separa o armazém 11.
   */
  clientesAcelerando: ClienteAcelerando[];
  /** Vendas do mês corrente nesta filial (simulador). */
  vendidoMes: number;
  /** Pedidos de compra em aberto com destino a esta filial. */
  comprasEmAberto: number;
  /** Rota de compra do produto para esta filial (guia forecast). */
  rotaCompra: string | null;
  forecastM0: number | null;
  /** Histórico de vendas dos 4 meses anteriores, do mais antigo ao mais recente. */
  historico: VendaMes[];
  diasChao: number | null;
  diasTotal: number | null;
  /** Transferências cujo CD final é esta filial. */
  transferencias: TransferenciaChegando[];
  /** Pedidos de compra cujo destino final é esta filial. */
  pedidos: PedidoChegando[];
};

export type DetalheProduto = {
  codigo: string;
  descricao: string | null;
  marca: string | null;
  grupo: string | null;
  unidade: string | null;
  /** Se o item exige cadeia fria, conforme o cadastro de produtos. */
  refrigeracao: Refrigeracao;
  resumo: ResumoMensal;
  /** Posição consolidada entre todos os CDs, como se a rede fosse um armazém só. */
  cia: PosicaoFilial;
  filiais: PosicaoFilial[];
  /** Meses (yyyy-mm) que têm movimento, para orientar quando o mês está vazio. */
  mesesComDados: string[];
};

/**
 * Como a coluna `usa_refrig` deve ser lida.
 *
 * A base tem quatro valores: "S" (3.441 itens), "N" (47.777), "2" (2.321) e
 * nulo (103). O "2" não é um terceiro estado de refrigeração — concentra em
 * "PRODUTO PARA SAUDE" e "NUTRICAO", com meias, seringas e chupetas. É código
 * de outra coisa que veio parar nessa coluna.
 *
 * Então só "S" afirma refrigerado, só "N" afirma que não, e o resto é
 * desconhecido. Tratar "2" como "não" seria uma afirmação sem respaldo sobre
 * cadeia fria — e é justamente o tipo de erro que só aparece quando o produto
 * chega estragado.
 */
export type Refrigeracao = "sim" | "nao" | "desconhecido";

export function lerRefrigeracao(valor: string | null | undefined): Refrigeracao {
  const v = valor?.trim().toUpperCase();
  if (v === "S") return "sim";
  if (v === "N") return "nao";
  return "desconhecido";
}

function limitesDoMes(data: string): [string, string] {
  const [ano, mes] = data.split("-").map(Number);
  return [
    new Date(Date.UTC(ano, mes - 1, 1)).toISOString().slice(0, 10),
    new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10),
  ];
}

/** Busca por código exato ou trecho da descrição. */
export async function buscarProdutos(termo: string, limite = 40) {
  const t = termo.trim();
  if (!t) return [];
  return prisma.$queryRawUnsafe<
    {
      codigo: string;
      descricao: string | null;
      marca: string | null;
      usa_refrig: string | null;
    }[]
  >(
    `SELECT codigo, descricao, marca, usa_refrig
       FROM produtos
      WHERE codigo = $1 OR descricao ILIKE '%' || $1 || '%'
      ORDER BY (codigo = $1) DESC, descricao
      LIMIT ${limite}`,
    t
  );
}

/**
 * Produtos com posição na data de referência, para a tela abrir já com algo
 * clicável em vez de uma busca vazia. Ordenados pelo estoque valorizado, que é
 * o critério que mais aproxima "produto que importa".
 */
export async function listarProdutosComDados(data: string, limite = 50) {
  return prisma.$queryRawUnsafe<
    {
      codigo: string;
      descricao: string | null;
      marca: string | null;
      usa_refrig: string | null;
      filiais: number;
      estoque: number;
    }[]
  >(
    `SELECT s.codigo,
            MIN(p.descricao) AS descricao,
            MIN(p.marca)     AS marca,
            MIN(p.usa_refrig) AS usa_refrig,
            COUNT(DISTINCT s.filial)::int AS filiais,
            SUM(${EST_CHAO} * COALESCE(s.cmv_unitario,0))::float8 AS estoque
       FROM ${simuladorPorCd("s.data_snapshot = $1::date")} s
       LEFT JOIN produtos p ON p.codigo = s.codigo
      WHERE s.data_snapshot = $1::date
      GROUP BY s.codigo
      ORDER BY estoque DESC
      LIMIT ${limite}`,
    data
  );
}

export async function carregarDetalheProduto(
  codigo: string,
  data: string,
  parametros: { diasTransferencias: number; diasPedidos: number }
): Promise<DetalheProduto | null> {
  const [inicioMes, proximoMes] = limitesDoMes(data);

  const produto = await prisma.produtos.findUnique({
    where: { codigo },
    select: {
      codigo: true,
      descricao: true,
      marca: true,
      grupo: true,
      unidade: true,
      usa_refrig: true,
    },
  });
  if (!produto) return null;

  const [
    resumoLinhas,
    estoqueLinhas,
    comprasLinhas,
    forecastLinhas,
    transferenciasLinhas,
    pedidosLinhas,
    mesesLinhas,
    sla,
    siglaParaCodigo,
    clientesLinhas,
  ] = await Promise.all([
    // Os três números do mês numa consulta só. Sem deduplicar plano_compra e
    // sem excluir pedidos já recebidos: é a leitura literal da regra definida.
    prisma.$queryRawUnsafe<{ plano: number; em_aberto: number; recebido: number }[]>(
      `SELECT
         COALESCE((SELECT SUM(plano_de_compra) FROM plano_compra
                    WHERE codigo = $1 AND data_snapshot >= $2::date AND data_snapshot < $3::date
                      AND ${snapshotMensalSql("plano_compra", "plano_compra", "$4")}), 0)::float8 AS plano,
         COALESCE((SELECT SUM(quantidade_receber) FROM pedidos_de_compra
                    WHERE codigo = $1 AND quantidade_receber > 0
                      AND data_snapshot = $4::date
                      AND data_emissao >= $2::date AND data_emissao < $3::date), 0)::float8 AS em_aberto,
         COALESCE((SELECT SUM(quantidade) FROM recebimento
                    WHERE codigo = $1
                      AND data_pedido >= $2::date AND data_pedido < $3::date
                      AND data       >= $2::date AND data       < $3::date), 0)::float8 AS recebido`,
      codigo,
      inicioMes,
      proximoMes,
      data
    ),
    prisma.$queryRawUnsafe<
      ({ filial: string; chao: number; total: number; vendido: number } &
        Record<string, number>)[]
    >(
      `SELECT filial,
              SUM(${EST_CHAO})::float8  AS chao,
              SUM(${EST_TOTAL})::float8 AS total,
              SUM(${VENDIDO})::float8 AS vendido,
              ${COLUNAS_ESTOQUE_CHAO.map((c) => `SUM(COALESCE(s.${c},0))::float8 AS "${c}"`).join(", ")}
         FROM ${simuladorPorCd("s.data_snapshot = $2::date")} s
        WHERE codigo = $1 AND data_snapshot = $2::date AND filial IS NOT NULL
        GROUP BY filial`,
      codigo,
      data
    ),
    prisma.$queryRawUnsafe<{ filial: string; qtd: number }[]>(
      /* Snapshot do dia além do mês de emissão: a tabela é cumulativa e sem
         isso o mesmo pedido soma uma vez por importação. */
      `SELECT filial, SUM(quantidade_receber)::float8 AS qtd
         FROM pedidos_de_compra
        WHERE codigo = $1 AND quantidade_receber > 0
          AND data_snapshot = $4::date
          AND data_emissao >= $2::date AND data_emissao < $3::date
          AND filial IS NOT NULL
        GROUP BY filial`,
      codigo,
      inicioMes,
      proximoMes,
      data
    ),
    prisma.$queryRawUnsafe<
      {
        filial: string;
        rota_compra: string | null;
        forecast_m0: number;
        m_1: number | null;
        m_2: number | null;
        m_3: number | null;
        m_4: number | null;
      }[]
    >(
      `SELECT filial, rota_compra, forecast_m0::float8 AS forecast_m0,
              m_1::float8 AS m_1, m_2::float8 AS m_2,
              m_3::float8 AS m_3, m_4::float8 AS m_4
         FROM forecast f
        WHERE f.codigo = $1 AND f.data_snapshot >= $2::date AND f.data_snapshot < $3::date
          AND ${snapshotMensalSql("forecast", "f", "$4")}
          AND f.filial IS NOT NULL`,
      codigo,
      inicioMes,
      proximoMes,
      data
    ),
    prisma.$queryRawUnsafe<LinhaTransferencia[]>(
      `SELECT id, numero_nf_saida, codigo, descricao_produto, qtde::float8 AS qtde,
              filial_codigo_saida, filial_codigo_entrada, rota,
              passo::int AS passo, qtde_passo::int AS qtde_passo, data_emissao
         FROM transferencias_abertas
        WHERE codigo = $1 AND data_snapshot = $2::date
        ORDER BY data_emissao`,
      codigo,
      data
    ),
    prisma.$queryRawUnsafe<Omit<PedidoChegando, "projecao">[]>(
      `SELECT id, num_pedido, quantidade_receber::float8 AS quantidade_receber,
              filial, tp_ped_transf_descricao AS rota, data_emissao, data_pedra,
              status_logistica, data_agendada, frete
         FROM pedidos_de_compra
        WHERE codigo = $1 AND data_snapshot = $2::date AND quantidade_receber > 0
        ORDER BY data_pedra NULLS LAST`,
      codigo,
      data
    ),
    prisma.$queryRawUnsafe<{ mes: string }[]>(
      `SELECT DISTINCT to_char(data_emissao, 'YYYY-MM') AS mes
         FROM pedidos_de_compra WHERE codigo = $1 AND data_emissao IS NOT NULL
        UNION
       SELECT DISTINCT to_char(data, 'YYYY-MM') FROM recebimento
        WHERE codigo = $1 AND data IS NOT NULL
        ORDER BY 1 DESC`,
      codigo
    ),
    carregarSla(),
    carregarFiliais(),
    // Clientes fora do padrão por CD. Entra no mesmo `Promise.all` de propósito:
    // executa em ~5 ms no servidor e é mais rápida que as que já estão aqui, então
    // não acrescenta tempo perceptível ao carregamento da página.
    prisma.$queryRawUnsafe<
      { filial: string; cnpj: string; nome: string; atual: number; med: number }[]
    >(
      // A janela de comparação é resolvida dentro da própria consulta, e não
      // numa chamada antes: buscá-la à parte custava uma ida e voltar serial
      // (~130 ms) que atrasava a página inteira, já que o `Promise.all` só
      // começa depois. Aqui ela é um InitPlan, calculado uma vez.
      `WITH ref AS (
         SELECT MAX(data) AS ultima FROM historico_vendas
       ),
       limites AS (
         SELECT extract(day FROM ultima)::int AS dia_corte,
                to_char(ultima, 'YYYY-MM') AS mes_corrente,
                (date_trunc('month', ultima) - interval '${MESES_BASELINE} months')::date AS inicio
           FROM ref
       ),
       janela AS (
         SELECT h.filial, h.cnpj, MIN(h.nome) AS nome,
                to_char(h.data, 'YYYY-MM') AS mes,
                SUM(-h.quantidade)::float8 AS qtd
           FROM historico_vendas h, limites l
          WHERE h.cod_prod = $1
            AND h.cnpj IS NOT NULL AND h.filial IS NOT NULL
            AND h.data >= l.inicio
            AND extract(day FROM h.data) <= l.dia_corte
          GROUP BY 1, 2, 4
       ),
       comparado AS (
         SELECT j.filial, j.cnpj, MIN(j.nome) AS nome,
                SUM(j.qtd) FILTER (WHERE j.mes = l.mes_corrente) AS atual,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY j.qtd)
                  FILTER (WHERE j.mes < l.mes_corrente) AS med,
                COUNT(*) FILTER (WHERE j.mes < l.mes_corrente) AS meses
           FROM janela j, limites l GROUP BY 1, 2
       )
       SELECT filial, cnpj, nome, atual::float8, med::float8
         FROM comparado
        WHERE atual IS NOT NULL AND med > 0
          AND meses >= ${MINIMO_MESES_HISTORICO}
          AND atual >= ${MINIMO_UNIDADES_CLIENTE}
          AND atual >= med * ${FATOR_CLIENTE}
        ORDER BY filial, (atual - med) DESC`,
      codigo
    ),
  ]);

  // Agrupa por CD para o card de cada filial receber só os seus.
  const clientesPorFilial = new Map<string, ClienteAcelerando[]>();
  for (const l of clientesLinhas) {
    const lista = clientesPorFilial.get(l.filial) ?? [];
    lista.push({
      cnpj: l.cnpj,
      cliente: l.nome,
      atual: l.atual,
      mediana: l.med,
      excedente: l.atual - l.med,
    });
    clientesPorFilial.set(l.filial, lista);
  }

  const bruto = resumoLinhas[0] ?? { plano: 0, em_aberto: 0, recebido: 0 };
  const resumo: ResumoMensal = {
    plano: bruto.plano,
    emAberto: bruto.em_aberto,
    recebido: bruto.recebido,
    saldo: bruto.plano - bruto.em_aberto - bruto.recebido,
  };

  // As transferências são posicionadas no CD final da rota, não no destino da
  // perna atual: é lá que o produto efetivamente entra no estoque.
  const dataReferencia = new Date(`${data}T00:00:00.000Z`);
  const projetadas: TransferenciaChegando[] = transferenciasLinhas.map((linha) => ({
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
      diasParaVencidas: parametros.diasTransferencias,
    }),
  }));

  const pedidosProjetados: PedidoChegando[] = pedidosLinhas.map((linha) => ({
    ...linha,
    projecao: projetarPedido({
      rota: linha.rota,
      filial: linha.filial,
      dataPedra: linha.data_pedra,
      siglaParaCodigo,
      sla,
      dataReferencia,
      diasParaVencidos: parametros.diasPedidos,
    }),
  }));

  const filiais = new Map<string, PosicaoFilial>();
  const obter = (filial: string): PosicaoFilial => {
    let atual = filiais.get(filial);
    if (!atual) {
      atual = {
        filial,
        estoqueChao: 0,
        armazens: [],
        estoqueTotal: 0,
        // Já resolvido na criação da posição: o card só precisa ler.
        clientesAcelerando: clientesPorFilial.get(filial) ?? [],
        vendidoMes: 0,
        comprasEmAberto: 0,
        pedidos: [],
        rotaCompra: null,
        forecastM0: null,
        historico: [
          { rotulo: "M-4", quantidade: null },
          { rotulo: "M-3", quantidade: null },
          { rotulo: "M-2", quantidade: null },
          { rotulo: "M-1", quantidade: null },
        ],
        diasChao: null,
        diasTotal: null,
        transferencias: [],
      };
      filiais.set(filial, atual);
    }
    return atual;
  };

  for (const e of estoqueLinhas) {
    const f = obter(e.filial);
    f.estoqueChao = e.chao;
    f.estoqueTotal = e.total;
    f.vendidoMes = e.vendido;
    f.armazens = COLUNAS_ESTOQUE_CHAO.map((coluna) => ({
      rotulo: ROTULO_ARMAZEM[coluna],
      quantidade: Number(e[coluna] ?? 0),
    }));
  }
  for (const c of comprasLinhas) obter(c.filial).comprasEmAberto = c.qtd;
  for (const fo of forecastLinhas) {
    const f = obter(fo.filial);
    f.rotaCompra = fo.rota_compra;
    f.forecastM0 = fo.forecast_m0;
    // Do mais antigo ao mais recente: lido da esquerda para a direita, o
    // histórico forma a tendência que desemboca no forecast do mês.
    f.historico = [
      { rotulo: "M-4", quantidade: fo.m_4 },
      { rotulo: "M-3", quantidade: fo.m_3 },
      { rotulo: "M-2", quantidade: fo.m_2 },
      { rotulo: "M-1", quantidade: fo.m_1 },
    ];
  }
  for (const t of projetadas) {
    if (t.projecao.cdFinal) obter(t.projecao.cdFinal).transferencias.push(t);
  }
  // Pedido roteado entra no destino final da rota, não na filial de origem —
  // mesma regra das transferências.
  for (const pe of pedidosProjetados) {
    if (pe.projecao.cdFinal) obter(pe.projecao.cdFinal).pedidos.push(pe);
  }

  for (const f of filiais.values()) {
    if (f.forecastM0 && f.forecastM0 > 0) {
      const consumoDiario = f.forecastM0 / DIAS_NO_MES;
      f.diasChao = f.estoqueChao / consumoDiario;
      f.diasTotal = f.estoqueTotal / consumoDiario;
    }
  }

  const lista = [...filiais.values()].sort((a, b) => b.estoqueChao - a.estoqueChao);

  return {
    ...produto,
    refrigeracao: lerRefrigeracao(produto.usa_refrig),
    resumo,
    cia: consolidar(lista),
    filiais: lista,
    mesesComDados: mesesLinhas.map((m) => m.mes),
  };
}

/**
 * Junta as posições de todas as filiais em uma só.
 *
 * Os dias de cobertura são recalculados sobre os totais, e não pela média das
 * filiais: um CD sem estoque e outro abastecido resultam numa cobertura de rede
 * que nenhuma das duas leituras isoladas mostra.
 *
 * Pedidos e transferências não são copiados — já aparecem detalhados no CD de
 * destino, e repeti-los aqui só duplicaria a leitura.
 */
function consolidar(filiais: PosicaoFilial[]): PosicaoFilial {
  const somar = (fn: (f: PosicaoFilial) => number) =>
    filiais.reduce((total, f) => total + fn(f), 0);

  const estoqueChao = somar((f) => f.estoqueChao);
  const estoqueTotal = somar((f) => f.estoqueTotal);
  const forecastM0 = filiais.some((f) => f.forecastM0 !== null)
    ? somar((f) => f.forecastM0 ?? 0)
    : null;

  // Os rótulos de armazém e de mês são os mesmos em todas as filiais; a soma
  // acompanha a ordem da primeira que tiver dados.
  const modelo = filiais.find((f) => f.armazens.length > 0);
  const armazens = (modelo?.armazens ?? []).map((a, i) => ({
    rotulo: a.rotulo,
    quantidade: somar((f) => f.armazens[i]?.quantidade ?? 0),
  }));

  const historico = (filiais[0]?.historico ?? []).map((h, i) => {
    const temValor = filiais.some((f) => f.historico[i]?.quantidade !== null);
    return {
      rotulo: h.rotulo,
      quantidade: temValor ? somar((f) => f.historico[i]?.quantidade ?? 0) : null,
    };
  });

  const consumoDiario = forecastM0 && forecastM0 > 0 ? forecastM0 / DIAS_NO_MES : null;

  // Na linha Cia o mesmo cliente pode ter comprado de mais de um CD: soma as
  // parcelas em vez de repetir o nome. Sem isto o card consolidado apareceria
  // acelerado e sem nenhum cliente para explicar.
  const clientesCia = new Map<string, ClienteAcelerando>();
  for (const f of filiais) {
    for (const c of f.clientesAcelerando) {
      const atual = clientesCia.get(c.cnpj);
      if (atual) {
        atual.atual += c.atual;
        atual.mediana += c.mediana;
        atual.excedente += c.excedente;
      } else {
        clientesCia.set(c.cnpj, { ...c });
      }
    }
  }

  return {
    filial: "Cia",
    estoqueChao,
    armazens,
    estoqueTotal,
    clientesAcelerando: [...clientesCia.values()].sort((a, b) => b.excedente - a.excedente),
    vendidoMes: somar((f) => f.vendidoMes),
    comprasEmAberto: somar((f) => f.comprasEmAberto),
    rotaCompra: null,
    forecastM0,
    historico,
    diasChao: consumoDiario ? estoqueChao / consumoDiario : null,
    diasTotal: consumoDiario ? estoqueTotal / consumoDiario : null,
    // Somados só para os totais dos tiles; o detalhe fica nos cards das filiais.
    transferencias: filiais.flatMap((f) => f.transferencias),
    pedidos: filiais.flatMap((f) => f.pedidos),
  };
}
