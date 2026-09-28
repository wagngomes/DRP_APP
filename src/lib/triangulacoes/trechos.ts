import type { LinhaTriangulacao, ProdutoTriangulando } from "./consultas";

/**
 * Agrega as triangulações por trecho, para a visão gerencial.
 *
 * A tela de triangulações responde "como está o produto X". Esta responde
 * "onde está o capital", e por isso o eixo é o trecho — o par de CDs entre os
 * quais a carga anda — e não a rota inteira. São 63 rotas abertas contra 35
 * trechos: por rota a tela teria o dobro de cartões dizendo menos.
 *
 * Cada documento aparece em **dois papéis diferentes**, nunca somados:
 *
 *   agora   — o trecho que ele está percorrendo neste momento (`etapas[0]`).
 *             Cada documento cai em exatamente um, e por isso a soma de `agora`
 *             sobre todos os trechos reproduz o total da tela de triangulações.
 *             É o que garante que as duas telas batam.
 *
 *   depois  — os trechos que ele ainda vai percorrer (`etapas[1..]`). Aqui o
 *             mesmo documento aparece em vários trechos de propósito: é carga
 *             futura, e a pergunta que responde ("o que vem por aí neste
 *             corredor") exige contá-lo em cada um.
 *
 * Somar os dois daria um número sem significado — capital contado duas vezes.
 * Por isso são campos separados, e a tela os pinta diferente: o presente em
 * cor, o futuro em cinza.
 */

import type { Etapa } from "@/utils/projecao-transferencias";
import { interpretarAgendamento, type Agendamento } from "@/utils/agendamento";

/** Um documento parado ou previsto num trecho. */
export type ItemNoTrecho = {
  codigo: string;
  descricao: string | null;
  fornecedor: string;
  origem: "compra" | "transferencia";
  /** NF nas transferências, número do pedido nas compras. */
  documento: string | null;
  quantidade: number;
  valor: number;
  /** Chegada prevista **neste** trecho. */
  chegadaNoTrecho: Date | null;
  /** Até onde este documento vai — o fim da rota, não deste trecho. */
  cdFinal: string | null;
  /** Chegada prevista no destino final. */
  chegadaFinal: Date | null;
  rota: string | null;
  /** Agendamento já interpretado: data quando há, motivo quando não há. */
  agendamento: Agendamento;
  statusLogistica: string | null;
  /** A projeção caiu no passado e foi recalculada pelo prazo do parâmetro. */
  reprojetada: boolean;
};

export type ResumoTrecho = {
  /** Produtos distintos — não documentos: o mesmo item vem em várias notas. */
  produtos: number;
  documentos: number;
  quantidade: number;
  valor: number;
  /** Separados porque vêm de colunas diferentes na origem. */
  valorTransferencia: number;
  valorCompra: number;
  notas: number;
  pedidos: number;
  /**
   * Quantos têm **data** de entrega marcada.
   *
   * Só conta agendamento com data real. O campo de origem vem preenchido em
   * quase toda linha, mas na maioria com "Não faturado" ou "S/AGENDAMENTO" —
   * contar preenchimento daria 4.400 agendamentos onde existem uns 500.
   */
  agendados: number;
  /** A chegada mais próxima prevista neste trecho. */
  proximaChegada: Date | null;
  itens: ItemNoTrecho[];
};

export type Trecho = {
  de: string;
  para: string;
  /** `de->para`, a chave estável do trecho. */
  id: string;
  agora: ResumoTrecho;
  depois: ResumoTrecho;
};

function resumoVazio(): ResumoTrecho {
  return {
    produtos: 0,
    documentos: 0,
    quantidade: 0,
    valor: 0,
    valorTransferencia: 0,
    valorCompra: 0,
    notas: 0,
    pedidos: 0,
    agendados: 0,
    proximaChegada: null,
    itens: [],
  };
}

