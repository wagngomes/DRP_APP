/**
 * Carrega a série de uma posição: estoque, vendas, entradas e o que está por vir.
 *
 * **Recortada a uma posição**, e consultada só quando alguém abre a linha. São
 * consultas por índice, de uma posição só, e o custo é de milissegundos —
 * carregar a janela inteira de todas as posições para desenhar um gráfico seria
 * o padrão que já custou 23 segundos noutra tela desta base.
 *
 * Os tipos e as contas puras vivem em `serie.ts`, que o componente de cliente
 * importa. Este arquivo toca o banco e fica do lado do servidor.
 *
 * Só lê.
 */
import { prisma } from "@/lib/prisma";
import { carregarFiliais, carregarSla } from "@/lib/transferencias/consultas";
import { simuladorPorCd } from "@/utils/cds-virtuais";
import { torreValidaSql } from "@/utils/dias-estoque";
import { limitesDoMes } from "@/utils/mes";
import { projetar, somarDiasUteis } from "@/utils/projecao-transferencias";
import { COLUNAS_DISPONIVEL } from "./parametros";
import {
  mesesDaJanela,
  projetarEstoque,
  somarDias,
  type ChegadaSerie,
  type MarcoPedido,
  type PontoSerie,
  type SerieItem,
} from "./serie";

const DISPONIVEL = `(${COLUNAS_DISPONIVEL.map((c) => `COALESCE(s.${c},0)`).join(" + ")})`;

export async function carregarSerie(
  codigo: string,
  filial: string,
  /** Data de referência do sistema. Define os dois meses e o fim do medido. */
  referencia: string,
): Promise<SerieItem> {
  const { inicio: inicioCorrente, fim: proximoMes } = limitesDoMes(referencia);
  const de = limitesDoMes(somarDias(inicioCorrente, -1)).inicio;
  const ate = somarDias(proximoMes, -1);

  const [estoques, vendas, compras, transferencias, pedidos, previstas] =
    await Promise.all([
      estoqueDiario(codigo, filial, de, referencia),
      vendaDiaria(codigo, filial, de, referencia),
      chegadasDeCompra(codigo, filial, de, referencia),
      chegadasDeTransferencia(codigo, filial, de, referencia),
      pedidosEmitidos(codigo, filial, de, referencia),
      chegadasPrevistas(codigo, filial, referencia, ate),
    ]);

  const vendaDe = new Map(vendas.map((v) => [v.data, v.quantidade]));
  const estoqueDe = new Map(estoques.linhas.map((e) => [e.data, e.estoque]));
  const chegadas = juntarChegadas([
    ...compras,
    ...transferencias,
    ...previstas,
  ]);

  const forecastHerdado =
    estoques.forecastMensal <= 0 && estoques.forecastMesAnterior > 0;
  const forecastMensal = forecastHerdado
    ? estoques.forecastMesAnterior
    : estoques.forecastMensal;
  const consumoDiario = forecastMensal / 30;

  // Um ponto por dia corrido, e não por snapshot: o eixo do tempo precisa ser
  // regular para a inclinação da reta significar velocidade de consumo. Dia
  // sem carga fica nulo, e o desenho atravessa o buraco em vez de fingir um
  // degrau que não houve.
  const pontos: PontoSerie[] = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) {
    pontos.push({
      data: d,
      estoque: d <= referencia ? (estoqueDe.get(d) ?? null) : null,
      projetado: null,
      venda: vendaDe.get(d) ?? 0,
    });
  }

  projetarEstoque(pontos, referencia, consumoDiario, previstas);

  return {
    de,
    ate,
    referencia,
    pontos,
    chegadas,
    marcos: pedidos,
    meses: mesesDaJanela(
      pontos,
      referencia,
      forecastMensal,
      estoques.forecastMesAnterior,
    ),
    politicaDias: estoques.politicaDias,
    politicaUnidades: consumoDiario * estoques.politicaDias,
    consumoDiario,
    forecastMensal,
    forecastHerdado,
  };
}

/**
 * Junta as entradas do mesmo dia, tipo e natureza numa só.
 *
 * Sem isso, quatro transferências com SLA vencido viram quatro marcadores
 * empilhados no mesmo pixel do dia de referência: a tela mostra um círculo e
 * esconde três, e a soma que importa — quanto entra naquele dia — não aparece
 * em lugar nenhum.
 */
