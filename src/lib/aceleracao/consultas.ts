/**
 * Aceleração de venda: o que está saindo acima do planejado e quem está puxando.
 *
 * Duas perguntas diferentes, medidas contra referências diferentes de propósito:
 *
 *   **O item acelerou?** — comparado ao *forecast* da Cia, proporcional aos dias
 *   decorridos do mês. É a mesma regra de `calcularRitmo()` já usada na tela de
 *   produto, aplicada no grão Cia: o que interessa é o desvio contra o plano,
 *   porque é o plano que dimensiona compra e cobertura.
 *
 *   **Quem puxou?** — comparado ao *histórico do próprio cliente* na mesma
 *   janela do mês. Um cliente não tem forecast; o que se pode dizer dele é se
 *   comprou fora do padrão dele mesmo.
 *
 * A janela é o ponto central do método. Comparar um mês parcial contra a
 * mediana de meses cheios faz o alerta quase não disparar no dia 3 e disparar
 * normalmente no dia 28 — a sensibilidade mudaria com o calendário. Aqui os
 * dias 1..N de setembro são comparados com os dias 1..N de cada mês anterior, e
 * é essa mesma janela que o gráfico acumulado desenha.
 *
 * **Uma fonte só para venda: `historico_vendas`.** As duas perguntas acima medem
 * a mesma venda, e por um tempo mediram de lugares diferentes — a do item pelo
 * acumulado do ERP (`vendido_m0` do simulador), a do cliente pela nota. Os dois
 * números apareciam lado a lado na mesma linha da tela em unidades que não
 * somavam entre si, e divergiam cerca de 20% por item para os dois lados. É
 * também o que fazia esta tela não bater com a de raio-X, que sempre leu a nota.
 *
 * Sinal: `historico_vendas` grava venda como saída, com quantidade negativa.
 * Todas as somas invertem o sinal.
 */
import { prisma } from "@/lib/prisma";
import { listarSnapshots } from "@/lib/snapshots";
import { limitesDoMes } from "@/utils/mes";
import { gruposPorCnpj } from "@/lib/clientes-grupos";
import { joinFornecedor, nomeFornecedor } from "@/lib/fornecedor";
import { VAZIO } from "@/lib/fornecedores/agregacao";
import {
  COLUNAS_ESTOQUE_CHAO,
  DIAS_NO_MES,
  snapshotMensalSql,
  somaSql,
  torreValidaSql,
} from "@/utils/dias-estoque";
import { fracaoDoMesDecorrida, TOLERANCIA } from "@/utils/ritmo-venda";

const CHAO = somaSql(COLUNAS_ESTOQUE_CHAO, "s");

/** Mínimo de unidades no mês para um cliente ser considerado fora do padrão. */
export const MINIMO_UNIDADES_CLIENTE = 10;
/** Quantas vezes acima da própria mediana, na mesma janela do mês. */
export const FATOR_CLIENTE = 2;
/**
 * Meses com venda na janela que o cliente precisa ter para entrar na conta.
 * Sem isso, todo cliente novo — mediana zero — vira anomalia no primeiro pedido.
 */
export const MINIMO_MESES_HISTORICO = 2;
/**
 * Meses anteriores usados como referência. Também limita quanto da base é lida:
 * sem esse corte, toda consulta varreria o histórico inteiro, que só cresce.
 */
export const MESES_BASELINE = 4;

export type ItemAcelerado = {
  codigo: string;
  descricao: string | null;
  fornecedor: string;
  bu: string;
  curva: string;
  /** Forecast do mês somado em todos os CDs. */
  forecast: number;
  /** Vendido no mês até a data de referência, somado em todos os CDs. */
  vendido: number;
  estoqueChao: number;
  /** Realizado ÷ esperado até hoje. 1 = exatamente no plano. */
  indice: number;
  /** Cobertura do estoque chão no ritmo que está acontecendo. */
  diasNoRitmoReal: number | null;
  /** Cobertura que haveria se o item vendesse conforme o plano. */
  diasNoPlano: number | null;
  /** Quantos clientes compraram fora do próprio padrão na janela. */
  clientesFora: number;
  /** Unidades acima do padrão, somadas entre esses clientes. */
  excedente: number;
  /** Fatia do excedente concentrada no maior cliente (0..1). */
  concentracao: number | null;
};

