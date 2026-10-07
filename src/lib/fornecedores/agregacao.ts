/**
 * Tipos e agregação da análise de rupturas por fornecedor.
 *
 * Vive separado de `consultas.ts` de propósito: aquele módulo importa o Prisma
 * e só roda no servidor. Como o filtro de BU recalcula o resumo no cliente,
 * a agregação precisa de um módulo que o navegador possa carregar.
 */
import type { Etapa } from "@/utils/projecao-transferencias";

/**
 * Situação de uma posição rompida (item × CD).
 *
 * Cada posição cai em exatamente uma categoria: quando há compra e
 * transferência a caminho, vale a que chega primeiro — o objetivo é saber
 * quando a ruptura acaba, não quantas reposições existem.
 */
export type Categoria =
  "compra" | "transferencia" | "a_comprar" | "sem_cobertura";

/**
 * Uma reposição a caminho de um CD, com o percurso completo já projetado — o
 * mesmo desenho da tela de produto, para o percurso ser lido igual nos dois
 * lugares.
 */
export type Reposicao = {
  origem: "compra" | "transferencia";
  quantidade: number;
  chegada: Date;
  etapas: Etapa[];
  /** Rota textual da origem ("DF2 > CAJ > ES"); null em compra direta/simples. */
  rota: string | null;
  /** True em compra direta: entra na própria filial, sem trecho de SLA. */
  direto: boolean;
  /** True quando a data original venceu e o prazo do Painel foi aplicado. */
  reprojetada: boolean;
  /** Rótulo da primeira parada: data pedra nos pedidos, "saída" nas transferências. */
  inicio: string;
  /** Identificação: número do pedido ou da NF. */
  documento: string | null;
  emissao: Date | null;
  /** Só nos pedidos de compra. */
  statusLogistica: string | null;
  dataAgendada: string | null;
  frete: string | null;
};

/** Rótulo usado quando a classificação não está preenchida no forecast. */
export const VAZIO = "—";

export type PosicaoRompida = {
  codigo: string;
  descricao: string | null;
  filial: string;
  fornecedor: string;
  /**
   * De onde saiu o nome: do simulador, ou da marca/grupo do cadastro.
   *
   * A tela marca a diferença porque marca não é fornecedor — elas coincidem em
   * 91% dos itens, e nos outros 9% a divergência é real (quem distribui o quê,
   * aquisição de empresa, granularidade). Ver `OrigemFornecedor`.
   */
  origemFornecedor: OrigemFornecedor;
  /** Unidade de negócio do forecast (coluna b_u); `VAZIO` quando ausente. */
  bu: string;
  /** Classificação ABC do forecast (coluna curva); `VAZIO` quando ausente. */
  curva: string;
  /** Analista responsável pelo item no planejamento (coluna do forecast). */
  analista: string;
  forecast: number;
  /**
   * Vendido no mês corrente neste CD, até a data de referência.
   *
   * Sai das mesmas linhas do simulador que já trazem o estoque, então não custa
   * consulta nem join — e é o número que dá sentido ao forecast ao lado: 400
   * previstos com 380 vendidos é uma ruptura bem mais urgente que 400 com 40.
   */
  vendido: number;
  categoria: Categoria;
  /**
   * Por que não há saldo a comprar — só faz sentido em `sem_cobertura`.
   *
   * São duas situações com ações opostas, e a coluna as somava numa só.
   * `sem_plano` é item que não entrou no plano do mês: quem decide é o
   * planejamento, e a conversa é sobre incluir. `plano_gasto` é item planejado
   * cujo saldo acabou: o plano reconheceu a necessidade, e a conversa é sobre
   * verba adicional. Confundir as duas manda o analista à mesa errada.
   */
  motivoSemCobertura: MotivoSemCobertura | null;
  /** Quantidade e chegada da reposição que define a categoria. */
  quantidade: number | null;
  chegada: Date | null;
  /** Todas as reposições a caminho deste CD, da que chega antes para a depois. */
  reposicoes: Reposicao[];
  /** Saldo do plano de compra do mês ainda não colocado. */
  saldoComprar: number;
};

