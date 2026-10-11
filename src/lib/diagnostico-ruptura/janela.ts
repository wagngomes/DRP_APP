/**
 * Os fatos de uma janela: o que saiu, o que entrou e quando.
 *
 * É o que alimenta o replay. Carregado uma vez para todas as posições e
 * indexado em memória — o volume medido para sessenta dias é da ordem de 350
 * mil linhas, e perguntar por evento multiplicaria isso por centenas.
 *
 * Só lê.
 */
import { prisma } from "@/lib/prisma";
import type { Chegada } from "./replay";

/** Chave de posição, igual à de `abertura.ts`. */
const chave = (codigo: string, filial: string) => `${codigo}|${filial}`;

export type FatosJanela = {
  /** posição -> data -> unidades vendidas. */
  vendas: Map<string, Map<string, number>>;
  /** posição -> entradas, de compra e de transferência. */
  chegadas: Map<string, Chegada[]>;
};

/**
 * Vendas diárias por posição.
 *
 * De `historico_vendas`, que grava venda como saída com sinal negativo — daí o
 * menos. É a mesma fonte que o raio-X e a aceleração usam; o `vendido_m0` do
 * simulador diverge dela cerca de 20% por item, e o diagnóstico tem de falar a
 * mesma língua das telas em que a pessoa vai conferir.
 */
async function carregarVendas(
  de: string,
  ate: string,
): Promise<Map<string, Map<string, number>>> {
  const linhas = await prisma.$queryRawUnsafe<
    { codigo: string; filial: string; data: Date; qtd: number }[]
  >(
    `SELECT cod_prod AS codigo, filial, data::date AS data,
            SUM(-quantidade)::float8 AS qtd
       FROM historico_vendas
      WHERE cod_prod IS NOT NULL AND filial IS NOT NULL
        AND data >= $1::date AND data <= $2::date
      GROUP BY 1, 2, 3`,
    de,
    ate,
  );

  const mapa = new Map<string, Map<string, number>>();
  for (const l of linhas) {
    const k = chave(l.codigo, l.filial);
    const porDia = mapa.get(k) ?? new Map<string, number>();
    porDia.set(l.data.toISOString().slice(0, 10), l.qtd);
    mapa.set(k, porDia);
  }
  return mapa;
}

/**
 * Entradas de compra, por posição e dia.
 *
 * `recebimento` só tem "1 - COMPRAS" — conferido: é a única definição na
 * tabela inteira. Transferência entre CDs não passa por aqui, e por isso
 * precisa da dedução abaixo.
 */
async function chegadasDeCompra(
  de: string,
  ate: string,
): Promise<{ posicao: string; chegada: Chegada }[]> {
  const linhas = await prisma.$queryRawUnsafe<
    { codigo: string; filial: string; data: Date; qtd: number }[]
  >(
    `SELECT codigo, filial, data::date AS data, SUM(quantidade)::float8 AS qtd
       FROM recebimento
      WHERE codigo IS NOT NULL AND filial IS NOT NULL AND quantidade > 0
        AND data >= $1::date AND data <= $2::date
      GROUP BY 1, 2, 3`,
    de,
    ate,
  );
  return linhas.map((l) => ({
    posicao: chave(l.codigo, l.filial),
    chegada: { data: l.data.toISOString().slice(0, 10), quantidade: l.qtd },
  }));
}

/**
 * Entradas de transferência, deduzidas pelo dia em que a NF some.
 *
 * `transferencias_abertas` lista o que está em trânsito. Não há data de
 * chegada: a mercadoria entrou quando a nota deixou de aparecer na carga.
 *
 * **A dedução tem um limite conhecido, e ele vira ausência e não atraso.** Um
 * dia sem importação adia a chegada aparente em um dia. Por isso a chegada é
 * datada no **snapshot anterior ao sumiço**, e não no dia do sumiço: entre a
 * última carga em que a nota aparece e a primeira em que não aparece, o que se
 * sabe é que ela chegou nesse intervalo. Escolher a ponta de baixo erra para
 * menos quando há buraco; escolher a de cima erraria para mais, e inventaria
 * atraso de logística onde houve falha de importação.
 *
 * Nota que some na última carga da janela fica de fora: pode ter chegado ou
 * pode ser que a janela acabou antes da próxima importação, e não há como
 * distinguir.
 */
