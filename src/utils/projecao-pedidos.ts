/**
 * Projeção de chegada dos pedidos de compra.
 *
 * Reaproveita as peças da projeção de transferências (parse de rota, soma de
 * dias úteis, chave do SLA). A diferença está na âncora: aqui o ponto de
 * partida é a `data_pedra`, que é a chegada prevista no primeiro ponto da rota
 * — a filial onde o fornecedor entrega. Dali as pernas seguem pelo SLA.
 *
 * Pedido direto não tem percurso: a mercadoria entra na própria filial na data
 * pedra, sem trecho de SLA envolvido.
 */
import {
  chaveSla,
  parseRota,
  somarDiasUteis,
  type Etapa,
  type MotivoIndefinido,
} from "@/utils/projecao-transferencias";

export type ProjecaoPedido = {
  /** Destino final: fim da rota, ou a própria filial nos pedidos diretos. */
  cdFinal: string | null;
  /** Vazio nos pedidos diretos — não há trecho a percorrer. */
  etapas: Etapa[];
  /**
   * Entrada no primeiro ponto da rota (onde o fornecedor entrega). É a data
   * pedra, ou o prazo reprojetado quando ela já venceu — por isso não dá para
   * exibir `data_pedra` direto: num pedido reprojetado ela está no passado.
   */
  chegadaPrimeiroPonto: Date | null;
  chegadaFinal: Date | null;
  /** True quando a data pedra já venceu e o prazo do usuário foi aplicado. */
  reprojetada: boolean;
  /** True quando não há rota: a mercadoria entra direto na filial. */
  direto: boolean;
  motivo?: MotivoIndefinido;
};

export type EntradaPedido = {
  /** Coluna tp_ped_transf_descricao. "N/A" ou vazio significa compra direta. */
  rota: string | null;
  /** Coluna filial: primeiro ponto da rota, ou o destino nos pedidos diretos. */
  filial: string | null;
  /** Coluna data_pedra: chegada prevista no primeiro ponto. */
  dataPedra: Date | null;
  siglaParaCodigo: Map<string, string>;
  sla: Map<string, number>;
  dataReferencia: Date;
  /** Dias úteis a partir da referência quando a data pedra já venceu. */
  diasParaVencidos: number;
};

/** A base traz compra direta como NULL; a spec previa "N/A". Aceita os dois. */
export function ehCompraDireta(rota: string | null): boolean {
  if (!rota) return true;
  const limpo = rota.trim().toUpperCase();
  return limpo === "" || limpo === "N/A" || parseRota(rota).length === 0;
}

export function projetarPedido(entrada: EntradaPedido): ProjecaoPedido {
  const direto = ehCompraDireta(entrada.rota);

  if (!entrada.dataPedra) {
    return {
      cdFinal: direto ? entrada.filial : null,
      etapas: [],
      chegadaPrimeiroPonto: null,
      chegadaFinal: null,
      reprojetada: false,
      direto,
      motivo: "sem_data_emissao",
    };
  }

  // Data pedra vencida: a entrada no primeiro ponto passa a ser o prazo
  // informado pelo usuário, contado da data de referência.
  const vencido = entrada.dataPedra < entrada.dataReferencia;
  const chegadaPrimeiroPonto = vencido
    ? somarDiasUteis(entrada.dataReferencia, entrada.diasParaVencidos)
    : entrada.dataPedra;

  if (direto) {
    return {
      cdFinal: entrada.filial,
      etapas: [],
      chegadaPrimeiroPonto,
      chegadaFinal: chegadaPrimeiroPonto,
      reprojetada: vencido,
      direto: true,
    };
  }

  const siglas = parseRota(entrada.rota);
  const percurso: string[] = [];
  for (const sigla of siglas) {
    const codigo = entrada.siglaParaCodigo.get(sigla.toUpperCase());
    if (!codigo) {
      return {
        cdFinal: null,
        etapas: [],
        chegadaPrimeiroPonto,
        chegadaFinal: null,
        reprojetada: false,
        direto: false,
        motivo: "sigla_desconhecida",
      };
    }
    percurso.push(codigo);
  }

  const cdFinal = percurso[percurso.length - 1];
  const etapas: Etapa[] = [];
  let cursor: Date | null = chegadaPrimeiroPonto;

  for (let i = 0; i < percurso.length - 1; i += 1) {
    const de = percurso[i];
    const para = percurso[i + 1];
    const transitTime = entrada.sla.get(chaveSla(de, para)) ?? null;
    // Sem SLA a corrente quebra: nem esta perna nem as seguintes têm data.
    const chegada: Date | null =
      cursor !== null && transitTime !== null ? somarDiasUteis(cursor, transitTime) : null;
    etapas.push({ de, para, transitTime, chegadaPrevista: chegada });
    cursor = chegada;
  }

  return {
    cdFinal,
    etapas,
    chegadaPrimeiroPonto,
    chegadaFinal: cursor,
    reprojetada: vencido,
    direto: false,
    motivo: cursor === null ? "sem_sla" : undefined,
  };
}
