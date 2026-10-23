/**
 * Os sinais que só a árvore pede.
 *
 * O motor contrafactual mede dias evitados; a árvore responde "qual foi", e
 * para isso precisa de seis fatos que nenhuma outra parte do sistema carrega:
 * o plano e a compra do **mês anterior**, o pedido do ciclo, o saldo do plano
 * **na data limite**, o pedido que sumiu sem recebimento e o percurso interno
 * das triangulações.
 *
 * Tudo em consultas agregadas, uma por sinal, carregadas uma vez por rodada —
 * nunca por posição. São ~5.700 posições por snapshot, e perguntar uma a uma é
 * o padrão que já custou 23 segundos noutra tela desta base.
 *
 * Só lê. Nenhuma base é alterada e nenhuma consulta existente é tocada.
 */
import { prisma } from "@/lib/prisma";
import { carregarFiliais, carregarSla } from "@/lib/transferencias/consultas";
import { limitesDoMes } from "@/utils/mes";
import { parseRota, projetar } from "@/utils/projecao-transferencias";
import { chave } from "./abertura";
import { LIMITES } from "./parametros";

/** Os limites do mês anterior ao da data. */
function mesAnteriorDe(data: string): { inicio: string; fim: string } {
  const [ano, mes] = data.slice(0, 7).split("-").map(Number);
  const anterior = new Date(Date.UTC(ano, mes - 2, 1))
    .toISOString()
    .slice(0, 10);
  return limitesDoMes(anterior);
}

/**
 * O último snapshot que existe até a data, para as bases cumulativas.
 *
 * Subconsulta e não parâmetro: o Postgres resolve uma vez. Um
 * `data_snapshot = $data` seria mais simples e devolveria zero linhas sempre
 * que a data de referência caísse num dia sem importação — sábado, feriado,
 * dia em que a carga falhou.
 */
function ultimoSnapshotSql(tabela: string, param: string): string {
  return `(SELECT MAX(data_snapshot) FROM ${tabela} WHERE data_snapshot <= ${param}::date)`;
}

// ---------------------------------------------------------------------------
// 1. Plano de compra do mês anterior
// ---------------------------------------------------------------------------

/**
 * Plano do mês anterior, por código.
 *
 * Responde A2 e A3: o mês abriu descoberto — havia plano no mês que o
 * abasteceria, e ele cobria a necessidade? Sem isso a árvore pára na abertura
 * e devolve "abertura descoberta" sem dizer onde a falha aconteceu.
 *
 * Só o plano, e não o saldo: `carregarSaldoPlano` serve o mês corrente e
 * resolveria isto com a data deslocada, mas custa duas subconsultas
 * correlacionadas sobre o mês inteiro para devolver dois números que esta
 * pergunta não usa.
 */
export type PlanoDoMesAnterior = {
  /** Quantidade planejada por código. */
  porCodigo: Map<string, number>;
  /**
   * Houve carga de `plano_compra` naquele mês.
   *
   * A distinção que separa duas respostas opostas para a mesma ausência: sem
   * carga nenhuma, não se sabe se havia plano; **com** carga, o item que não
   * aparece nela simplesmente não tinha plano — e isso é fato, não falta de
   * dado. Era a mesma confusão que o nó B3 já tinha resolvido para pedidos, e
   * que aqui mandava todo o ramo da abertura para "indefinida".
   */
  houveCarga: boolean;
};

export async function planoDoMesAnterior(
  data: string,
): Promise<PlanoDoMesAnterior> {
  const { inicio, fim } = mesAnteriorDe(data);

  const linhas = await prisma.$queryRawUnsafe<
    { codigo: string; plano: number }[]
  >(
    `SELECT codigo, SUM(plano_de_compra)::float8 AS plano
       FROM plano_compra
      WHERE codigo IS NOT NULL
        AND data_snapshot = (
              SELECT MAX(data_snapshot) FROM plano_compra
               WHERE data_snapshot >= $1::date AND data_snapshot < $2::date
            )
      GROUP BY 1`,
    inicio,
    fim,
  );

  return {
    porCodigo: new Map(linhas.map((l) => [l.codigo, l.plano])),
    // Linha devolvida é carga existente: a consulta já recorta pela última
    // importação daquele mês, então zero linhas significa mês sem carga.
    houveCarga: linhas.length > 0,
  };
}

