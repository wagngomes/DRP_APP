/**
 * Sugestão de transferência entre CDs.
 *
 * Duas bases diferentes de propósito:
 *   origem  -> estoque **chão**: só se despacha o que está fisicamente lá
 *   destino -> estoque **total**: pedir de novo o que já vem a caminho gera excesso
 *
 * E uma regra temporal que evita empurrar estoque para quem já tem reposição
 * chegando: se um pedido chega em 12 dias e a transferência chega em 4, mandamos
 * os 8 dias que faltam para cobrir o vão — não os 20 do alvo. É a "ponte".
 *
 * Determinístico.
 */
import { chaveSla, somarDiasUteis } from "@/utils/projecao-transferencias";
import type { Coberturas } from "@/lib/parametros";
import type { PosicaoRisco } from "./tipos";

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export type MotivoSemSugestao =
  | "coberto"
  | "reposicao_chega_a_tempo"
  | "sugestao_chegaria_depois"
  | "sem_origem_disponivel"
  | "sem_consumo";

export type Sugestao = {
  posicao: PosicaoRisco;
  origem: string;
  /** Dias úteis de trânsito entre origem e destino. */
  sla: number;
  /** Data de chegada se despachada hoje. */
  chegada: Date;
  /** Dias de cobertura que a remessa entrega. */
  diasCobertos: number;
  quantidade: number;
  /**
   * `ponte` cobre só o vão até a reposição já em aberto chegar;
   * `reposicao` leva a cobertura até o alvo, quando não há nada a caminho.
   */
  tipo: "ponte" | "reposicao";
  /** Cobertura da origem depois de doar — nunca abaixo do alvo. */
  origemDepois: number;
};

export type DadosTransferencia = {
  sugestoes: Sugestao[];
  /** Posições no gatilho que não geraram sugestão, e por quê. */
  descartadas: Record<MotivoSemSugestao, number>;
};

/**
 * Monta as sugestões para o recorte inteiro.
 *
 * `sla` é o mapa de `carregarSla()`; posições sem SLA cadastrado entre os CDs
 * simplesmente não viram candidatas a origem — o percurso não é conhecido.
 */
export function calcularTransferencias(
  posicoes: PosicaoRisco[],
  coberturas: Coberturas,
  sla: Map<string, number>,
  referencia: Date
): DadosTransferencia {
  const { gatilho, alvo } = coberturas;

  // Agrupa por produto: a origem de uma transferência é outro CD do mesmo item.
  const porProduto = new Map<string, PosicaoRisco[]>();
  for (const p of posicoes) {
    const lista = porProduto.get(p.codigo) ?? [];
    lista.push(p);
    porProduto.set(p.codigo, lista);
  }

  // Chão disponível por CD, decrementado a cada sugestão aceita: sem isso o
  // mesmo estoque seria prometido a dois destinos diferentes.
  const chaoDisponivel = new Map<string, number>();
  for (const p of posicoes) {
    chaoDisponivel.set(`${p.codigo}|${p.filial}`, p.estoqueChao);
  }

  const sugestoes: Sugestao[] = [];
  const descartadas: Record<MotivoSemSugestao, number> = {
    coberto: 0,
    reposicao_chega_a_tempo: 0,
    sugestao_chegaria_depois: 0,
    sem_origem_disponivel: 0,
    sem_consumo: 0,
  };

  // Do mais crítico para o menos: quem tem menos cobertura escolhe origem antes.
  const candidatas = posicoes
    .filter((p) => p.diasTotal !== null && p.diasTotal < gatilho)
    .sort((a, b) => (a.diasTotal ?? 0) - (b.diasTotal ?? 0));

  for (const destino of candidatas) {
    if (destino.consumoDiario <= 0 || destino.diasTotal === null) {
      descartadas.sem_consumo += 1;
      continue;
    }

    const chegadaEmAberto = destino.primeiraChegada?.chegada ?? null;

    // O que já vem chega antes de acabar: não há vão a cobrir.
    if (chegadaEmAberto && destino.dataRuptura && chegadaEmAberto <= destino.dataRuptura) {
      descartadas.reposicao_chega_a_tempo += 1;
      continue;
    }

    // Melhor origem: fica acima do alvo depois de doar e tem o menor SLA.
    const irmaos = porProduto.get(destino.codigo) ?? [];
    let melhor: { filial: string; sla: number; chao: number } | null = null;

    for (const origem of irmaos) {
      if (origem.filial === destino.filial) continue;
      const dias = sla.get(chaveSla(origem.filial, destino.filial));
      if (dias === undefined) continue;

      const chao = chaoDisponivel.get(`${origem.codigo}|${origem.filial}`) ?? 0;
      if (chao <= 0 || origem.consumoDiario <= 0) continue;
      // Precisa continuar acima do alvo mesmo depois de doar algo.
      if (chao / origem.consumoDiario <= alvo) continue;

      if (!melhor || dias < melhor.sla) melhor = { filial: origem.filial, sla: dias, chao };
    }

    if (!melhor) {
      descartadas.sem_origem_disponivel += 1;
      continue;
    }

    const chegada = somarDiasUteis(referencia, melhor.sla);

    // Chegaria depois do que já está a caminho: não adianta nada.
    if (chegadaEmAberto && chegada >= chegadaEmAberto) {
      descartadas.sugestao_chegaria_depois += 1;
      continue;
    }

    // Ponte: cobre da chegada desta remessa até a que já vem. Sem nada a caminho,
    // repõe até o alvo.
    const tipo: "ponte" | "reposicao" = chegadaEmAberto ? "ponte" : "reposicao";
    const diasCobertos =
      tipo === "ponte"
        ? (chegadaEmAberto!.getTime() - chegada.getTime()) / MS_POR_DIA
        : alvo - destino.diasTotal;

    if (diasCobertos <= 0) {
      descartadas.coberto += 1;
      continue;
    }

    // A origem doa no máximo o que a mantém no alvo.
    const origemInfo = irmaos.find((i) => i.filial === melhor!.filial)!;
    const maximoDoavel = melhor.chao - alvo * origemInfo.consumoDiario;
    const quantidade = Math.min(diasCobertos * destino.consumoDiario, maximoDoavel);

    if (quantidade <= 0) {
      descartadas.sem_origem_disponivel += 1;
      continue;
    }

    chaoDisponivel.set(`${destino.codigo}|${melhor.filial}`, melhor.chao - quantidade);

    sugestoes.push({
      posicao: destino,
      origem: melhor.filial,
      sla: melhor.sla,
      chegada,
      diasCobertos: quantidade / destino.consumoDiario,
      quantidade,
      tipo,
      origemDepois: (melhor.chao - quantidade) / origemInfo.consumoDiario,
    });
  }

  return { sugestoes, descartadas };
}