function juntarChegadas(lista: ChegadaSerie[]): ChegadaSerie[] {
  const porChave = new Map<string, ChegadaSerie>();
  for (const c of lista) {
    // A data prometida entra na chave: vencida e no prazo são leituras
    // diferentes, e juntá-las num marcador só esconderia o atraso.
    const k = `${c.data}|${c.tipo}|${c.prevista}|${c.prometidaPara ? "vencida" : "no-prazo"}`;
    const atual = porChave.get(k);
    if (atual) {
      atual.quantidade += c.quantidade;
      atual.notas = (atual.notas ?? 1) + 1;
      // A mais antiga das vencidas: é a que diz há quanto tempo isto arrasta.
      if (
        c.prometidaPara &&
        (!atual.prometidaPara || c.prometidaPara < atual.prometidaPara)
      ) {
        atual.prometidaPara = c.prometidaPara;
      }
    } else {
      porChave.set(k, { ...c, notas: 1 });
    }
  }
  return [...porChave.values()].sort((a, b) => a.data.localeCompare(b.data));
}

/**
 * Estoque por dia de carga, mais a política e os forecasts dos dois meses.
 *
 * O forecast de cada mês é o da última carga daquele mês — a mesma regra de
 * `snapshotMensalSql`. São dois porque a janela cobre dois meses, e a linha de
 * ritmo de agosto tem de ser medida contra a previsão de agosto.
 */
async function estoqueDiario(
  codigo: string,
  filial: string,
  de: string,
  referencia: string,
): Promise<{
  linhas: { data: string; estoque: number }[];
  politicaDias: number;
  forecastMensal: number;
  forecastMesAnterior: number;
}> {
  const linhas = await prisma.$queryRawUnsafe<
    {
      data: Date;
      estoque: number;
      politica: number;
      forecast: number;
      forecast_anterior: number;
    }[]
  >(
    `WITH dias AS (
       SELECT DISTINCT data_snapshot::date AS d
         FROM simulador
        WHERE data_snapshot >= $3::date AND data_snapshot <= $4::date
     ),
     fc AS (
       SELECT COALESCE(politica, 0)::float8 AS politica,
              forecast_m0::float8           AS forecast
         FROM forecast f
        WHERE f.codigo = $1 AND f.filial = $2
          AND f.data_snapshot = (
                SELECT MAX(_f.data_snapshot) FROM forecast _f
                 WHERE _f.data_snapshot >= date_trunc('month', $4::date)
                   AND _f.data_snapshot <= $4::date
                   AND _f.codigo IS NOT NULL
              )
          AND ${torreValidaSql("f")}
        LIMIT 1
     ),
     fc_ant AS (
       SELECT forecast_m0::float8 AS forecast
         FROM forecast f
        WHERE f.codigo = $1 AND f.filial = $2
          AND f.data_snapshot = (
                SELECT MAX(_f.data_snapshot) FROM forecast _f
                 WHERE _f.data_snapshot >= $3::date
                   AND _f.data_snapshot < date_trunc('month', $4::date)
                   AND _f.codigo IS NOT NULL
              )
        LIMIT 1
     )
     SELECT dias.d AS data,
            COALESCE(sim.disponivel, 0)::float8 AS estoque,
            COALESCE((SELECT politica FROM fc), 0)::float8 AS politica,
            COALESCE((SELECT forecast FROM fc), 0)::float8 AS forecast,
            COALESCE((SELECT forecast FROM fc_ant), 0)::float8 AS forecast_anterior
       FROM dias
       LEFT JOIN LATERAL (
         SELECT ${DISPONIVEL}::float8 AS disponivel
           FROM ${simuladorPorCd("s.data_snapshot = dias.d")} s
          WHERE s.codigo = $1 AND s.filial = $2
            AND s.data_snapshot = dias.d
          LIMIT 1
       ) sim ON TRUE
      ORDER BY dias.d`,
    codigo,
    filial,
    de,
    referencia,
  );

  return {
    linhas: linhas.map((l) => ({
      data: l.data.toISOString().slice(0, 10),
      estoque: l.estoque,
    })),
    politicaDias: linhas[0]?.politica ?? 0,
    forecastMensal: linhas[0]?.forecast ?? 0,
    // Sem carga no mês anterior, a régua daquele mês é a atual: melhor que
    // zero, que faria a linha de ritmo encostar no eixo e sugerir que não
    // havia previsão nenhuma.
    forecastMesAnterior:
      linhas[0]?.forecast_anterior || (linhas[0]?.forecast ?? 0),
  };
}

/** Venda diária pela nota, a mesma fonte do raio-X e da aceleração. */
async function vendaDiaria(
  codigo: string,
  filial: string,
  de: string,
  ate: string,
): Promise<{ data: string; quantidade: number }[]> {
  const linhas = await prisma.$queryRawUnsafe<{ data: Date; qtd: number }[]>(
    `SELECT data::date AS data, SUM(-quantidade)::float8 AS qtd
       FROM historico_vendas
      WHERE cod_prod = $1 AND filial = $2
        AND data >= $3::date AND data <= $4::date
      GROUP BY 1
      ORDER BY 1`,
    codigo,
    filial,
    de,
    ate,
  );
  return linhas.map((l) => ({
    data: l.data.toISOString().slice(0, 10),
    quantidade: l.qtd,
  }));
}