// ---------------------------------------------------------------------------
// 2. A compra do mês anterior chegou no prazo
// ---------------------------------------------------------------------------

/** Como a compra do mês anterior cumpriu o prazo, numa posição. */
export type CompraMesAnterior = {
  entregas: number;
  /** Entregas que estouraram o prazo cadastrado do par fornecedor × CD. */
  atrasadas: number;
  /** Entregas em que havia prazo cadastrado para comparar. */
  comPrazo: number;
  /** Maior atraso em dias, para a evidência da tela. */
  piorAtraso: number;
};

/**
 * Como a compra do mês anterior cumpriu o prazo, por item × CD.
 *
 * Responde A4. A janela é pela **colocação** (`data_pedido` no mês anterior) e
 * não pela entrada: a pergunta é se o que foi comprado para abrir este mês
 * chegou a tempo, e um pedido colocado em agosto que entrou em setembro é
 * justamente o caso que interessa.
 *
 * Posições sem prazo cadastrado ficam fora do mapa, e a árvore responde "sem
 * dado" em vez de absolver ou acusar o fornecedor por omissão do cadastro.
 */
export async function compraDoMesAnterior(
  data: string,
): Promise<Map<string, CompraMesAnterior>> {
  const { inicio, fim } = mesAnteriorDe(data);

  const linhas = await prisma.$queryRawUnsafe<
    {
      codigo: string;
      filial: string;
      entregas: number;
      atrasadas: number;
      com_prazo: number;
      pior: number | null;
    }[]
  >(
    `WITH ent AS (
       SELECT r.codigo,
              r.filial,
              r.lead_time::float8 AS lead,
              l.lead_time::float8 AS cadastrado
         FROM recebimento r
         LEFT JOIN lead_time_fornecedor l
           ON l.fornecedor = r.nome_grupo_marca AND l.cd = r.filial
        WHERE r.codigo IS NOT NULL AND r.filial IS NOT NULL
          AND r.quantidade > 0
          AND r.lead_time IS NOT NULL AND r.lead_time >= 0
          -- data_pedido e nula em 39% das linhas, mesmo com lead_time
          -- preenchido; sem ela nao ha inicio de prazo para recortar o mes.
          AND r.data_pedido IS NOT NULL
          AND r.data_pedido >= $1::date AND r.data_pedido < $2::date
     )
     SELECT codigo,
            filial,
            count(*)::int          AS entregas,
            count(cadastrado)::int AS com_prazo,
            count(*) FILTER (
              WHERE cadastrado IS NOT NULL AND lead > cadastrado + $3::float8
            )::int                 AS atrasadas,
            MAX(lead - cadastrado)::float8 AS pior
       FROM ent
      GROUP BY 1, 2`,
    inicio,
    fim,
    LIMITES.diasTolerenciaPedido,
  );

  const mapa = new Map<string, CompraMesAnterior>();
  for (const l of linhas) {
    if (l.com_prazo === 0) continue;
    mapa.set(chave(l.codigo, l.filial), {
      entregas: l.entregas,
      atrasadas: l.atrasadas,
      comPrazo: l.com_prazo,
      piorAtraso: l.pior ?? 0,
    });
  }
  return mapa;
}

// ---------------------------------------------------------------------------
// 3. O pedido do ciclo
// ---------------------------------------------------------------------------