export type DadosAceleracao = {
  itens: ItemAcelerado[];
  /** Listas dos filtros, montadas antes do recorte. */
  bus: string[];
  curvas: string[];
  fornecedores: string[];
  /** Produtos com forecast Cia, antes de qualquer corte. */
  totalUniverso: number;
  /** Quantos aceleraram, antes dos filtros de tela. */
  totalAcelerados: number;
  /**
   * Quanto cada foco traria dentro do recorte atual — ou seja, com BU, curva,
   * fornecedor e busca já aplicados, mas sem o próprio foco. É o que dá sentido
   * ao número na aba: ele antecipa o resultado do clique. Por não incluir o
   * foco, também não muda ao alternar entre as abas.
   */
  totaisFoco: { todos: number; multi: number; risco: number };
  /** Excedente somado no recorte, pela mesma base dos totais. */
  excedenteTotal: number;
  /** Janela comparada: dias 1..diaCorte, e os meses de referência. */
  diaCorte: number;
  mesCorrente: string;
  mesesBaseline: string[];
};

/** Recorte da tela. */
export type FiltrosAceleracao = {
  bu?: string;
  curva?: string;
  fornecedor?: string;
  /** Busca livre: código exato ou trecho da descrição. */
  produto?: string;
  /** "multi" = 2+ clientes fora do padrão; "risco" = cobertura ameaçada. */
  foco?: "todos" | "multi" | "risco";
};

/** Cobertura abaixo disto, no ritmo real, conta como ameaçada. */
export const DIAS_RISCO = 20;

/**
 * Janela de comparação: no mês de referência, até que dia há venda registrada.
 *
 * Duas decisões, e a ordem entre elas importa.
 *
 * **O mês é o da data de referência**, não o último mês com dado. Antes era o
 * último com dado, e isso quebrava na virada: em 2 de outubro, sem a venda de
 * outubro importada, a tela mostrava setembro inteiro como se fosse o mês
 * corrente — apontando aceleração de item que não teve faturamento nenhum no
 * mês.
 *
 * **O dia de corte é o último com dado dentro desse mês**, não o dia de hoje. É
 * a parte que já estava certa: se o histórico foi carregado até dia 3 e a
 * referência é dia 4, comparar 1..4 contra 1..4 dos outros meses tiraria um dia
 * inteiro só do mês corrente.
 *
 * Quando não há venda nenhuma no mês de referência, `diaCorte` é zero e a tela
 * diz isso, em vez de mostrar os números do mês anterior.
 */
export type Janela = {
  /** Último dia do mês de referência com venda; zero quando não há nenhuma. */
  diaCorte: number;
  mesCorrente: string;
  mesesBaseline: string[];
  /** Primeiro dia do mês de baseline mais antigo, para cortar a leitura. */
  inicioBaseline: string;
};

/**
 * Janela de comparação: até que dia do mês corrente há venda registrada.
 *
 * Sai do último dia com dado, não da data de referência do sistema: se o
 * histórico foi carregado até dia 3 e a referência é dia 4, comparar 1..4 de
 * setembro contra 1..4 dos outros meses tiraria um dia inteiro só de setembro.
 *
 * Só o `MAX(data)` vai ao banco, e ele usa índice. Os meses de baseline saem de
 * aritmética de calendário: a versão anterior os descobria com um
 * `SELECT DISTINCT to_char(data,'YYYY-MM')`, que aplicava a função em cada uma
 * das 490 mil linhas e custava até 7 segundos — por request, duas vezes.
 */
