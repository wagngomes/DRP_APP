/**
 * Aceleração de venda e o cliente que a causou.
 *
 * O sistema já sabia dizer *que* um item acelerou (`calcularRitmo`, comparando o
 * vendido do mês com o forecast proporcional). O que faltava é o **porquê**: em
 * geral um item dispara porque um cliente específico saiu do padrão, e é essa
 * frase que transforma o alerta em algo acionável — "a Unimed compra 400 por mês
 * deste item e comprou 1.000 de uma vez".
 *
 * Determinístico: a detecção do desvio é estatística, feita em SQL. A IA recebe
 * o desvio pronto e escreve a narrativa.
 *
 * Sinal das quantidades: `historico_vendas` registra venda como saída, com
 * quantidade negativa nas 457 mil linhas. Todas as somas aqui invertem o sinal.
 */
import { prisma } from "@/lib/prisma";

/** Quantas vezes acima da mediana histórica para o mês virar anomalia. */
export const FATOR_ANOMALIA = 2;
/** Piso absoluto: sem ele, 1 virando 3 unidades vira "anomalia". */
export const MINIMO_UNIDADES = 10;
/** Meses anteriores usados como base de comparação. */
export const MESES_BASELINE = 4;

export type AnomaliaCliente = {
  codigo: string;
  /** Documento do cliente como vem no histórico. */
  cnpj: string;
  cliente: string;
  /** Grupo do cliente; `null` quando o CNPJ não está no cadastro de grupos. */
  grupo: string | null;
  /** Quantidade comprada no mês analisado. */
  mesAtual: number;
  /** Mediana mensal dos meses anteriores — mais robusta que média com 4 pontos. */
  mediana: number;
  /** Quantas vezes acima da mediana. */
  fator: number;
  /** Unidades acima do padrão: o que efetivamente puxou o item. */
  excedente: number;
};

export type DadosVendas = {
  /** Mês analisado (yyyy-mm) — o último com dado na base. */
  mesAnalisado: string;
  /** Meses usados como referência. */
  baseline: string[];
  anomalias: AnomaliaCliente[];
  /** Cobertura do cadastro de grupos, para a tela ser honesta sobre a lacuna. */
  semGrupo: number;
};

/**
 * Anomalias do último mês com dado.
 *
 * O mês analisado é o mais recente da base, e não o da data de referência do
 * sistema: comparar contra um mês vazio produziria "queda de 100%" em tudo.
 * Quando a base for reimportada com o mês corrente, o resultado passa a
 * refletir a operação de hoje sem mudança de código.
 */
export async function calcularAnomaliasVenda(limite = 50): Promise<DadosVendas> {
  const linhas = await prisma.$queryRawUnsafe<
    {
      codigo: string; cnpj: string; cliente: string; grupo: string | null;
      mes_atual: number; mediana: number; mes_analisado: string;
    }[]
  >(
    `WITH ref AS (
       SELECT to_char(MAX(data), 'YYYY-MM') AS mes FROM historico_vendas
     ),
     mensal AS (
       SELECT h.cod_prod AS codigo,
              h.cnpj,
              MIN(h.nome) AS cliente,
              to_char(h.data, 'YYYY-MM') AS mes,
              -- Venda entra negativa na origem.
              SUM(-h.quantidade)::float8 AS qtd
         FROM historico_vendas h
        WHERE h.cod_prod IS NOT NULL AND h.cnpj IS NOT NULL AND h.data IS NOT NULL
        GROUP BY 1, 2, 4
     ),
     comparado AS (
       SELECT m.codigo, m.cnpj, MIN(m.cliente) AS cliente,
              SUM(m.qtd) FILTER (WHERE m.mes = (SELECT mes FROM ref)) AS mes_atual,
              PERCENTILE_CONT(0.5) WITHIN GROUP (
                ORDER BY m.qtd
              ) FILTER (WHERE m.mes <> (SELECT mes FROM ref)) AS mediana
         FROM mensal m
        GROUP BY 1, 2
     )
     SELECT c.codigo, c.cnpj, c.cliente,
            g.cliente_grupo AS grupo,
            c.mes_atual::float8,
            c.mediana::float8,
            (SELECT mes FROM ref) AS mes_analisado
       FROM comparado c
       LEFT JOIN clientes_grupos g ON g.cliente_cnpj = c.cnpj
      WHERE c.mes_atual IS NOT NULL
        AND c.mediana IS NOT NULL
        AND c.mediana > 0
        AND c.mes_atual >= $1
        AND c.mes_atual >= c.mediana * $2
      ORDER BY (c.mes_atual - c.mediana) DESC
      LIMIT $3`,
    MINIMO_UNIDADES,
    FATOR_ANOMALIA,
    limite
  );

  const anomalias = linhas.map((l): AnomaliaCliente => ({
    codigo: l.codigo,
    cnpj: l.cnpj,
    cliente: l.cliente,
    grupo: l.grupo,
    mesAtual: l.mes_atual,
    mediana: l.mediana,
    fator: l.mediana > 0 ? l.mes_atual / l.mediana : 0,
    excedente: l.mes_atual - l.mediana,
  }));

  const mesAnalisado = linhas[0]?.mes_analisado ?? "";
  const [ano, mes] = mesAnalisado.split("-").map(Number);
  const baseline = Array.from({ length: MESES_BASELINE }, (_, i) => {
    const d = new Date(Date.UTC(ano, mes - 1 - (i + 1), 1));
    return d.toISOString().slice(0, 7);
  }).reverse();

  return {
    mesAnalisado,
    baseline,
    anomalias,
    semGrupo: anomalias.filter((a) => !a.grupo).length,
  };
}