/** O pedido de compra que deveria ter coberto a ruptura. */
export type PedidoDoCiclo = {
  /** Primeira emissão do mês para a posição — quando a compra agiu. */
  emitidoEm: string;
  /** Quantidade pedida, somada nas linhas do mês. */
  quantidade: number;
  /** O que ainda falta entrar. */
  aReceber: number;
  numPedido: string | null;
  /** Alguma linha percorre rota entre CDs. */
  triangulado: boolean;
  /** Chegada prevista pela operação, quando informada. */
  dataPedra: string | null;
};

/**
 * Os pedidos de compra do mês, por item × CD de destino.
 *
 * Responde B3, B4 e T1 de uma vez — e por isso é uma consulta só.
 *
 * O CD é `rota_final` com queda para `filial`: pedido triangulado é colocado
 * numa filial e entregue noutra, e a ruptura que ele cobre é a do destino
 * final. É a mesma regra da projeção de pedidos de compra, para as duas telas
 * não divergirem sobre onde a quantidade chega.
 *
 * A emissão é a **menor** do mês: B3 pergunta quando a compra agiu primeiro, e
 * uma reposição colocada depois não absolve o atraso da primeira. A quantidade
 * é a soma, porque a necessidade é coberta pelo conjunto.
 */
export async function pedidosDoCiclo(
  data: string,
): Promise<Map<string, PedidoDoCiclo>> {
  const { inicio, fim } = limitesDoMes(data);

  const linhas = await prisma.$queryRawUnsafe<
    {
      codigo: string;
      cd: string;
      emitido_em: Date;
      quantidade: number;
      a_receber: number;
      num_pedido: string | null;
      triangulado: boolean;
      data_pedra: Date | null;
    }[]
  >(
    `SELECT codigo,
            COALESCE(NULLIF(trim(rota_final), ''), filial) AS cd,
            MIN(data_emissao)::date AS emitido_em,
            SUM(COALESCE(quantidade_total, 0))::float8   AS quantidade,
            SUM(COALESCE(quantidade_receber, 0))::float8 AS a_receber,
            MIN(num_pedido) AS num_pedido,
            bool_or(
              tp_ped_transf_descricao IS NOT NULL
              AND upper(trim(tp_ped_transf_descricao)) NOT IN ('N/A', '-', '')
            ) AS triangulado,
            MIN(data_pedra)::date AS data_pedra
       FROM pedidos_de_compra
      WHERE data_snapshot = ${ultimoSnapshotSql("pedidos_de_compra", "$3")}
        AND codigo IS NOT NULL
        AND COALESCE(NULLIF(trim(rota_final), ''), filial) IS NOT NULL
        AND data_emissao >= $1::date AND data_emissao < $2::date
      GROUP BY 1, 2`,
    inicio,
    fim,
    data,
  );

  const mapa = new Map<string, PedidoDoCiclo>();
  for (const l of linhas) {
    mapa.set(chave(l.codigo, l.cd), {
      emitidoEm: l.emitido_em.toISOString().slice(0, 10),
      quantidade: l.quantidade,
      aReceber: l.a_receber,
      numPedido: l.num_pedido,
      triangulado: l.triangulado,
      dataPedra: l.data_pedra?.toISOString().slice(0, 10) ?? null,
    });
  }
  return mapa;
}

// ---------------------------------------------------------------------------
// 4. Saldo do plano na data limite
// ---------------------------------------------------------------------------

/** O plano do mês e o que foi consumindo dele, dia a dia. */
export type MovimentoPlano = {
  plano: number;
  /** Colocações por dia de emissão. */
  colocado: { data: string; quantidade: number }[];
  /** Entradas por dia de chegada. */
  recebido: { data: string; quantidade: number }[];
};

/**
 * O plano do mês com o movimento diário, para o saldo ser calculável em
 * qualquer data.
 *
 * `carregarSaldoPlano` já devolve plano, aberto, recebido e saldo — mas do mês
 * **inteiro**, e B3a pergunta outra coisa: havia saldo *na data limite*, que é
 * anterior. Usar o saldo do mês ali seria circular, porque o próprio pedido
 * atrasado entra no "aberto" e faz parecer que a verba já estava comprometida
 * quando a decisão de comprar precisava ser tomada.
 *
 * Duas consultas e nenhuma por data: o movimento vem inteiro e `saldoEm`
 * recorta. Cada evento tem uma data limite diferente — uma consulta por
 * evento seriam centenas.
 */