async function chegadasDeCompra(
  codigo: string,
  filial: string,
  de: string,
  ate: string,
): Promise<ChegadaSerie[]> {
  const linhas = await prisma.$queryRawUnsafe<{ data: Date; qtd: number }[]>(
    `SELECT data::date AS data, SUM(quantidade)::float8 AS qtd
       FROM recebimento
      WHERE codigo = $1 AND filial = $2 AND quantidade > 0
        AND data >= $3::date AND data <= $4::date
      GROUP BY 1`,
    codigo,
    filial,
    de,
    ate,
  );
  return linhas.map((l) => ({
    data: l.data.toISOString().slice(0, 10),
    quantidade: l.qtd,
    tipo: "compra" as const,
    prevista: false,
  }));
}

/**
 * Entradas de transferência, deduzidas pelo dia em que a nota some da carga.
 *
 * Mesma dedução de `janela.ts`, e com a mesma escolha deliberada: a chegada é
 * datada no **snapshot anterior ao sumiço**. Entre a última carga em que a nota
 * aparece e a primeira em que não aparece, o que se sabe é que ela entrou nesse
 * intervalo — escolher a ponta de baixo erra para menos quando há buraco de
 * importação; a de cima inventaria atraso de logística onde houve falha de
 * carga.
 */
async function chegadasDeTransferencia(
  codigo: string,
  filial: string,
  de: string,
  ate: string,
): Promise<ChegadaSerie[]> {
  const linhas = await prisma.$queryRawUnsafe<{ data: Date; qtd: number }[]>(
    `WITH cargas AS (
       SELECT DISTINCT data_snapshot::date AS d
         FROM transferencias_abertas
        WHERE data_snapshot >= $3::date AND data_snapshot <= $4::date
     ),
     par AS (SELECT d, LEAD(d) OVER (ORDER BY d) AS proxima FROM cargas),
     notas AS (
       SELECT t.data_snapshot::date AS d, t.numero_nf_saida,
              SUM(t.qtde)::float8 AS qtd
         FROM transferencias_abertas t
        WHERE t.codigo = $1 AND t.filial_codigo_entrada = $2
          AND t.data_snapshot >= $3::date AND t.data_snapshot <= $4::date
          AND t.numero_nf_saida IS NOT NULL
        GROUP BY 1, 2
     )
     SELECT n.d AS data, SUM(n.qtd)::float8 AS qtd
       FROM notas n
       JOIN par ON par.d = n.d
      WHERE par.proxima IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM transferencias_abertas t2
           WHERE t2.data_snapshot::date = par.proxima
             AND t2.numero_nf_saida = n.numero_nf_saida
             AND t2.codigo = $1
             AND t2.filial_codigo_entrada = $2
        )
      GROUP BY 1`,
    codigo,
    filial,
    de,
    ate,
  );
  return linhas.map((l) => ({
    data: l.data.toISOString().slice(0, 10),
    quantidade: l.qtd,
    tipo: "transferencia" as const,
    prevista: false,
  }));
}

/**
 * O que ainda está para entrar: pedidos de compra e transferências em aberto.
 *
 * Compra pela `data_pedra`, que é a data que a operação usa — não
 * `data_entrega`, do sistema de origem, que diverge dela. Transferência pela
 * projeção de `projetar`, a mesma função da tela de transferências: o
 * diagnóstico não pode prometer uma data que a outra tela contradiz.
 *
 * Entrada com data já vencida é trazida para o dia de referência. A alternativa
 * — desenhá-la no passado — colocaria uma seta de "vai chegar" num dia que já
 * passou sem ela ter chegado, que é a única leitura claramente errada.
 */