export async function carregarJanela(dataReferencia: string): Promise<Janela> {
  const mesCorrente = dataReferencia.slice(0, 7);
  const { inicio, fim } = limitesDoMes(dataReferencia);

  // Só o `MAX(data)` do mês vai ao banco, e ele usa índice.
  const [linha] = await prisma.$queryRawUnsafe<{ dia: number | null }[]>(
    `SELECT extract(day FROM MAX(data))::int AS dia
       FROM historico_vendas
      WHERE data >= $1::date AND data < $2::date`,
    inicio,
    fim,
  );

  const [ano, mes] = mesCorrente.split("-").map(Number);
  const mesesBaseline = Array.from({ length: MESES_BASELINE }, (_, i) =>
    new Date(Date.UTC(ano, mes - 1 - (MESES_BASELINE - i), 1))
      .toISOString()
      .slice(0, 7),
  );

  // O corte é o menor entre o último dia com dado e o dia da referência.
  //
  // Os dois limites existem por motivos diferentes: o dado porque comparar
  // 1..4 contra 1..4 tiraria um dia inteiro só do mês corrente, e a referência
  // porque olhar além dela seria ler o futuro — consultar o dia 10 e receber a
  // venda até o dia 23 não é o estado daquele momento.
  const diaDaReferencia = Number(dataReferencia.slice(8, 10));
  const diaCorte = Math.min(linha?.dia ?? 0, diaDaReferencia);

  return {
    diaCorte,
    mesCorrente,
    mesesBaseline,
    inicioBaseline: `${mesesBaseline[0]}-01`,
  };
}

/**
 * Fração do mês que a janela 1..diaCorte cobre.
 *
 * Separada do corpo da consulta porque é onde a troca de fonte pode morder sem
 * fazer barulho. Na virada do mês, com a venda do dia 1 ainda não importada, o
 * corte é zero — e `vendido / forecast / 0` devolve infinito para todo item do
 * universo, o que viraria uma tela inteira de alertas máximos em vez de uma tela
 * vazia. Zero aqui, e quem divide trata o caso.
 *
 * O denominador é o tamanho real do mês, e não 30: é a mesma conta de
 * `fracaoDoMesDecorrida`, reusada em vez de reescrita.
 */
export function fracaoDaJanela(mesCorrente: string, diaCorte: number): number {
  if (diaCorte <= 0) return 0;
  return fracaoDoMesDecorrida(
    `${mesCorrente}-${String(diaCorte).padStart(2, "0")}`,
  );
}

/**
 * Clientes fora do padrão por item, agregados.
 *
 * A chave é o CNPJ, que voltou a ser confiável depois da reimportação — antes
 * vinha em notação científica e um mesmo valor cobria dezenas de empresas.
 */
function sqlClientesFora(): string {
  return `
    WITH janela AS (
      SELECT h.cod_prod AS codigo, h.cnpj,
             to_char(h.data, 'YYYY-MM') AS mes,
             SUM(-h.quantidade)::float8 AS qtd
        FROM historico_vendas h
       WHERE h.cod_prod IS NOT NULL AND h.cnpj IS NOT NULL
         -- Limita a leitura à janela de baseline; sem isto a consulta varre o
         -- histórico inteiro, que só cresce a cada importação.
         AND h.data >= $4::date
         AND extract(day FROM h.data) <= $2
       GROUP BY 1, 2, 3
    ),
    comparado AS (
      SELECT codigo, cnpj,
             SUM(qtd) FILTER (WHERE mes = $3) AS atual,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY qtd)
               FILTER (WHERE mes < $3) AS mediana,
             COUNT(*) FILTER (WHERE mes < $3) AS meses_com_dado
        FROM janela
       GROUP BY 1, 2
    ),
    fora AS (
      SELECT codigo, cnpj, (atual - mediana) AS excedente
        FROM comparado
       WHERE atual IS NOT NULL AND mediana > 0
         AND meses_com_dado >= ${MINIMO_MESES_HISTORICO}
         AND atual >= ${MINIMO_UNIDADES_CLIENTE}
         AND atual >= mediana * ${FATOR_CLIENTE}
    )
    SELECT codigo, COUNT(*)::int AS clientes,
           SUM(excedente)::float8 AS excedente,
           MAX(excedente)::float8 AS maior
      FROM fora GROUP BY 1`;
}