export async function movimentoDoPlano(
  data: string,
): Promise<Map<string, MovimentoPlano>> {
  const { inicio, fim } = limitesDoMes(data);

  const [planos, movimento] = await Promise.all([
    prisma.$queryRawUnsafe<{ codigo: string; plano: number }[]>(
      `SELECT codigo, SUM(plano_de_compra)::float8 AS plano
         FROM plano_compra
        WHERE codigo IS NOT NULL
          AND data_snapshot = (
                SELECT MAX(data_snapshot) FROM plano_compra
                 WHERE data_snapshot >= $1::date AND data_snapshot < $2::date
              )
        GROUP BY 1`,
      inicio,
      fim,
    ),
    prisma.$queryRawUnsafe<
      { codigo: string; tipo: string; dia: Date; quantidade: number }[]
    >(
      // Colocação e recebimento no mesmo resultado: são a mesma série
      // temporal vista de dois lados, e separá-las custaria uma ida a mais ao
      // banco para montar o mesmo mapa.
      `SELECT codigo, 'colocado' AS tipo, data_emissao::date AS dia,
              SUM(COALESCE(quantidade_receber, 0))::float8 AS quantidade
         FROM pedidos_de_compra
        WHERE codigo IS NOT NULL
          AND data_snapshot = ${ultimoSnapshotSql("pedidos_de_compra", "$3")}
          AND data_emissao >= $1::date AND data_emissao < $2::date
        GROUP BY 1, 2, 3
       UNION ALL
       SELECT codigo, 'recebido' AS tipo, data::date AS dia,
              SUM(COALESCE(quantidade, 0))::float8 AS quantidade
         FROM recebimento
        WHERE codigo IS NOT NULL
          AND data_pedido >= $1::date AND data_pedido < $2::date
          AND data >= $1::date AND data < $2::date
        GROUP BY 1, 2, 3`,
      inicio,
      fim,
      data,
    ),
  ]);

  const mapa = new Map<string, MovimentoPlano>();
  const obter = (codigo: string) => {
    let m = mapa.get(codigo);
    if (!m) {
      m = { plano: 0, colocado: [], recebido: [] };
      mapa.set(codigo, m);
    }
    return m;
  };

  for (const l of planos) obter(l.codigo).plano = l.plano;
  for (const l of movimento) {
    const m = obter(l.codigo);
    const ponto = {
      data: l.dia.toISOString().slice(0, 10),
      quantidade: l.quantidade,
    };
    if (l.tipo === "colocado") m.colocado.push(ponto);
    else m.recebido.push(ponto);
  }
  return mapa;
}

/**
 * Saldo do plano numa data: plano do mês menos o que já havia sido colocado e
 * recebido **até aquele dia**.
 *
 * Função pura, para a conta ficar testável sem banco.
 */
export function saldoEm(mov: MovimentoPlano | undefined, data: string): number {
  if (!mov) return 0;
  const ate = (pontos: { data: string; quantidade: number }[]) =>
    pontos.reduce((a, p) => (p.data <= data ? a + p.quantidade : a), 0);
  return mov.plano - ate(mov.colocado) - ate(mov.recebido);
}

// ---------------------------------------------------------------------------
// 5. Pedido que sumiu sem recebimento
// ---------------------------------------------------------------------------