export type ResumoFornecedor = {
  fornecedor: string;
  /**
   * Quem responde pelas posições rompidas deste fornecedor.
   *
   * Sai das próprias posições da tela, não de um cadastro à parte: o que
   * interessa é quem cuida **dos itens que estão rompidos**, e não quem cuida
   * do fornecedor em geral. Nos poucos casos com mais de um, vem o que tem mais
   * posições — é com ele que a conversa começa.
   */
  analista: string;
  /** Quantos outros analistas aparecem além do principal. */
  outrosAnalistas: number;
  total: number;
  compra: number;
  transferencia: number;
  aComprar: number;
  semCobertura: number;
  /** Das `semCobertura`: itens que nem entraram no plano do mês. */
  semPlano: number;
  /** Das `semCobertura`: itens planejados cujo saldo já acabou. */
  planoGasto: number;
  /**
   * Quantas posições deste fornecedor tiveram o nome deduzido da marca.
   *
   * Zero na imensa maioria. Acima de zero, a tela avisa — é a diferença entre
   * "este fornecedor tem N rupturas" e "N rupturas foram atribuídas a ele por
   * semelhança de marca".
   */
  porMarca: number;
};

/** Por que a posição ficou sem saldo no plano de compra. */
export type MotivoSemCobertura = "sem_plano" | "plano_gasto";

/** De onde veio o nome do fornecedor de uma posição. */
export type OrigemFornecedor = "simulador" | "marca" | "grupo" | "sem";

/** Conta as posições por fornecedor e categoria, do maior total para o menor. */
export function agregarPorFornecedor(
  posicoes: PosicaoRompida[],
): ResumoFornecedor[] {
  const mapa = new Map<string, ResumoFornecedor>();
  /** Posições por analista dentro de cada fornecedor, para achar o principal. */
  const analistas = new Map<string, Map<string, number>>();
  for (const p of posicoes) {
    const atual = mapa.get(p.fornecedor) ?? {
      fornecedor: p.fornecedor,
      analista: VAZIO,
      outrosAnalistas: 0,
      total: 0,
      compra: 0,
      transferencia: 0,
      aComprar: 0,
      semCobertura: 0,
      semPlano: 0,
      planoGasto: 0,
      porMarca: 0,
    };
    atual.total += 1;
    if (p.origemFornecedor === "marca" || p.origemFornecedor === "grupo") {
      atual.porMarca += 1;
    }
    if (p.categoria === "compra") atual.compra += 1;
    else if (p.categoria === "transferencia") atual.transferencia += 1;
    else if (p.categoria === "a_comprar") atual.aComprar += 1;
    else {
      atual.semCobertura += 1;
      if (p.motivoSemCobertura === "plano_gasto") atual.planoGasto += 1;
      else atual.semPlano += 1;
    }

    const porAnalista =
      analistas.get(p.fornecedor) ?? new Map<string, number>();
    porAnalista.set(p.analista, (porAnalista.get(p.analista) ?? 0) + 1);
    analistas.set(p.fornecedor, porAnalista);

    mapa.set(p.fornecedor, atual);
  }

  // O principal é decidido no fim, com todas as posições contadas: escolher a
  // cada linha faria o vencedor depender da ordem de chegada.
  for (const [fornecedor, contagem] of analistas) {
    const resumo = mapa.get(fornecedor);
    if (!resumo) continue;
    const ordenado = [...contagem.entries()].sort(
      // Desempate por nome, para a tela não trocar de analista entre um
      // carregamento e outro quando dois têm o mesmo número de posições.
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"),
    );
    resumo.analista = ordenado[0][0];
    resumo.outrosAnalistas = ordenado.length - 1;
  }

  return [...mapa.values()].sort(
    (a, b) =>
      b.total - a.total || a.fornecedor.localeCompare(b.fornecedor, "pt-BR"),
  );
}

/** BUs presentes nas posições, em ordem alfabética e com "sem BU" no fim. */
/** Analistas presentes, com "sem analista" sempre por último. */
export function listarAnalistas(posicoes: PosicaoRompida[]): string[] {
  return [...new Set(posicoes.map((p) => p.analista))].sort((a, b) =>
    a === VAZIO ? 1 : b === VAZIO ? -1 : a.localeCompare(b, "pt-BR"),
  );
}

export function listarBus(posicoes: PosicaoRompida[]): string[] {
  return [...new Set(posicoes.map((p) => p.bu))].sort((a, b) =>
    a === VAZIO ? 1 : b === VAZIO ? -1 : a.localeCompare(b, "pt-BR"),
  );
}

/**
 * Curvas presentes, em ordem ABC. Uma curva fora de A/B/C vai depois delas, e
 * a ausência de curva fica sempre por último — a mesma ordem da Disponibilidade.
 */
export function listarCurvas(posicoes: PosicaoRompida[]): string[] {
  const presentes = [...new Set(posicoes.map((p) => p.curva))];
  const abc = ["A", "B", "C"];
  return [
    ...abc.filter((c) => presentes.includes(c)),
    ...presentes
      .filter((c) => !abc.includes(c) && c !== VAZIO)
      .sort((a, b) => a.localeCompare(b, "pt-BR")),
    ...presentes.filter((c) => c === VAZIO),
  ];
}