export async function carregarAceleracao(
  data: string,
  filtros: FiltrosAceleracao = {},
  /** Janela já calculada, para a tela não ler a mesma coisa duas vezes. */
  janelaPronta?: Janela,
): Promise<DadosAceleracao> {
  const janela = janelaPronta ?? (await carregarJanela(data));
  // Da janela, e não do calendário.
  //
  // Antes vinha do calendário, e estava certo para o que havia: `vendido` saía
  // das colunas `vendido_m0` do simulador, que são o acumulado do ERP na data do
  // snapshot e não conhecem corte nenhum. Agora o vendido sai do histórico
  // recortado em 1..diaCorte, e a fração que lhe corresponde é a desses mesmos
  // dias. A troca de fonte é o que torna esta linha correta — mudar uma sem a
  // outra deixaria a conta pior do que estava.
  const fracao = fracaoDaJanela(janela.mesCorrente, janela.diaCorte);
  const diasDecorridos = Math.max(1, fracao * DIAS_NO_MES);

  const linhas = await prisma.$queryRawUnsafe<
    {
      codigo: string;
      descricao: string | null;
      fornecedor: string;
      bu: string;
      curva: string;
      forecast: number;
      vendido: number;
      chao: number;
      clientes: number | null;
      excedente: number | null;
      maior: number | null;
    }[]
  >(
    // Cada número vem de onde ele mora: venda do histórico, estoque do
    // simulador, plano do forecast.
    //
    // O vendido já saiu do simulador. As colunas `vendido_m0` são o acumulado do
    // ERP, e divergem do faturamento item a item em cerca de 20% para os dois
    // lados — mediana 9% abaixo, cauda a 33%. Medido na base: 104 itens
    // acelerando que a tela não mostrava, contra 21 alertas que o faturamento
    // não confirmava. Pior, a mesma tela media a venda do item pelo ERP e a
    // venda do cliente pela nota, lado a lado na mesma linha, em unidades que
    // não somam entre si.
    //
    // O estoque continua no simulador, que é onde posição de estoque mora.
    `WITH fc AS (
       SELECT f.codigo,
              SUM(f.forecast_m0)::float8 AS forecast,
              COALESCE(NULLIF(trim(MIN(f.b_u)), ''), '${VAZIO}') AS bu,
              COALESCE(NULLIF(trim(MIN(f.curva)), ''), '${VAZIO}') AS curva
         FROM forecast f
        WHERE ${snapshotMensalSql("forecast", "f", "$1")}
          AND f.forecast_m0 > 0
          AND ${torreValidaSql("f")}
          AND f.filial IS NOT NULL
        GROUP BY 1
     ),
     -- Posições item|CD que a torre manda ignorar.
     --
     -- O filtro de torre valia só no lado do forecast: a posição saía do plano e
     -- a venda dela continuava entrando, inflando o índice por um motivo que não
     -- é aceleração. COALESCE porque torre nula não é "considerar", e sem ele a
     -- comparação devolve NULL e a posição escapa do anti-join.
     --
     -- CTE e não subconsulta correlacionada: o histórico tem meia-milhão de
     -- linhas, e correlacionar aqui custaria uma varredura por linha.
     torre_fora AS (
       SELECT DISTINCT f.codigo, f.filial
         FROM forecast f
        WHERE ${snapshotMensalSql("forecast", "f", "$1")}
          AND f.filial IS NOT NULL
          AND NOT COALESCE(${torreValidaSql("f")}, false)
     ),
     vd AS (
       SELECT h.cod_prod AS codigo, SUM(-h.quantidade)::float8 AS vendido
         FROM historico_vendas h
         LEFT JOIN torre_fora tf
                ON tf.codigo = h.cod_prod AND tf.filial = h.filial
        WHERE h.cod_prod IS NOT NULL
          AND h.data >= date_trunc('month', $1::date)
          AND h.data <  date_trunc('month', $1::date) + interval '1 month'
          AND extract(day FROM h.data) <= $2
          AND tf.codigo IS NULL
        GROUP BY 1
     ),
     sim AS (
       SELECT s.codigo,
              SUM(COALESCE(${CHAO}, 0))::float8 AS chao,
              MIN(${nomeFornecedor("s")}) AS fornecedor
         FROM simulador s ${joinFornecedor("s")}
        WHERE s.data_snapshot = $1::date
        GROUP BY 1
     ),
     cli AS (${sqlClientesFora()})
     SELECT fc.codigo, pr.descricao,
            COALESCE(sim.fornecedor, 'Sem fornecedor') AS fornecedor,
            fc.bu, fc.curva, fc.forecast,
            COALESCE(vd.vendido, 0) AS vendido,
            COALESCE(sim.chao, 0) AS chao,
            cli.clientes, cli.excedente, cli.maior
       FROM fc
       LEFT JOIN sim ON sim.codigo = fc.codigo
       LEFT JOIN vd ON vd.codigo = fc.codigo
       LEFT JOIN cli ON cli.codigo = fc.codigo
       LEFT JOIN produtos pr ON pr.codigo = fc.codigo`,
    data,
    janela.diaCorte,
    janela.mesCorrente,
    janela.inicioBaseline,
  );

  const todos = linhas.map((l): ItemAcelerado => {
    // `fracao > 0` protege a virada do mês: sem venda importada ainda, o corte é
    // o dia zero e a divisão devolveria infinito para todo item do universo.
    const indice =
      l.forecast > 0 && fracao > 0 ? l.vendido / l.forecast / fracao : 0;
    const porDiaReal = l.vendido / diasDecorridos;
    const porDiaPlano = l.forecast / DIAS_NO_MES;
    const excedente = l.excedente ?? 0;

    return {
      codigo: l.codigo,
      descricao: l.descricao,
      fornecedor: l.fornecedor,
      bu: l.bu,
      curva: l.curva,
      forecast: l.forecast,
      vendido: l.vendido,
      estoqueChao: l.chao,
      indice,
      diasNoRitmoReal: porDiaReal > 0 ? l.chao / porDiaReal : null,
      diasNoPlano: porDiaPlano > 0 ? l.chao / porDiaPlano : null,
      clientesFora: l.clientes ?? 0,
      excedente,
      concentracao:
        excedente > 0 && l.maior !== null ? l.maior / excedente : null,
    };
  });

  // Acelerado = acima da mesma banda de tolerância usada na tela de produto,
  // com um piso de unidades para item de giro mínimo não dominar a lista.
  const acelerados = todos.filter(
    (i) => i.indice > 1 + TOLERANCIA && i.vendido >= MINIMO_UNIDADES_CLIENTE,
  );

  const bus = [...new Set(acelerados.map((i) => i.bu))].sort(ordemRotulo);
  const curvas = [...new Set(acelerados.map((i) => i.curva))].sort(ordemRotulo);
  const fornecedores = [...new Set(acelerados.map((i) => i.fornecedor))].sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  );

  // Recorte sem o foco: base dos cartões e das contagens das abas.
  const termo = filtros.produto?.trim().toLowerCase();
  const noRecorte = acelerados.filter(
    (i) =>
      (!filtros.bu || i.bu === filtros.bu) &&
      (!filtros.curva || i.curva === filtros.curva) &&
      (!filtros.fornecedor || i.fornecedor === filtros.fornecedor) &&
      (!termo ||
        i.codigo.toLowerCase().includes(termo) ||
        (i.descricao ?? "").toLowerCase().includes(termo)),
  );

  const ehMulti = (i: ItemAcelerado) => i.clientesFora >= 2;
  const emRisco = (i: ItemAcelerado) =>
    i.diasNoRitmoReal !== null && i.diasNoRitmoReal < DIAS_RISCO;

  const foco = filtros.foco ?? "todos";
  const itens = noRecorte
    .filter(
      (i) =>
        (foco !== "multi" || ehMulti(i)) && (foco !== "risco" || emRisco(i)),
    )
    // Maior excedente primeiro: é o volume que a aceleração acrescentou, e
    // portanto o tamanho do problema. No empate, quem tem menos cobertura.
    .sort(
      (a, b) =>
        b.excedente - a.excedente ||
        (a.diasNoRitmoReal ?? Infinity) - (b.diasNoRitmoReal ?? Infinity),
    );

  return {
    itens,
    bus,
    curvas,
    fornecedores,
    totalUniverso: todos.length,
    totalAcelerados: acelerados.length,
    totaisFoco: {
      todos: noRecorte.length,
      multi: noRecorte.filter(ehMulti).length,
      risco: noRecorte.filter(emRisco).length,
    },
    excedenteTotal: noRecorte.reduce((a, i) => a + i.excedente, 0),
    ...janela,
  };
}