/**
 * Posições cujo pedido desapareceu da base sem entrada correspondente.
 *
 * Responde B5. Só é detectável porque `pedidos_de_compra` é cumulativa: a
 * linha existe num snapshot com saldo a receber e não existe no seguinte.
 * Quando há recebimento com o mesmo número de pedido, ela sumiu por ter
 * entrado — o caso normal. Quando não há, o pedido foi cancelado ou cortado e
 * ninguém foi avisado: medidas 667 linhas que somem entre snapshots
 * consecutivos, **107 sem recebimento correspondente**.
 *
 * O pareamento é por número de pedido **mais** item: `num_pedido` se repete
 * entre os itens de um mesmo pedido, e parear só por ele daria o mesmo
 * veredito a todos os itens de um pedido parcialmente cortado.
 */
export async function pedidosSumidos(
  de: string,
  ate: string,
): Promise<Map<string, number>> {
  const linhas = await prisma.$queryRawUnsafe<
    { codigo: string; cd: string; linhas: number }[]
  >(
    `WITH cargas AS (
       SELECT DISTINCT data_snapshot AS d
         FROM pedidos_de_compra
        WHERE data_snapshot >= $1::date AND data_snapshot <= $2::date
     ),
     par AS (
       SELECT d, LAG(d) OVER (ORDER BY d) AS anterior FROM cargas
     ),
     -- Linha com saldo na carga anterior e ausente na atual. LEFT JOIN com
     -- teste de nulo: e a ausencia que define o fato.
     sumidas AS (
       SELECT a.codigo,
              COALESCE(NULLIF(trim(a.rota_final), ''), a.filial) AS cd,
              a.num_pedido
         FROM par
         JOIN pedidos_de_compra a
           ON a.data_snapshot = par.anterior
          AND a.codigo IS NOT NULL
          AND a.num_pedido IS NOT NULL
          AND COALESCE(a.quantidade_receber, 0) > 0
         LEFT JOIN pedidos_de_compra b
           ON b.data_snapshot = par.d
          AND b.codigo = a.codigo
          AND b.num_pedido = a.num_pedido
          AND COALESCE(NULLIF(trim(b.rota_final), ''), b.filial)
              = COALESCE(NULLIF(trim(a.rota_final), ''), a.filial)
        WHERE par.anterior IS NOT NULL
          AND b.codigo IS NULL
     )
     SELECT s.codigo, s.cd, count(*)::int AS linhas
       FROM sumidas s
       LEFT JOIN recebimento r
         ON r.pedido = s.num_pedido AND r.codigo = s.codigo
      WHERE r.codigo IS NULL AND s.cd IS NOT NULL
      GROUP BY 1, 2`,
    de,
    ate,
  );

  return new Map(linhas.map((l) => [chave(l.codigo, l.cd), l.linhas]));
}

// ---------------------------------------------------------------------------
// 6. Percurso interno das triangulações
// ---------------------------------------------------------------------------

/** O que o percurso interno diz sobre a mercadoria a caminho do CD. */
export type SinalPercurso = {
  /** Transferências em aberto com destino final neste CD. */
  transferencias: number;
  /** Alguma perna atual já passou do SLA. */
  slaEstourado: boolean;
  /** O atraso acontece numa perna que sai de um hub, não da origem da rota. */
  paradaNoHub: boolean;
  /** Maior atraso em dias corridos, para a evidência. */
  piorAtraso: number;
};

/**
 * O estado do percurso interno, por item × CD final.
 *
 * Responde T3 e T4. Reaproveita `projetar`, a mesma função da tela de
 * transferências — o diagnóstico não pode dizer "a triangulação atrasou" sobre
 * um percurso que a outra tela projeta como no prazo.
 *
 * `diasParaVencidas = 0` de propósito: aqui a projeção não serve para prometer
 * data, serve para detectar que a perna atual **já venceu**, e é esse
 * `reprojetada` que responde T3.
 *
 * T4 é o subconjunto em que a perna vencida sai de um hub e não da origem da
 * rota: a mercadoria entrou num CD intermediário e a nota seguinte demorou.
 *
 * Limite conhecido e registrado: só a perna corrente está na base, porque a
 * nota de uma perna concluída deixa de estar em aberto. T4 enxerga então a
 * parada que **está acontecendo**, não a que já passou — para essa faria falta
 * comparar snapshots consecutivos, e a tela ainda não precisa disso.
 */
