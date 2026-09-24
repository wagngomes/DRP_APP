import { prisma } from "@/lib/prisma";
import {
  acuracidade,
  erroAbsoluto,
  vies,
  wmape,
  type ParPrevisao,
} from "@/utils/acuracidade";
import { agruparPorRotulo } from "@/utils/rotulos";

/**
 * O raio-X de um produto num mês: de onde vem o consenso, quem são os clientes
 * por trás da parte contratada, o que de fato saiu, o que a previsão dizia e o
 * que entrou no estoque.
 *
 * O mês de referência é a **competência** do arquivo, não o dia em que ele foi
 * carregado — tanto em `sop` quanto em `contratos`. Dentro de uma competência
 * pode haver mais de uma carga (reimportação corrigida); vale sempre a mais
 * recente, e é por isso que cada consulta filtra pelo MAX do `data_snapshot`
 * daquela competência em vez de somar tudo que estiver lá.
 */

/** Primeiro e último dia (exclusivo) do mês de uma data ISO. */
export function limitesDoMes(mes: string): { inicio: string; fim: string } {
  const d = new Date(`${mes}T00:00:00.000Z`);
  const inicio = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const fim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return { inicio: inicio.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
}

/**
 * Recorte da carga que vale para uma competência.
 *
 * Duas condições, não uma: a competência define o mês do negócio, e o
 * `data_snapshot` desempata entre cargas do mesmo mês. Sem a segunda, uma
 * reimportação dobraria todos os números sem deixar rastro na tela.
 */
function cargaVigente(tabela: string, alias: string): string {
  return `${alias}.competencia >= $2::date AND ${alias}.competencia < $3::date
      AND ${alias}.data_snapshot = (
        SELECT MAX(_c.data_snapshot) FROM ${tabela} _c
         WHERE _c.competencia >= $2::date AND _c.competencia < $3::date
      )`;
}

/**
 * Grupo do cliente a partir do CNPJ.
 *
 * `DISTINCT ON` porque o cadastro tem uma linha por loja: o mesmo CNPJ aparece
 * repetido e um join direto multiplicaria as linhas de contrato.
 */
const GRUPOS_POR_CNPJ = `(
  SELECT DISTINCT ON (cliente_cnpj) cliente_cnpj, cliente_grupo
    FROM clientes_grupos WHERE cliente_cnpj IS NOT NULL ORDER BY cliente_cnpj
)`;

export type DivisaoSop = {
  divisao: string;
  consenso: number;
  /**
   * O que de fato saiu na parcela desta divisão.
   *
   * Só "Contratos" e "Spot" têm realizado apurável: a venda é rastreada até o
   * CNPJ, e o que se sabe dele é se tinha contrato do item no mês. As demais
   * divisões não têm como ser reconhecidas na nota, então ficam `null` — que é
   * diferente de zero e a tela precisa distinguir.
   */
  realizado: number | null;
  erro: number | null;
  vies: number | null;
};

export type GrupoContrato = {
  grupo: string;
  clientes: number;
  contratado: number;
  reserva: number;
  /** Quanto este grupo de fato comprou do item no mês. */
  vendido: number;
  /** Do cadastro de grupos, ou da própria base de contratos. */
  origem: "cadastro" | "arquivo";
};

export type RaioXProduto = {
  codigo: string;
  descricao: string | null;
  fornecedor: string | null;
  mes: string;
  /** Composição do consenso por divisão, maior primeiro. */
  divisoes: DivisaoSop[];
  consensoTotal: number;
  /** A divisão "Contratos" do S&OP, se existir. */
  consensoContratos: number;
  contratos: {
    grupos: GrupoContrato[];
    total: number;
    reserva: number;
    clientes: number;
  };
  vendas: {
    /** O que saiu para clientes com contrato deste item no mês. */
    comContrato: number;
    /** O resto: venda avulsa, sem contrato. */
    spot: number;
    total: number;
  };
  forecast: {
    m0: number;
    m0Ajustado: number;
    filiais: number;
    snapshot: Date | null;
  };
  recebido: { quantidade: number; notas: number };
  /** Como cada previsão se saiu contra o que aconteceu. */
  acerto: {
    consenso: Medida;
    forecastM0: Medida;
    forecastAjustado: Medida;
    /**
     * WMAPE da composição: quanto o rateio entre divisões errou, ponderado
     * pelo volume de cada uma.
     *
     * Existe porque o total pode acertar em cheio enquanto a composição erra
     * feio — previu contrato de menos e spot de mais, os dois se cancelam no
     * total e ninguém percebe que a origem da demanda foi outra.
     */
    composicao: number | null;
  };
};

/** Uma previsão medida contra o realizado. */
export type Medida = {
  previsto: number;
  realizado: number;
  erro: number | null;
  vies: number | null;
  acuracidade: number | null;
};

function medir(previsto: number, realizado: number): Medida {
  const par: ParPrevisao = { previsto, realizado };
  const erro = erroAbsoluto(par);
  return { previsto, realizado, erro, vies: vies(par), acuracidade: acuracidade(erro) };
}

export async function carregarRaioX(codigo: string, mes: string): Promise<RaioXProduto | null> {
  const { inicio, fim } = limitesDoMes(mes);

  const [produto, divisoesCru, grupos, vendas, forecast, recebido] = await Promise.all([
    prisma.$queryRawUnsafe<
      { codigo: string; descricao: string | null; fornecedor: string | null }[]
    >(
      `SELECT p.codigo, p.descricao,
              (SELECT s.fornecedor FROM simulador s
                WHERE s.codigo = p.codigo AND s.fornecedor IS NOT NULL
                ORDER BY s.data_snapshot DESC LIMIT 1) AS fornecedor
         FROM produtos p WHERE p.codigo = $1`,
      codigo
    ),

    prisma.$queryRawUnsafe<{ divisao: string | null; consenso: number }[]>(
      `SELECT s.divisao, SUM(s.consenso)::float8 AS consenso
         FROM sop s
        WHERE s.codigo = $1 AND ${cargaVigente("sop", "s")}
        GROUP BY s.divisao`,
      codigo,
      inicio,
      fim
    ),

    // O grupo sai do cadastro pelo CNPJ; sem cadastro, da própria coluna do
    // arquivo. Os que caem no segundo caminho não são resto: são clientes que
    // existem e precisam aparecer com nome.
    prisma.$queryRawUnsafe<
      {
        grupo: string;
        clientes: number;
        contratado: number;
        reserva: number;
        docadastro: boolean;
      }[]
    >(
      `SELECT COALESCE(g.cliente_grupo, c.grupo, 'Sem grupo') AS grupo,
              COUNT(DISTINCT c.cnpj)::int AS clientes,
              SUM(c.quantidade_final)::float8 AS contratado,
              SUM(c.reserva_final_contrato)::float8 AS reserva,
              bool_or(g.cliente_grupo IS NOT NULL) AS docadastro
         FROM contratos c
         LEFT JOIN ${GRUPOS_POR_CNPJ} g ON g.cliente_cnpj = c.cnpj
        WHERE c.codigo = $1 AND ${cargaVigente("contratos", "c")}
        GROUP BY 1`,
      codigo,
      inicio,
      fim
    ),

    // A alocação Contratos x Spot acontece por CNPJ: quem comprou e tem
    // contrato deste item neste mês entra no grupo dele; quem não tem é Spot.
    //
    // O sinal vem invertido da origem (venda é saída de estoque), por isso o
    // menos. Sem ele todos os realizados apareceriam negativos.
    prisma.$queryRawUnsafe<{ grupo: string | null; quantidade: number }[]>(
      `WITH contratados AS (
         SELECT DISTINCT ON (c.cnpj) c.cnpj,
                COALESCE(g.cliente_grupo, c.grupo, 'Sem grupo') AS grupo
           FROM contratos c
           LEFT JOIN ${GRUPOS_POR_CNPJ} g ON g.cliente_cnpj = c.cnpj
          WHERE c.codigo = $1 AND ${cargaVigente("contratos", "c")}
            AND c.cnpj IS NOT NULL
          ORDER BY c.cnpj
       )
       SELECT k.grupo, SUM(-h.quantidade)::float8 AS quantidade
         FROM historico_vendas h
         LEFT JOIN contratados k ON k.cnpj = h.cnpj
        WHERE h.cod_prod = $1 AND h.data >= $2::date AND h.data < $3::date
        GROUP BY k.grupo`,
      codigo,
      inicio,
      fim
    ),

    // Forecast é do mês: vale a carga mais recente dentro dele.
    prisma.$queryRawUnsafe<
      {
        m0: number;
        m0ajustado: number;
        filiais: number;
        snapshot: Date | null;
      }[]
    >(
      `SELECT COALESCE(SUM(f.forecast_m0),0)::float8 AS m0,
              COALESCE(SUM(f.forecast_m0_atualizado),0)::float8 AS m0ajustado,
              COUNT(*)::int AS filiais,
              MAX(f.data_snapshot) AS snapshot
         FROM forecast f
        WHERE f.codigo = $1
          AND f.data_snapshot = (
            SELECT MAX(_f.data_snapshot) FROM forecast _f
             WHERE _f.data_snapshot >= $2::date AND _f.data_snapshot < $3::date
          )`,
      codigo,
      inicio,
      fim
    ),

    prisma.$queryRawUnsafe<{ quantidade: number; notas: number }[]>(
      `SELECT COALESCE(SUM(r.quantidade),0)::float8 AS quantidade, COUNT(*)::int AS notas
         FROM recebimento r
        WHERE r.codigo = $1 AND r.data >= $2::date AND r.data < $3::date`,
      codigo,
      inicio,
      fim
    ),
  ]);

  if (produto.length === 0) return null;

  // As divisões passam pelo normalizador antes de somar: "Adicional de
  // Contratos" e "Adicional Contratos" são a mesma coisa escrita de dois
  // jeitos, e como duas linhas cada uma pareceria menor do que é.
  const consensoPorDivisao = agruparPorRotulo(
    divisoesCru.filter((d) => d.divisao),
    (d) => d.divisao!,
    (d) => d.consenso ?? 0
  );

  const vendidoPorGrupo = new Map<string, number>();
  let spot = 0;
  for (const v of vendas) {
    if (v.grupo === null) spot += v.quantidade ?? 0;
    else vendidoPorGrupo.set(v.grupo, (vendidoPorGrupo.get(v.grupo) ?? 0) + (v.quantidade ?? 0));
  }

  const gruposCompletos: GrupoContrato[] = grupos
    .map((g) => ({
      grupo: g.grupo,
      clientes: g.clientes,
      contratado: g.contratado ?? 0,
      reserva: g.reserva ?? 0,
      vendido: vendidoPorGrupo.get(g.grupo) ?? 0,
      origem: g.docadastro ? ("cadastro" as const) : ("arquivo" as const),
    }))
    .sort((a, b) => b.contratado - a.contratado || a.grupo.localeCompare(b.grupo, "pt-BR"));

  const comContrato = [...vendidoPorGrupo.values()].reduce((a, v) => a + v, 0);
  const contratos = {
    grupos: gruposCompletos,
    total: gruposCompletos.reduce((a, g) => a + g.contratado, 0),
    reserva: gruposCompletos.reduce((a, g) => a + g.reserva, 0),
    clientes: gruposCompletos.reduce((a, g) => a + g.clientes, 0),
  };

  // O realizado por divisão só existe onde a venda pode ser reconhecida: a
  // nota tem CNPJ, e do CNPJ se sabe apenas se havia contrato do item no mês.
  // "Operadoras" e "Insuma" não têm marca na venda, então ficam sem medida —
  // e sem medida é diferente de zero.
  const realizadoDaDivisao = (divisao: string): number | null => {
    const d = divisao.toLowerCase();
    if (d === "contratos") return comContrato;
    if (d === "spot") return spot;
    return null;
  };

  const divisoes: DivisaoSop[] = consensoPorDivisao
    .map((d) => {
      const realizado = realizadoDaDivisao(d.rotulo);
      const par = realizado === null ? null : { previsto: d.valor, realizado };
      return {
        divisao: d.rotulo,
        consenso: d.valor,
        realizado,
        erro: par ? erroAbsoluto(par) : null,
        vies: par ? vies(par) : null,
      };
    })
    .sort((a, b) => b.consenso - a.consenso || a.divisao.localeCompare(b.divisao, "pt-BR"));

  const consensoTotal = divisoes.reduce((a, d) => a + d.consenso, 0);

  // O WMAPE da composição usa só as divisões mensuráveis. Incluir as outras
  // com realizado zero as contaria como erro total, e o número deixaria de
  // medir o rateio para medir a ausência de rastreio.
  const paresComposicao = divisoes
    .filter((d): d is DivisaoSop & { realizado: number } => d.realizado !== null)
    .map((d) => ({ previsto: d.consenso, realizado: d.realizado }));

  return {
    codigo: produto[0].codigo,
    descricao: produto[0].descricao,
    fornecedor: produto[0].fornecedor,
    mes: inicio,
    divisoes,
    consensoTotal,
    consensoContratos: divisoes.find((d) => d.divisao.toLowerCase() === "contratos")?.consenso ?? 0,
    contratos,
    vendas: { comContrato, spot, total: comContrato + spot },
    forecast: {
      m0: forecast[0]?.m0 ?? 0,
      m0Ajustado: forecast[0]?.m0ajustado ?? 0,
      filiais: forecast[0]?.filiais ?? 0,
      snapshot: forecast[0]?.snapshot ?? null,
    },
    recebido: {
      quantidade: recebido[0]?.quantidade ?? 0,
      notas: recebido[0]?.notas ?? 0,
    },
    acerto: {
      consenso: medir(consensoTotal, comContrato + spot),
      forecastM0: medir(forecast[0]?.m0 ?? 0, comContrato + spot),
      forecastAjustado: medir(forecast[0]?.m0ajustado ?? 0, comContrato + spot),
      composicao: wmape(paresComposicao),
    },
  };
}

/** Meses com dado de S&OP, do mais recente para o mais antigo. */
export async function listarMesesSop(): Promise<string[]> {
  const r = await prisma.$queryRawUnsafe<{ competencia: Date }[]>(
    `SELECT DISTINCT competencia FROM sop WHERE competencia IS NOT NULL ORDER BY competencia DESC`
  );
  return r.map((x) => x.competencia.toISOString().slice(0, 10));
}