/** VAZIO por último; o resto em ordem alfabética. */
function ordemRotulo(a: string, b: string): number {
  if (a === VAZIO) return 1;
  if (b === VAZIO) return -1;
  return a.localeCompare(b, "pt-BR");
}

/** Um ponto da curva acumulada. */
export type PontoCurva = { dia: number; acumulado: number };

export type CurvaMes = {
  mes: string;
  /** Acumulado dia a dia; só até o dia com dado, no mês corrente. */
  pontos: PontoCurva[];
  /** Total do mês inteiro; `null` no mês corrente, que ainda não fechou. */
  totalMes: number | null;
};

export type ClienteFora = {
  cnpj: string;
  cliente: string;
  grupo: string | null;
  /** Comprado na janela do mês corrente. */
  atual: number;
  /** Mediana do próprio cliente na mesma janela dos meses anteriores. */
  mediana: number;
  excedente: number;
  fator: number;
};

export type DetalheItem = {
  codigo: string;
  curvas: CurvaMes[];
  clientes: ClienteFora[];
  diaCorte: number;
  mesCorrente: string;
};

/**
 * Detalhe de um item: a curva acumulada de cada mês e os clientes fora do padrão.
 *
 * A curva é acumulada por dia do mês, uma linha por mês — é a forma de ver
 * aceleração sem depender de nenhum limiar: no mesmo dia do mês, a linha do mês
 * corrente descola das outras ou não descola.
 */