function acrescentar(resumo: ResumoTrecho, item: ItemNoTrecho): void {
  resumo.itens.push(item);
  resumo.documentos += 1;
  resumo.quantidade += item.quantidade;
  resumo.valor += item.valor;
  if (item.origem === "transferencia") {
    resumo.valorTransferencia += item.valor;
    resumo.notas += 1;
  } else {
    resumo.valorCompra += item.valor;
    resumo.pedidos += 1;
  }
  if (item.agendamento.data) resumo.agendados += 1;
  if (
    item.chegadaNoTrecho &&
    (!resumo.proximaChegada || item.chegadaNoTrecho < resumo.proximaChegada)
  ) {
    resumo.proximaChegada = item.chegadaNoTrecho;
  }
}

/** Conta produtos distintos depois de todos os itens entrarem. */
function fechar(resumo: ResumoTrecho): void {
  resumo.produtos = new Set(resumo.itens.map((i) => i.codigo)).size;
  // Maior valor primeiro: quem abre um trecho quer ver primeiro o que pesa.
  resumo.itens.sort((a, b) => b.valor - a.valor);
}

function montarItem(
  linha: LinhaTriangulacao,
  produto: { descricao: string | null; fornecedor: string },
  etapa: Etapa,
): ItemNoTrecho {
  return {
    codigo: linha.codigo,
    descricao: produto.descricao,
    fornecedor: produto.fornecedor,
    origem: linha.origem,
    documento: linha.documento,
    quantidade: linha.quantidade,
    // `valor` é nulo em linha sem custo na origem; zero mantém as somas
    // íntegras sem inventar número.
    valor: linha.valor ?? 0,
    chegadaNoTrecho: etapa.chegadaPrevista,
    cdFinal: linha.cdFinal,
    chegadaFinal: linha.chegadaFinal,
    rota: linha.rota,
    agendamento: interpretarAgendamento(linha.dataAgendada),
    statusLogistica: linha.statusLogistica,
    reprojetada: linha.reprojetada,
  };
}

/**
 * Monta os trechos a partir dos produtos que a tela de triangulações já carrega.
 *
 * Recebe o resultado pronto, e não faz consulta própria, porque é justamente
 * isso que faz as duas telas baterem: qualquer mudança na regra de triangulação
 * chega às duas ao mesmo tempo, sem ninguém precisar lembrar de replicar.
 */
export function montarTrechos(produtos: ProdutoTriangulando[]): Trecho[] {
  const mapa = new Map<string, Trecho>();

  const doTrecho = (etapa: Etapa): Trecho => {
    const id = `${etapa.de}->${etapa.para}`;
    let t = mapa.get(id);
    if (!t) {
      t = {
        de: etapa.de,
        para: etapa.para,
        id,
        agora: resumoVazio(),
        depois: resumoVazio(),
      };
      mapa.set(id, t);
    }
    return t;
  };

  for (const produto of produtos) {
    for (const linha of produto.linhas) {
      linha.etapas.forEach((etapa, indice) => {
        const trecho = doTrecho(etapa);
        const item = montarItem(linha, produto, etapa);
        acrescentar(indice === 0 ? trecho.agora : trecho.depois, item);
      });
    }
  }

  const trechos = [...mapa.values()];
  for (const t of trechos) {
    fechar(t.agora);
    fechar(t.depois);
  }

  // Ordem por valor presente: o trecho onde há mais capital parado agora é o
  // primeiro que interessa. Empate cai no futuro, que é o próximo a apertar.
  return trechos.sort(
    (a, b) => b.agora.valor - a.agora.valor || b.depois.valor - a.depois.valor,
  );
}

/** Totais do que está em trânsito agora, para o topo da tela. */
export function totaisAgora(trechos: Trecho[]): {
  valor: number;
  valorTransferencia: number;
  valorCompra: number;
  documentos: number;
  produtos: number;
  trechos: number;
} {
  const produtos = new Set<string>();
  let valor = 0;
  let valorTransferencia = 0;
  let valorCompra = 0;
  let documentos = 0;

  for (const t of trechos) {
    valor += t.agora.valor;
    valorTransferencia += t.agora.valorTransferencia;
    valorCompra += t.agora.valorCompra;
    documentos += t.agora.documentos;
    for (const i of t.agora.itens) produtos.add(i.codigo);
  }

  return {
    valor,
    valorTransferencia,
    valorCompra,
    documentos,
    produtos: produtos.size,
    trechos: trechos.filter((t) => t.agora.documentos > 0).length,
  };
}