async function chegadasDeTransferencia(
  de: string,
  ate: string,
): Promise<{ posicao: string; chegada: Chegada }[]> {
  const linhas = await prisma.$queryRawUnsafe<
    { codigo: string; filial: string; data: Date; qtd: number }[]
  >(
    `WITH cargas AS (
       SELECT DISTINCT data_snapshot::date AS d
         FROM transferencias_abertas
        WHERE data_snapshot >= $1::date AND data_snapshot <= $2::date
     ),
     par AS (SELECT d, LEAD(d) OVER (ORDER BY d) AS proxima FROM cargas),
     -- Uma linha por nota, item e carga.
     notas AS (
       SELECT t.data_snapshot::date AS d,
              t.numero_nf_saida, t.codigo, t.filial_codigo_entrada AS filial,
              SUM(t.qtde)::float8 AS qtd
         FROM transferencias_abertas t
        WHERE t.data_snapshot >= $1::date AND t.data_snapshot <= $2::date
          AND t.codigo IS NOT NULL AND t.filial_codigo_entrada IS NOT NULL
          AND t.numero_nf_saida IS NOT NULL
        GROUP BY 1, 2, 3, 4
     )
     SELECT n.codigo, n.filial, n.d AS data, n.qtd
       FROM notas n
       JOIN par ON par.d = n.d
      WHERE par.proxima IS NOT NULL
        -- Sumiu na carga seguinte: a mercadoria entrou entre as duas.
        AND NOT EXISTS (
          SELECT 1 FROM transferencias_abertas t2
           WHERE t2.data_snapshot::date = par.proxima
             AND t2.numero_nf_saida = n.numero_nf_saida
             AND t2.codigo = n.codigo
             AND t2.filial_codigo_entrada = n.filial
        )`,
    de,
    ate,
  );
  return linhas.map((l) => ({
    posicao: chave(l.codigo, l.filial),
    chegada: { data: l.data.toISOString().slice(0, 10), quantidade: l.qtd },
  }));
}

/** Carrega os fatos da janela: vendas e entradas das duas origens. */
export async function carregarFatos(
  de: string,
  ate: string,
): Promise<FatosJanela> {
  const [vendas, compras, transferencias] = await Promise.all([
    carregarVendas(de, ate),
    chegadasDeCompra(de, ate),
    chegadasDeTransferencia(de, ate),
  ]);

  const chegadas = new Map<string, Chegada[]>();
  for (const { posicao, chegada } of [...compras, ...transferencias]) {
    const lista = chegadas.get(posicao);
    if (lista) lista.push(chegada);
    else chegadas.set(posicao, [chegada]);
  }

  return { vendas, chegadas };
}

/** Um pedido que entrou no CD, com o prazo que levou e o que estava combinado. */
export type Entrega = {
  posicao: string;
  pedido: string | null;
  /** Quando o pedido foi colocado — início do lead time. */
  pedidoEm: string;
  /** Quando entrou no CD. */
  chegouEm: string;
  quantidade: number;
  /** Dias corridos entre a colocação e a entrada. */
  leadReal: number;
};

/**
 * Entregas da janela, com o prazo que cada uma levou.
 *
 * As três datas de `recebimento` significam, conferido contra a própria coluna
 * `lead_time` da tabela — que bate com `data − data_pedido` em 100% das 20.231
 * linhas e com `data_emissao` em 8%:
 *
 *   `data_pedido`   colocação do pedido, início do prazo
 *   `data_emissao`  emissão da NF pelo fornecedor, sempre depois
 *   `data`          entrada no nosso CD, fim do prazo
 *
 * A nomenclatura engana, e por isso a conferência ficou registrada aqui: um
 * `data − data_emissao` pareceria razoável e mediria outra coisa.
 */