export async function carregarDetalheItem(
  codigo: string,
  /** Data de referência do sistema, que define o mês da janela. */
  data: string,
  /**
   * Janela já calculada pela consulta principal. Opcional para a função
   * continuar utilizável sozinha, mas a tela sempre passa: eram duas leituras
   * idênticas no mesmo request.
   */
  janelaPronta?: Janela,
): Promise<DetalheItem> {
  const janela = janelaPronta ?? (await carregarJanela(data));

  const [diarios, clientes] = await Promise.all([
    prisma.$queryRawUnsafe<{ mes: string; dia: number; qtd: number }[]>(
      `SELECT to_char(h.data, 'YYYY-MM') AS mes,
              extract(day FROM h.data)::int AS dia,
              SUM(-h.quantidade)::float8 AS qtd
         FROM historico_vendas h
        WHERE h.cod_prod = $1 AND h.data >= $2::date
        GROUP BY 1, 2
        ORDER BY 1, 2`,
      codigo,
      janela.inicioBaseline,
    ),
    carregarClientesFora(
      codigo,
      janela.diaCorte,
      janela.mesCorrente,
      janela.inicioBaseline,
    ),
  ]);

  // Acumula por mês. O mês corrente pára no dia com dado; os outros vão até o
  // fim, para a comparação no mesmo ponto do mês ser visível na mesma escala.
  const porMes = new Map<string, { dia: number; qtd: number }[]>();
  for (const d of diarios) {
    porMes.set(d.mes, [
      ...(porMes.get(d.mes) ?? []),
      { dia: d.dia, qtd: d.qtd },
    ]);
  }

  const curvas: CurvaMes[] = [...porMes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, dias]) => {
      const ordenados = [...dias].sort((a, b) => a.dia - b.dia);
      let soma = 0;
      const pontos = ordenados.map((d) => {
        soma += d.qtd;
        return { dia: d.dia, acumulado: soma };
      });
      return {
        mes,
        pontos,
        totalMes: mes === janela.mesCorrente ? null : soma,
      };
    });

  return {
    codigo,
    curvas,
    // Excedente e fator já vêm calculados de `carregarClientesFora`, que é
    // agora o único lugar onde a regra mora.
    clientes,
    diaCorte: janela.diaCorte,
    mesCorrente: janela.mesCorrente,
  };
}

