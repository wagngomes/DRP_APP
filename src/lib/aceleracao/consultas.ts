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
 * Sinal: `historico_vendas` grava venda como saída, com quantidade negativa.
 * Todas as somas invertem o sinal.
 */
import { prisma } from "@/lib/prisma";
import { joinFornecedor, nomeFornecedor } from "@/lib/fornecedor";
import { VAZIO } from "@/lib/fornecedores/agregacao";
import {
  COLUNAS_ESTOQUE_CHAO,
  COLUNAS_VENDIDO_M0,
  DIAS_NO_MES,
  snapshotMensalSql,
  somaSql,
  torreValidaSql,
} from "@/utils/dias-estoque";
import { fracaoDoMesDecorrida, TOLERANCIA } from "@/utils/ritmo-venda";

const CHAO = somaSql(COLUNAS_ESTOQUE_CHAO, "s");
const VENDIDO = somaSql(COLUNAS_VENDIDO_M0, "s");

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
 * Janela de comparação: até que dia do mês corrente há venda registrada.
 *
 * Sai do último dia com dado, não da data de referência do sistema: se o
 * histórico foi carregado até dia 3 e a referência é dia 4, comparar 1..4 de
 * setembro contra 1..4 dos outros meses tiraria um dia inteiro só de setembro.
 */
export type Janela = {
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
export async function carregarJanela(): Promise<Janela> {
  const [linha] = await prisma.$queryRawUnsafe<{ dia: number; mes: string }[]>(
    `SELECT extract(day FROM MAX(data))::int AS dia,
            to_char(MAX(data), 'YYYY-MM') AS mes
       FROM historico_vendas`
  );

  const mesCorrente = linha?.mes ?? "";
  if (!mesCorrente) {
    return { diaCorte: 0, mesCorrente: "", mesesBaseline: [], inicioBaseline: "1970-01-01" };
  }

  const [ano, mes] = mesCorrente.split("-").map(Number);
  const mesesBaseline = Array.from({ length: MESES_BASELINE }, (_, i) =>
    new Date(Date.UTC(ano, mes - 1 - (MESES_BASELINE - i), 1)).toISOString().slice(0, 7)
  );

  return {
    diaCorte: linha?.dia ?? 0,
    mesCorrente,
    mesesBaseline,
    inicioBaseline: `${mesesBaseline[0]}-01`,
  };
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
  janelaPronta?: Janela
): Promise<DadosAceleracao> {
  const janela = janelaPronta ?? (await carregarJanela());
  const fracao = fracaoDoMesDecorrida(data);
  const diasDecorridos = Math.max(1, fracao * DIAS_NO_MES);

  const linhas = await prisma.$queryRawUnsafe<
    {
      codigo: string; descricao: string | null; fornecedor: string;
      bu: string; curva: string; forecast: number; vendido: number;
      chao: number; clientes: number | null; excedente: number | null;
      maior: number | null;
    }[]
  >(
    // Cia é a soma de todos os CDs, então o simulador entra direto, sem a
    // separação de CDs virtuais: ela redistribui entre filiais e não altera o
    // total. O forecast já traz linhas das filiais "90", e por isso os dois
    // lados da divisão cobrem o mesmo universo.
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
     sim AS (
       SELECT s.codigo,
              SUM(COALESCE(${VENDIDO}, 0))::float8 AS vendido,
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
            COALESCE(sim.vendido, 0) AS vendido,
            COALESCE(sim.chao, 0) AS chao,
            cli.clientes, cli.excedente, cli.maior
       FROM fc
       LEFT JOIN sim ON sim.codigo = fc.codigo
       LEFT JOIN cli ON cli.codigo = fc.codigo
       LEFT JOIN produtos pr ON pr.codigo = fc.codigo`,
    data,
    janela.diaCorte,
    janela.mesCorrente,
    janela.inicioBaseline
  );

  const todos = linhas.map((l): ItemAcelerado => {
    const indice = l.forecast > 0 ? l.vendido / l.forecast / fracao : 0;
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
      concentracao: excedente > 0 && l.maior !== null ? l.maior / excedente : null,
    };
  });

  // Acelerado = acima da mesma banda de tolerância usada na tela de produto,
  // com um piso de unidades para item de giro mínimo não dominar a lista.
  const acelerados = todos.filter(
    (i) => i.indice > 1 + TOLERANCIA && i.vendido >= MINIMO_UNIDADES_CLIENTE
  );

  const bus = [...new Set(acelerados.map((i) => i.bu))].sort(ordemRotulo);
  const curvas = [...new Set(acelerados.map((i) => i.curva))].sort(ordemRotulo);
  const fornecedores = [...new Set(acelerados.map((i) => i.fornecedor))].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
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
        (i.descricao ?? "").toLowerCase().includes(termo))
  );

  const ehMulti = (i: ItemAcelerado) => i.clientesFora >= 2;
  const emRisco = (i: ItemAcelerado) =>
    i.diasNoRitmoReal !== null && i.diasNoRitmoReal < DIAS_RISCO;

  const foco = filtros.foco ?? "todos";
  const itens = noRecorte
    .filter((i) => (foco !== "multi" || ehMulti(i)) && (foco !== "risco" || emRisco(i)))
    // Maior excedente primeiro: é o volume que a aceleração acrescentou, e
    // portanto o tamanho do problema. No empate, quem tem menos cobertura.
    .sort(
      (a, b) =>
        b.excedente - a.excedente ||
        (a.diasNoRitmoReal ?? Infinity) - (b.diasNoRitmoReal ?? Infinity)
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
  /**
   * Janela já calculada pela consulta principal. Opcional para a função
   * continuar utilizável sozinha, mas a tela sempre passa: eram duas leituras
   * idênticas no mesmo request.
   */
  janelaPronta?: Janela
): Promise<DetalheItem> {
  const janela = janelaPronta ?? (await carregarJanela());

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
      janela.inicioBaseline
    ),
    prisma.$queryRawUnsafe<
      {
        cnpj: string; cliente: string; grupo: string | null;
        atual: number; mediana: number;
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
         LEFT JOIN (
           SELECT DISTINCT cliente_cnpj, cliente_grupo FROM clientes_grupos
         ) g ON g.cliente_cnpj = c.cnpj
        WHERE c.atual IS NOT NULL AND c.mediana > 0
          AND c.meses_com_dado >= ${MINIMO_MESES_HISTORICO}
          AND c.atual >= ${MINIMO_UNIDADES_CLIENTE}
          AND c.atual >= c.mediana * ${FATOR_CLIENTE}
        ORDER BY (c.atual - c.mediana) DESC
        LIMIT 30`,
      codigo,
      janela.diaCorte,
      janela.mesCorrente,
      janela.inicioBaseline
    ),
  ]);

  // Acumula por mês. O mês corrente pára no dia com dado; os outros vão até o
  // fim, para a comparação no mesmo ponto do mês ser visível na mesma escala.
  const porMes = new Map<string, { dia: number; qtd: number }[]>();
  for (const d of diarios) {
    porMes.set(d.mes, [...(porMes.get(d.mes) ?? []), { dia: d.dia, qtd: d.qtd }]);
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
    clientes: clientes.map((c) => ({
      cnpj: c.cnpj,
      cliente: c.cliente,
      grupo: c.grupo,
      atual: c.atual,
      mediana: c.mediana,
      excedente: c.atual - c.mediana,
      fator: c.mediana > 0 ? c.atual / c.mediana : 0,
    })),
    diaCorte: janela.diaCorte,
    mesCorrente: janela.mesCorrente,
  };
}
