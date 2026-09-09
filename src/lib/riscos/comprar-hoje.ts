/**
 * O que precisa ser comprado hoje.
 *
 * Responde: pelo lead time do fornecedor e pelo SLA da rota, até quando o pedido
 * tem de ser colocado para chegar antes do estoque acabar. Caminha do prazo para
 * trás, ao contrário das outras projeções do sistema, que caminham para frente.
 *
 *   data limite = data de ruptura − SLA interno da rota − lead time do fornecedor
 *
 * Determinístico. Duas unidades diferentes de propósito: o SLA entre CDs é em
 * dias úteis, como no resto do sistema; o lead time do fornecedor é em dias
 * corridos, porque é assim que fornecedor cota prazo de entrega.
 */
import { prisma } from "@/lib/prisma";
import { chaveSla, subtrairDiasUteis } from "@/utils/projecao-transferencias";
import { resolverPercursoCompra, type PercursoCompra } from "@/utils/rota-compra";
import { snapshotMensalSql } from "@/utils/dias-estoque";
import { carregarSla } from "@/lib/transferencias/consultas";
import type { PosicaoRisco } from "./tipos";

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Urgência da colocação do pedido.
 *
 * `sem_dados` é distinto de `ok`: significa que não sabemos, não que está
 * tranquilo. Vai para os avisos, não para as ações.
 */
export type UrgenciaCompra =
  | "atrasado"
  | "comprar_hoje"
  | "proximo"
  | "ok"
  | "sem_dados";

export type MotivoSemDados =
  | "sem_rota"
  | "sem_lead_time"
  | "sem_sla_na_rota"
  | "sem_consumo";

export type ItemComprarHoje = {
  posicao: PosicaoRisco;
  /** Percurso resolvido; `null` quando não há rota cadastrada. */
  percurso: PercursoCompra | null;
  /** Dias corridos de lead time do fornecedor até o primeiro CD. */
  leadTime: number | null;
  /** Dias úteis somados das pernas internas da rota. */
  slaInterno: number | null;
  /** Última data em que o pedido ainda chega antes da ruptura. */
  dataLimite: Date | null;
  /** Dias entre hoje e a data limite. Negativo significa atrasado. */
  diasAteLimite: number | null;
  urgencia: UrgenciaCompra;
  motivo?: MotivoSemDados;
};

/** `fornecedor|cd` -> dias corridos. */
async function carregarLeadTimes(): Promise<Map<string, number>> {
  const linhas = await prisma.leadTimeFornecedor.findMany({
    select: { fornecedor: true, cd: true, lead_time: true },
  });
  const mapa = new Map<string, number>();
  for (const l of linhas) {
    if (l.lead_time !== null) {
      mapa.set(`${l.fornecedor.trim()}|${l.cd}`, l.lead_time);
    }
  }
  return mapa;
}

/** Rota de compra por (codigo, filial), do forecast do mês. */
async function carregarRotas(data: string): Promise<Map<string, string | null>> {
  const [ano, mes] = data.split("-").map(Number);
  const inicio = new Date(Date.UTC(ano, mes - 1, 1)).toISOString().slice(0, 10);
  const proximo = new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10);

  const linhas = await prisma.$queryRawUnsafe<
    { codigo: string; filial: string; rota_compra: string | null }[]
  >(
    `SELECT codigo, filial, rota_compra
       FROM forecast f
      WHERE f.data_snapshot >= $1::date AND f.data_snapshot < $2::date
        AND ${snapshotMensalSql("forecast", "f", "$3")}
        AND f.filial IS NOT NULL`,
    inicio,
    proximo,
    data
  );

  const mapa = new Map<string, string | null>();
  for (const l of linhas) mapa.set(`${l.codigo}|${l.filial}`, l.rota_compra);
  return mapa;
}

export type DadosComprarHoje = {
  itens: ItemComprarHoje[];
  totais: Record<UrgenciaCompra, number>;
  /** Contagem dos motivos de "sem dados", para a seção de avisos. */
  lacunas: Record<MotivoSemDados, number>;
};

export async function calcularComprarHoje(
  data: string,
  posicoes: PosicaoRisco[],
  critico: number
): Promise<DadosComprarHoje> {
  const referencia = new Date(`${data}T00:00:00.000Z`);
  const [leadTimes, rotas, sla] = await Promise.all([
    carregarLeadTimes(),
    carregarRotas(data),
    carregarSla(),
  ]);

  const itens = posicoes.map((posicao): ItemComprarHoje => {
    const base = {
      posicao,
      percurso: null,
      leadTime: null,
      slaInterno: null,
      dataLimite: null,
      diasAteLimite: null,
    };

    if (posicao.dataRuptura === null) {
      return { ...base, urgencia: "sem_dados", motivo: "sem_consumo" };
    }

    const rota = rotas.get(`${posicao.codigo}|${posicao.filial}`) ?? null;
    const percurso = resolverPercursoCompra(rota, posicao.filial);
    if (!percurso) {
      return { ...base, urgencia: "sem_dados", motivo: "sem_rota" };
    }

    const leadTime = leadTimes.get(`${posicao.fornecedor}|${percurso.primeiroCd}`) ?? null;
    if (leadTime === null) {
      return { ...base, percurso, urgencia: "sem_dados", motivo: "sem_lead_time" };
    }

    // Uma perna sem SLA quebra a corrente: sem ela não há prazo total, e chutar
    // daria uma data com aparência de certa.
    let slaInterno = 0;
    for (const p of percurso.pernas) {
      const dias = sla.get(chaveSla(p.de, p.para));
      if (dias === undefined) {
        return { ...base, percurso, leadTime, urgencia: "sem_dados", motivo: "sem_sla_na_rota" };
      }
      slaInterno += dias;
    }

    // Do prazo para trás: primeiro os trechos entre CDs (dias úteis), depois a
    // entrega do fornecedor (dias corridos).
    const aposSla = subtrairDiasUteis(posicao.dataRuptura, slaInterno);
    const dataLimite = new Date(aposSla.getTime() - leadTime * MS_POR_DIA);
    const diasAteLimite = (dataLimite.getTime() - referencia.getTime()) / MS_POR_DIA;

    const urgencia: UrgenciaCompra =
      diasAteLimite < 0
        ? "atrasado"
        : diasAteLimite < 1
          ? "comprar_hoje"
          : diasAteLimite <= critico
            ? "proximo"
            : "ok";

    return { posicao, percurso, leadTime, slaInterno, dataLimite, diasAteLimite, urgencia };
  });

  const totais: Record<UrgenciaCompra, number> = {
    atrasado: 0,
    comprar_hoje: 0,
    proximo: 0,
    ok: 0,
    sem_dados: 0,
  };
  const lacunas: Record<MotivoSemDados, number> = {
    sem_rota: 0,
    sem_lead_time: 0,
    sem_sla_na_rota: 0,
    sem_consumo: 0,
  };
  for (const i of itens) {
    totais[i.urgencia] += 1;
    if (i.motivo) lacunas[i.motivo] += 1;
  }

  return { itens, totais, lacunas };
}