/**
 * Clientes que compraram fora do próprio padrão, na mesma janela do mês.
 *
 * Extraída de `carregarDetalheItem` para a tela de raio-X usar a mesma regra
 * numa janela diferente — lá o "mês corrente" é o mês de referência escolhido,
 * não o de hoje. Duas implementações da mesma comparação acabariam divergindo,
 * e a divergência apareceria como dois números diferentes para a mesma
 * pergunta em telas vizinhas.
 *
 * A comparação é de cada cliente consigo mesmo: mediana dos meses anteriores
 * **no mesmo recorte de dias**, para o mês em curso não perder por estar pela
 * metade. Mediana em vez de média porque com três ou quatro pontos um mês
 * atípico desloca a média inteira.
 */
export async function carregarClientesFora(
  codigo: string,
  diaCorte: number,
  mes: string,
  inicioBaseline: string,
): Promise<ClienteFora[]> {
  const linhas = await prisma.$queryRawUnsafe<
    {
      cnpj: string;
      cliente: string;
      grupo: string | null;
      atual: number;
      mediana: number;
    }[]
  >(
    `WITH janela AS (
       SELECT h.cnpj, MIN(h.nome) AS cliente,
              to_char(h.data, 'YYYY-MM') AS mes,
              SUM(-h.quantidade)::float8 AS qtd
         FROM historico_vendas h
        WHERE h.cod_prod = $1 AND h.cnpj IS NOT NULL
          AND h.data >= $4::date
          AND extract(day FROM h.data) <= $2
        GROUP BY 1, 3
     ),
     comparado AS (
       SELECT cnpj, MIN(cliente) AS cliente,
              SUM(qtd) FILTER (WHERE mes = $3) AS atual,
              PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY qtd)
                FILTER (WHERE mes < $3) AS mediana,
              COUNT(*) FILTER (WHERE mes < $3) AS meses_com_dado
         FROM janela GROUP BY 1
     )
     SELECT c.cnpj, c.cliente, g.cliente_grupo AS grupo,
            c.atual::float8, c.mediana::float8
       FROM comparado c
       LEFT JOIN ${gruposPorCnpj("($3 || '-01')")} g ON g.cliente_cnpj = c.cnpj
      WHERE c.atual IS NOT NULL AND c.mediana > 0
        AND c.meses_com_dado >= ${MINIMO_MESES_HISTORICO}
        AND c.atual >= ${MINIMO_UNIDADES_CLIENTE}
        AND c.atual >= c.mediana * ${FATOR_CLIENTE}
      ORDER BY (c.atual - c.mediana) DESC
      LIMIT 30`,
    codigo,
    diaCorte,
    mes,
    inicioBaseline,
  );

  return linhas.map((l) => ({
    cnpj: l.cnpj,
    cliente: l.cliente,
    grupo: l.grupo,
    atual: l.atual,
    mediana: l.mediana,
    excedente: l.atual - l.mediana,
    fator: l.mediana > 0 ? l.atual / l.mediana : 0,
  }));
}

