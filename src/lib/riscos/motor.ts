/**
 * Motor de risco de ruptura.
 *
 * Cruza duas coisas que o sistema já sabia isoladamente: quantos dias de estoque
 * cada posição item × CD tem, e quando a próxima reposição chega naquele CD. O
 * resultado é `diasDescobertos` — o vão entre o estoque acabar e a reposição
 * chegar. É esse número, e não a ruptura de hoje, que diz onde agir.
 *
 * Determinístico de ponta a ponta: nenhuma chamada de modelo, nenhum julgamento.
 * A IA consome a saída daqui; não participa do cálculo.
 */
import { prisma } from "@/lib/prisma";
import { joinFornecedor, nomeFornecedor } from "@/lib/fornecedor";
import { simuladorPorCd } from "@/utils/cds-virtuais";
import {
  COLUNAS_ESTOQUE_CHAO,
  COLUNAS_ESTOQUE_TOTAL,
  DIAS_NO_MES,
  somaSql,
  torreValidaSql,
  snapshotMensalSql,
} from "@/utils/dias-estoque";
import { VAZIO } from "@/lib/fornecedores/agregacao";
import {
  carregarChegadas,
  chaveChegada,
  type ParametrosProjecao,
} from "@/lib/reposicoes/chegadas";
import type { Coberturas } from "@/lib/parametros";
import type { PosicaoRisco, Severidade } from "./tipos";

const EST_CHAO = somaSql(COLUNAS_ESTOQUE_CHAO, "s");
const EST_TOTAL = somaSql(COLUNAS_ESTOQUE_TOTAL, "s");

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Dias corridos entre duas datas. O consumo não pára no fim de semana. */
function diasEntre(de: Date, ate: Date): number {
  return (ate.getTime() - de.getTime()) / MS_POR_DIA;
}

function somarDias(base: Date, dias: number): Date {
  return new Date(base.getTime() + dias * MS_POR_DIA);
}

function limitesDoMes(data: string): [string, string] {
  const [ano, mes] = data.split("-").map(Number);
  return [
    new Date(Date.UTC(ano, mes - 1, 1)).toISOString().slice(0, 10),
    new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10),
  ];
}

/**
 * Posições válidas com estoque do dia.
 *
 * Mesmo universo da Disponibilidade e da tela de fornecedores: forecast do mês
 * maior que zero e torre "considerar". O LEFT JOIN é proposital — item com
 * forecast que nem aparece no simulador do CD conta como estoque zero.
 */
async function carregarPosicoes(data: string) {
  const [inicioMes, proximoMes] = limitesDoMes(data);

  return prisma.$queryRawUnsafe<
    {
      codigo: string; descricao: string | null; filial: string; fornecedor: string;
      bu: string; curva: string; forecast: number; chao: number; total: number;
    }[]
  >(
    `SELECT f.codigo,
            pr.descricao,
            f.filial,
            COALESCE(NULLIF(trim(f.b_u), ''), '${VAZIO}') AS bu,
            COALESCE(NULLIF(upper(trim(f.curva)), ''), '${VAZIO}') AS curva,
            COALESCE((
              SELECT ${nomeFornecedor("s2")}
                FROM simulador s2 ${joinFornecedor("s2")}
               WHERE s2.codigo = f.codigo AND s2.data_snapshot = $1::date
                 AND s2.fornecedor IS NOT NULL
               LIMIT 1
            ), 'Sem fornecedor') AS fornecedor,
            f.forecast_m0::float8 AS forecast,
            COALESCE(${EST_CHAO}, 0)::float8  AS chao,
            COALESCE(${EST_TOTAL}, 0)::float8 AS total
       FROM forecast f
       LEFT JOIN ${simuladorPorCd("s.data_snapshot = $1::date")} s
         ON s.codigo = f.codigo AND s.filial = f.filial AND s.data_snapshot = $1::date
       LEFT JOIN produtos pr ON pr.codigo = f.codigo
      WHERE f.data_snapshot >= $2::date AND f.data_snapshot < $3::date
        AND ${snapshotMensalSql("forecast", "f", "$1")}
        AND f.forecast_m0 > 0
        AND ${torreValidaSql("f")}
        AND f.filial IS NOT NULL`,
    data,
    inicioMes,
    proximoMes
  );
}

export type DadosRisco = {
  posicoes: PosicaoRisco[];
  /** Contagem por severidade, para o cabeçalho do dossiê e da tela. */
  totais: Record<Severidade, number>;
};

export async function calcularRiscos(
  data: string,
  parametros: ParametrosProjecao,
  coberturas: Coberturas
): Promise<DadosRisco> {
  const referencia = new Date(`${data}T00:00:00.000Z`);
  const [linhas, chegadas] = await Promise.all([
    carregarPosicoes(data),
    carregarChegadas(data, parametros),
  ]);

  const posicoes = linhas.map((l): PosicaoRisco => {
    const consumoDiario = l.forecast / DIAS_NO_MES;
    // Forecast > 0 é filtrado no SQL, mas a divisão fica protegida mesmo assim.
    const diasChao = consumoDiario > 0 ? l.chao / consumoDiario : null;
    const diasTotal = consumoDiario > 0 ? l.total / consumoDiario : null;
    const dataRuptura = diasChao === null ? null : somarDias(referencia, diasChao);

    const reposicoes = chegadas.get(chaveChegada(l.codigo, l.filial)) ?? [];
    const primeiraChegada = reposicoes[0] ?? null;
    const diasAteChegada = primeiraChegada
      ? diasEntre(referencia, primeiraChegada.chegada)
      : null;

    // O vão entre acabar e chegar. Sem reposição, o que falta para completar o
    // horizonte crítico — é até onde conseguimos enxergar.
    const diasDescobertos =
      diasChao === null
        ? 0
        : diasAteChegada === null
          ? Math.max(0, coberturas.critico - diasChao)
          : Math.max(0, diasAteChegada - diasChao);

    const rompeNoHorizonte = diasChao !== null && diasChao < coberturas.critico;
    const severidade: Severidade =
      l.chao <= 0
        ? "rompido"
        : rompeNoHorizonte && diasDescobertos > 0
          ? "vai_romper"
          : rompeNoHorizonte
            ? "no_limite"
            : "ok";

    return {
      codigo: l.codigo,
      descricao: l.descricao,
      filial: l.filial,
      fornecedor: l.fornecedor,
      bu: l.bu,
      curva: l.curva,
      forecast: l.forecast,
      estoqueChao: l.chao,
      estoqueTotal: l.total,
      consumoDiario,
      diasChao,
      diasTotal,
      dataRuptura,
      primeiraChegada,
      diasAteChegada,
      diasDescobertos,
      severidade,
      reposicoes,
    };
  });

  const totais: Record<Severidade, number> = {
    rompido: 0,
    vai_romper: 0,
    no_limite: 0,
    ok: 0,
  };
  for (const p of posicoes) totais[p.severidade] += 1;

  return { posicoes, totais };
}