export async function carregarEntregas(
  de: string,
  ate: string,
): Promise<Map<string, Entrega[]>> {
  const linhas = await prisma.$queryRawUnsafe<
    {
      codigo: string;
      filial: string;
      pedido: string | null;
      pedido_em: Date;
      chegou_em: Date;
      qtd: number;
      lead: number;
    }[]
  >(
    `SELECT codigo, filial, pedido,
            data_pedido::date AS pedido_em,
            data::date        AS chegou_em,
            SUM(quantidade)::float8 AS qtd,
            MAX(lead_time)::int     AS lead
       FROM recebimento
      WHERE codigo IS NOT NULL AND filial IS NOT NULL
        AND quantidade > 0 AND lead_time IS NOT NULL AND lead_time >= 0
        -- data_pedido é nula em 39% das linhas, mesmo com lead_time
        -- preenchido. Sem ela não há início de prazo, e medir atraso contra
        -- uma data que não existe produziria acusação a partir de nada.
        AND data_pedido IS NOT NULL
        AND data >= $1::date AND data <= $2::date
      GROUP BY 1, 2, 3, 4, 5`,
    de,
    ate,
  );

  const mapa = new Map<string, Entrega[]>();
  for (const l of linhas) {
    const posicao = chave(l.codigo, l.filial);
    const e: Entrega = {
      posicao,
      pedido: l.pedido,
      pedidoEm: l.pedido_em.toISOString().slice(0, 10),
      chegouEm: l.chegou_em.toISOString().slice(0, 10),
      quantidade: l.qtd,
      leadReal: l.lead,
    };
    const lista = mapa.get(posicao);
    if (lista) lista.push(e);
    else mapa.set(posicao, [e]);
  }
  return mapa;
}

/**
 * Lead time cadastrado por fornecedor e CD, e o real medido.
 *
 * Os dois juntos porque a comparação entre eles é o que separa duas causas
 * diferentes: fornecedor que atrasou numa entrega, e cadastro que está errado
 * há meses. Medido nos 228 pares com seis ou mais recebimentos, **56% têm o
 * cadastro abaixo da mediana real** — e há casos de 4 dias cadastrados contra
 * 35 reais, com 23 entregas confirmando.
 */
export type PrazoFornecedor = {
  /** O que está no cadastro. */
  cadastrado: number | null;
  /** Mediana dos prazos de fato cumpridos. */
  realMediano: number | null;
  /** Entregas que sustentam a mediana. */
  entregas: number;
};

export async function carregarPrazos(): Promise<Map<string, PrazoFornecedor>> {
  const linhas = await prisma.$queryRawUnsafe<
    {
      fornecedor: string;
      cd: string;
      cadastrado: number | null;
      real: number | null;
      n: number;
    }[]
  >(
    `WITH real AS (
       SELECT nome_grupo_marca AS fornecedor, filial AS cd,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY lead_time)::float8 AS real,
              count(*)::int AS n
         FROM recebimento
        WHERE lead_time IS NOT NULL AND lead_time >= 0
          AND nome_grupo_marca IS NOT NULL AND filial IS NOT NULL
        GROUP BY 1, 2
     )
     SELECT COALESCE(real.fornecedor, l.fornecedor) AS fornecedor,
            COALESCE(real.cd, l.cd)                 AS cd,
            l.lead_time::float8                     AS cadastrado,
            real.real,
            COALESCE(real.n, 0)                     AS n
       FROM real
       FULL JOIN lead_time_fornecedor l
         ON l.fornecedor = real.fornecedor AND l.cd = real.cd`,
  );

  const mapa = new Map<string, PrazoFornecedor>();
  for (const l of linhas) {
    mapa.set(chave(l.fornecedor, l.cd), {
      cadastrado: l.cadastrado,
      realMediano: l.real,
      entregas: l.n,
    });
  }
  return mapa;
}