/** Um mês disponível para consulta, com a data que o representa. */
export type MesAceleracao = {
  /** "2026-09" — o que aparece no seletor. */
  mes: string;
  /**
   * Data a usar como referência para esse mês.
   *
   * É o último snapshot do simulador dentro dele, e não o último dia do
   * calendário: o `vendido` da tela sai de `s.data_snapshot = $1` — casamento
   * exato, não intervalo. Apontar para 30 de setembro quando a última carga foi
   * dia 11 devolveria tela vazia.
   */
  data: string;
};

/**
 * Meses que podem ser consultados, do mais recente para o mais antigo.
 *
 * Um mês só entra quando tem as **duas** cargas: simulador, de onde vem o
 * vendido, e forecast, que é contra o que ele é medido. Faltando qualquer uma
 * não há aceleração a calcular, e oferecer o mês no seletor seria convidar para
 * uma tela vazia.
 *
 * A regra sai do dado, e não de uma data fixa no código: hoje isso exclui julho,
 * que não tem forecast carregado; carregue o de julho e ele aparece sozinho, sem
 * ninguém precisar lembrar de mexer aqui.
 */
export async function listarMesesAceleracao(): Promise<MesAceleracao[]> {
  const doSimulador = await listarSnapshots("simulador");

  // `listarSnapshots` vem do mais recente para o mais antigo, então o primeiro
  // de cada mês já é o último dia carregado dele.
  const porMes = new Map<string, string>();
  for (const data of doSimulador) {
    const mes = data.slice(0, 7);
    if (!porMes.has(mes)) porMes.set(mes, data);
  }

  const candidatos = [...porMes.entries()].map(([mes, data]) => ({
    mes,
    data,
  }));
  if (candidatos.length === 0) return [];

  /**
   * O mês tem forecast **utilizável** na carga que a tela vai usar?
   *
   * Duas sutilezas, e as duas já morderam. A primeira: não basta existir carga
   * de forecast no mês — a de agosto tem 6.168 linhas com `codigo` nulo, órfãs
   * de uma reimportação de Produtos, em que o `onDelete: SetNull` zera o código
   * em cascata sem erro nenhum.
   *
   * A segunda: a verificação tem de olhar **a mesma carga que a consulta
   * principal escolhe** — a última do mês até a data de referência. Agosto tem
   * carga boa num snapshot anterior e carga órfã no último; checar "o mês tem
   * alguma linha com código" diria que sim, e a tela viria vazia mesmo assim.
   */
  const usaveis = await prisma.$queryRawUnsafe<{ mes: string }[]>(
    `SELECT c.mes
       FROM unnest($1::text[], $2::date[]) AS c(mes, data)
      WHERE EXISTS (
        SELECT 1 FROM forecast f
         WHERE f.data_snapshot = (
                 SELECT MAX(_f.data_snapshot) FROM forecast _f
                  WHERE _f.data_snapshot >= date_trunc('month', c.data)
                    AND _f.data_snapshot <= c.data
               )
           AND f.codigo IS NOT NULL AND f.forecast_m0 > 0
           AND ${torreValidaSql("f")}
      )`,
    candidatos.map((c) => c.mes),
    candidatos.map((c) => c.data),
  );

  const ok = new Set(usaveis.map((u) => u.mes));
  return candidatos.filter((c) => ok.has(c.mes));
}