export async function percursoInterno(
  data: string,
): Promise<Map<string, SinalPercurso>> {
  const [linhas, sla, siglaParaCodigo] = await Promise.all([
    prisma.$queryRawUnsafe<
      {
        codigo: string;
        saida: string | null;
        entrada: string | null;
        rota: string | null;
        passo: number | null;
        emissao: Date | null;
      }[]
    >(
      `SELECT codigo,
              filial_codigo_saida   AS saida,
              filial_codigo_entrada AS entrada,
              rota,
              passo::int         AS passo,
              data_emissao::date AS emissao
         FROM transferencias_abertas
        WHERE data_snapshot = ${ultimoSnapshotSql("transferencias_abertas", "$1")}
          AND codigo IS NOT NULL
          AND COALESCE(qtde, 0) > 0`,
      data,
    ),
    carregarSla(),
    carregarFiliais(),
  ]);

  const referencia = new Date(`${data}T00:00:00.000Z`);
  const mapa = new Map<string, SinalPercurso>();

  for (const l of linhas) {
    const projecao = projetar({
      rota: l.rota,
      filialSaida: l.saida,
      filialEntrada: l.entrada,
      passo: l.passo,
      dataEmissao: l.emissao,
      siglaParaCodigo,
      sla,
      dataReferencia: referencia,
      diasParaVencidas: 0,
    });
    if (!projecao.cdFinal) continue;

    const k = chave(l.codigo, projecao.cdFinal);
    const atual = mapa.get(k) ?? {
      transferencias: 0,
      slaEstourado: false,
      paradaNoHub: false,
      piorAtraso: 0,
    };
    atual.transferencias += 1;

    // `reprojetada` só é verdadeira quando a chegada calculada pela emissão
    // caiu antes da data de referência — ou seja, a perna atual venceu.
    if (projecao.reprojetada) {
      atual.slaEstourado = true;
      const transito = projecao.etapas[0]?.transitTime ?? 0;
      if (l.emissao) {
        const prevista = l.emissao.getTime() + transito * 86_400_000;
        atual.piorAtraso = Math.max(
          atual.piorAtraso,
          Math.round((referencia.getTime() - prevista) / 86_400_000),
        );
      }
      // Perna 2 ou adiante numa rota de triangulação: a nota saiu de um CD
      // intermediário, não da origem da rota.
      if (parseRota(l.rota).length > 0 && (l.passo ?? 1) >= 2) {
        atual.paradaNoHub = true;
      }
    }

    mapa.set(k, atual);
  }

  return mapa;
}

// ---------------------------------------------------------------------------
// A rodada carrega tudo de uma vez
// ---------------------------------------------------------------------------

export type Sinais = {
  planoAnterior: PlanoDoMesAnterior;
  compraAnterior: Map<string, CompraMesAnterior>;
  pedidos: Map<string, PedidoDoCiclo>;
  movimento: Map<string, MovimentoPlano>;
  sumidos: Map<string, number>;
  percurso: Map<string, SinalPercurso>;
};

/**
 * Os seis sinais, em paralelo.
 *
 * Seis consultas somadas à rodada, todas agregadas e todas uma vez por rodada.
 * Nenhuma roda em tempo de request: a tela lê as tabelas do motor, que já têm
 * o resultado calculado.
 */
export async function carregarSinais(de: string, ate: string): Promise<Sinais> {
  const [planoAnterior, compraAnterior, pedidos, movimento, sumidos, percurso] =
    await Promise.all([
      planoDoMesAnterior(ate),
      compraDoMesAnterior(ate),
      pedidosDoCiclo(ate),
      movimentoDoPlano(ate),
      pedidosSumidos(de, ate),
      percursoInterno(ate),
    ]);

  return {
    planoAnterior,
    compraAnterior,
    pedidos,
    movimento,
    sumidos,
    percurso,
  };
}