async function chegadasPrevistas(
  codigo: string,
  filial: string,
  referencia: string,
  ate: string,
): Promise<ChegadaSerie[]> {
  const [compras, transferencias, sla, siglaParaCodigo] = await Promise.all([
    prisma.$queryRawUnsafe<{ data: Date | null; qtd: number }[]>(
      `SELECT data_pedra::date AS data,
              SUM(COALESCE(quantidade_receber, 0))::float8 AS qtd
         FROM pedidos_de_compra
        WHERE codigo = $1
          AND COALESCE(NULLIF(trim(rota_final), ''), filial) = $2
          AND COALESCE(quantidade_receber, 0) > 0
          AND data_snapshot = (
                SELECT MAX(data_snapshot) FROM pedidos_de_compra
                 WHERE data_snapshot <= $3::date
              )
        GROUP BY 1`,
      codigo,
      filial,
      referencia,
    ),
    prisma.$queryRawUnsafe<
      {
        saida: string | null;
        entrada: string | null;
        rota: string | null;
        passo: number | null;
        emissao: Date | null;
        qtd: number;
      }[]
    >(
      `SELECT filial_codigo_saida AS saida, filial_codigo_entrada AS entrada,
              rota, passo::int AS passo, data_emissao::date AS emissao,
              SUM(COALESCE(qtde, 0))::float8 AS qtd
         FROM transferencias_abertas
        WHERE codigo = $1
          AND data_snapshot = (
                SELECT MAX(data_snapshot) FROM transferencias_abertas
                 WHERE data_snapshot <= $2::date
              )
          AND COALESCE(qtde, 0) > 0
        GROUP BY 1, 2, 3, 4, 5`,
      codigo,
      referencia,
    ),
    carregarSla(),
    carregarFiliais(),
  ]);

  // Entrada com data vencida é trazida para o dia de referência, guardando a
  // data prometida. Desenhá-la no passado colocaria uma seta de "vai chegar"
  // num dia que já passou sem ela ter chegado.
  const dentro = (iso: string) =>
    iso < referencia ? referencia : iso > ate ? null : iso;

  const previstas: ChegadaSerie[] = [];

  for (const c of compras) {
    if (!c.data || c.qtd <= 0) continue;
    const prometida = c.data.toISOString().slice(0, 10);
    const data = dentro(prometida);
    if (!data) continue;
    previstas.push({
      data,
      quantidade: c.qtd,
      tipo: "compra",
      prevista: true,
      origem: "data pedra do pedido",
      ...(prometida < referencia ? { prometidaPara: prometida } : {}),
    });
  }

  const dataReferencia = new Date(`${referencia}T00:00:00.000Z`);
  for (const t of transferencias) {
    const projecao = projetar({
      rota: t.rota,
      filialSaida: t.saida,
      filialEntrada: t.entrada,
      passo: t.passo,
      dataEmissao: t.emissao,
      siglaParaCodigo,
      sla,
      dataReferencia,
      diasParaVencidas: 0,
    });
    // Só o que termina neste CD: transferência que passa por aqui a caminho de
    // outro destino não vira estoque disponível.
    if (projecao.cdFinal !== filial || !projecao.chegadaFinal) continue;

    // `projetar` com `diasParaVencidas = 0` devolve a própria data de
    // referência quando a perna já venceu — e usá-la como data prometida
    // escreveria "vencida desde hoje", que não diz nada. A data que a operação
    // tinha na mão é a da emissão mais o SLA da perna atual.
    const prometida = projecao.reprojetada && t.emissao
      ? somarDiasUteis(t.emissao, projecao.etapas[0]?.transitTime ?? 0)
          .toISOString()
          .slice(0, 10)
      : projecao.chegadaFinal.toISOString().slice(0, 10);

    const data = dentro(
      projecao.chegadaFinal.toISOString().slice(0, 10),
    );
    if (!data) continue;
    previstas.push({
      data,
      quantidade: t.qtd,
      tipo: "transferencia",
      prevista: true,
      origem: "projeção pelo SLA da rota",
      ...(prometida < referencia ? { prometidaPara: prometida } : {}),
    });
  }

  return previstas;
}

/** Quando cada pedido do período foi emitido. */
async function pedidosEmitidos(
  codigo: string,
  filial: string,
  de: string,
  ate: string,
): Promise<MarcoPedido[]> {
  const linhas = await prisma.$queryRawUnsafe<
    { num_pedido: string | null; emitido: Date | null; qtd: number }[]
  >(
    `SELECT num_pedido,
            MIN(data_emissao)::date AS emitido,
            SUM(COALESCE(quantidade_total, 0))::float8 AS qtd
       FROM pedidos_de_compra
      WHERE codigo = $1
        AND COALESCE(NULLIF(trim(rota_final), ''), filial) = $2
        AND data_snapshot = (
              SELECT MAX(data_snapshot) FROM pedidos_de_compra
               WHERE data_snapshot <= $4::date
            )
        AND data_emissao >= $3::date AND data_emissao <= $4::date
      GROUP BY 1`,
    codigo,
    filial,
    de,
    ate,
  );

  return linhas
    .filter((l) => l.emitido)
    .map((l) => ({
      data: l.emitido!.toISOString().slice(0, 10),
      rotulo: l.num_pedido ? `pedido nº ${l.num_pedido}` : "pedido emitido",
      quantidade: l.qtd,
    }))
    .sort((a, b) => a.data.localeCompare(b.data));
}
