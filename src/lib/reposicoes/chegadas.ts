/**
 * Reposições a caminho, com a chegada já projetada.
 *
 * Fonte única da pergunta "o que está vindo para este item neste CD, e quando".
 * Pedidos de compra e transferências abertas são projetados pelos utilitários de
 * rota (`projetarPedido` e `projetar`) e indexados por `codigo|cdFinal`, que é o
 * CD onde a mercadoria realmente entra — fim da rota, não o próximo passo.
 *
 * Vive fora de `fornecedores/consultas.ts` porque a mesma projeção alimenta a tela
 * de fornecedores e os motores de risco. Duas implementações da mesma conta já
 * produziram divergência entre telas neste projeto; esta é a única.
 */
import { prisma } from "@/lib/prisma";
import { carregarFiliais, carregarSla } from "@/lib/transferencias/consultas";
import { projetar } from "@/utils/projecao-transferencias";
import { projetarPedido } from "@/utils/projecao-pedidos";
import type { Reposicao } from "@/lib/fornecedores/agregacao";

export type { Reposicao };

/** Prazos que o Painel define para reposições cuja data original já venceu. */
export type ParametrosProjecao = {
  diasTransferencias: number;
  diasPedidos: number;
};

/** Mapa `codigo|cdFinal` -> reposições, da que chega antes para a que chega depois. */
export type MapaChegadas = Map<string, Reposicao[]>;

/** Chave do mapa. Usar sempre esta função em vez de montar a string à mão. */
export function chaveChegada(codigo: string, cdFinal: string): string {
  return `${codigo}|${cdFinal}`;
}

function dataBr(d: Date | null): string {
  return d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "sem data";
}

export async function carregarChegadas(
  data: string,
  parametros: ParametrosProjecao
): Promise<MapaChegadas> {
  const dataReferencia = new Date(`${data}T00:00:00.000Z`);

  const [pedidos, transferencias, sla, siglaParaCodigo] = await Promise.all([
    prisma.$queryRawUnsafe<
      {
        codigo: string; filial: string | null; rota: string | null;
        data_pedra: Date | null; quantidade_receber: number | null;
        num_pedido: string | null; data_emissao: Date | null;
        status_logistica: string | null; data_agendada: string | null; frete: string | null;
      }[]
    >(
      `SELECT codigo, filial, tp_ped_transf_descricao AS rota, data_pedra,
              quantidade_receber::float8 AS quantidade_receber,
              num_pedido, data_emissao, status_logistica, data_agendada, frete
         FROM pedidos_de_compra
        WHERE data_snapshot = $1::date AND codigo IS NOT NULL AND quantidade_receber > 0`,
      data
    ),
    /* A tabela é cumulativa: sem o filtro de snapshot, transferências de dias
       anteriores (já entregues) seguem contando como a caminho, e a mesma NF
       repetida em dois snapshots vira duas remessas. É o recorte que a task03
       define para esta base. */
    prisma.$queryRawUnsafe<
      {
        codigo: string; filial_codigo_saida: string | null; filial_codigo_entrada: string | null;
        rota: string | null; passo: number | null; data_emissao: Date | null; qtde: number | null;
        numero_nf_saida: string | null;
      }[]
    >(
      `SELECT codigo, filial_codigo_saida, filial_codigo_entrada, rota,
              passo::int AS passo, data_emissao, qtde::float8 AS qtde, numero_nf_saida
         FROM transferencias_abertas
        WHERE data_snapshot = $1::date AND codigo IS NOT NULL`,
      data
    ),
    carregarSla(),
    carregarFiliais(),
  ]);

  const chegadas: MapaChegadas = new Map();
  const registrar = (codigo: string, cdFinal: string | null, rep: Reposicao | null) => {
    if (!cdFinal || !rep) return;
    const chave = chaveChegada(codigo, cdFinal);
    const lista = chegadas.get(chave) ?? [];
    lista.push(rep);
    chegadas.set(chave, lista);
  };

  for (const pe of pedidos) {
    const proj = projetarPedido({
      rota: pe.rota,
      filial: pe.filial,
      dataPedra: pe.data_pedra,
      siglaParaCodigo,
      sla,
      dataReferencia,
      diasParaVencidos: parametros.diasPedidos,
    });
    registrar(
      pe.codigo,
      proj.cdFinal,
      proj.chegadaFinal
        ? {
            origem: "compra",
            quantidade: pe.quantidade_receber ?? 0,
            chegada: proj.chegadaFinal,
            etapas: proj.etapas,
            rota: proj.direto ? null : pe.rota,
            direto: proj.direto,
            reprojetada: proj.reprojetada,
            // Entrada no primeiro ponto da rota. Num pedido reprojetado a data
            // pedra está no passado, então quem vale é a data recalculada.
            inicio: dataBr(proj.chegadaPrimeiroPonto),
            documento: pe.num_pedido,
            emissao: pe.data_emissao,
            statusLogistica: pe.status_logistica,
            dataAgendada: pe.data_agendada,
            frete: pe.frete,
          }
        : null
    );
  }

  for (const t of transferencias) {
    const proj = projetar({
      rota: t.rota,
      filialSaida: t.filial_codigo_saida,
      filialEntrada: t.filial_codigo_entrada,
      passo: t.passo,
      dataEmissao: t.data_emissao,
      siglaParaCodigo,
      sla,
      dataReferencia,
      diasParaVencidas: parametros.diasTransferencias,
    });
    registrar(
      t.codigo,
      proj.cdFinal,
      proj.chegadaFinal
        ? {
            origem: "transferencia",
            quantidade: t.qtde ?? 0,
            chegada: proj.chegadaFinal,
            etapas: proj.etapas,
            rota: t.rota,
            direto: false,
            reprojetada: proj.reprojetada,
            inicio: "saída",
            documento: t.numero_nf_saida,
            emissao: t.data_emissao,
            statusLogistica: null,
            dataAgendada: null,
            frete: null,
          }
        : null
    );
  }

  // Ordenadas na origem: quem consome sempre quer a primeira a chegar.
  for (const lista of chegadas.values()) {
    lista.sort((a, b) => a.chegada.getTime() - b.chegada.getTime());
  }

  return chegadas;
}
