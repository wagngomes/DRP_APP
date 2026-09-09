/**
 * Simulação de cenário: o que acontece com a rede sob uma premissa hipotética.
 *
 * O motor é inteiramente determinístico. A IA, quando entra, só traduz a
 * pergunta em `Premissa` e escreve o texto por cima do resultado — nenhum
 * número, data ou quantidade desta análise passa por ela.
 *
 * A simulação é um **balanço dia a dia** por posição item × CD, e não uma
 * conta de cobertura média. A diferença importa: a cobertura diz "tenho 16 dias
 * de estoque", o balanço diz "rompo em 11/09 e fico 6 dias descoberto até a
 * carga chegar em 17/09". A segunda é a que responde à pergunta do comprador.
 *
 * Cada dia subtrai o consumo diário e soma o que chega naquele dia — pedidos e
 * transferências já em aberto, com as datas que a projeção existente calcula, e
 * a entrada futura da premissa, com a data que a rota de compra determina.
 */
import { prisma } from "@/lib/prisma";
import { joinFornecedor, nomeFornecedor } from "@/lib/fornecedor";
import { carregarChegadas, chaveChegada } from "@/lib/reposicoes/chegadas";
import { carregarSla } from "@/lib/transferencias/consultas";
import { simuladorPorCd } from "@/utils/cds-virtuais";
import {
  COLUNAS_ESTOQUE_CHAO,
  DIAS_NO_MES,
  snapshotMensalSql,
  somaSql,
  torreValidaSql,
} from "@/utils/dias-estoque";
import { resolverPercursoCompra } from "@/utils/rota-compra";
import { chaveSla, somarDiasUteis } from "@/utils/projecao-transferencias";

const CHAO = somaSql(COLUNAS_ESTOQUE_CHAO, "s");

/** Até onde o balanço avança. Além disso a projeção não tem valor prático. */
export const HORIZONTE_DIAS = 90;

/**
 * A hipótese a simular.
 *
 * `entrada_futura` cobre o caso que o comprador vive: o saldo do plano ainda
 * não foi colocado, e vai chegar a partir de uma data. Atraso de pedido já
 * existente é um caso particular disso e será um tipo próprio quando aparecer.
 */
export type Premissa = {
  tipo: "entrada_futura";
  /** Nome normalizado, como em todas as visões por fornecedor. */
  fornecedor: string;
  /** Data em que a mercadoria entra no primeiro ponto da rota de compra. */
  dataEntrada: string;
  /**
   * Fatia do saldo que entra nessa data (0..1). Permite "metade agora, metade
   * depois" sem mudar o motor.
   */
  fracao?: number;
};

/**
 * Ação de contingência a aplicar sobre o cenário.
 *
 * Vocabulário fechado de propósito: a IA propõe ações escolhendo entre estes
 * tipos e preenchendo os campos, e o motor recalcula. Assim o "cenário com as
 * ações aplicadas" é simulado de novo, não descrito — a diferença entre dizer
 * que a transferência resolve e mostrar que resolve.
 */
export type Acao =
  | {
      tipo: "transferencia";
      codigo: string;
      origem: string;
      destino: string;
      quantidade: number;
    }
  | {
      /** Antecipa a entrada futura de um item (ou de todos, sem `codigo`). */
      tipo: "antecipar_entrada";
      codigo?: string;
      novaData: string;
    }
  | {
      /** Compra avulsa que chega direto no CD, fora da rota. */
      tipo: "compra_emergencial";
      codigo: string;
      destino: string;
      quantidade: number;
      chegada: string;
    };

/** Reposição já colocada que vai chegar nesta posição. */
export type EntradaAberta = {
  origem: "compra" | "transferencia";
  quantidade: number;
  chegada: Date;
  /** Número do pedido ou da NF. */
  documento: string | null;
  rota: string | null;
};

/** Uma parada do percurso da entrada futura, com a data de chegada. */
export type ParadaSimulada = {
  cd: string;
  chegada: Date | null;
  /** Dias úteis do trecho anterior até aqui; `null` na primeira parada. */
  transitTime: number | null;
};

export type PosicaoSimulada = {
  codigo: string;
  descricao: string | null;
  filial: string;
  forecast: number;
  consumoDiario: number;
  estoqueInicial: number;
  /** Quanto do saldo do item foi alocado a este CD. */
  entradaFutura: number;
  /** Percurso da entrada futura até este CD, com datas. */
  percurso: ParadaSimulada[];
  /** Chegada da entrada futura neste CD; `null` quando falta SLA ou rota. */
  chegadaFutura: Date | null;
  /** Primeiro dia em que o saldo fica em zero ou negativo. */
  dataRuptura: Date | null;
  /** Dias corridos sem estoque dentro do horizonte. */
  diasDescobertos: number;
  /**
   * Rompe **antes** de a entrada futura chegar neste CD.
   *
   * É esta a métrica acionável, e não `dataRuptura` sozinha: o balanço só
   * conhece o plano do mês corrente, então em um horizonte de 90 dias toda
   * posição acaba zerando por falta de reposição futura — o que diz mais sobre
   * o limite do modelo do que sobre a operação. O que a premissa de fato
   * provoca é o buraco até a carga chegar.
   */
  rompeAntesDaEntrada: boolean;
  /** Dias sem estoque entre a data base e a chegada da entrada futura. */
  diasDescobertosAteEntrada: number;
  /** Unidades que faltam para atravessar até a próxima chegada. */
  faltaUnidades: number;
  /**
   * Pedidos e transferências já em aberto com destino a esta posição.
   *
   * Vão para a tela mesmo quando a posição não rompe: saber o que já está a
   * caminho é parte da decisão, e omitir isso faria a análise parecer mais
   * grave do que é.
   */
  entradasAbertas: EntradaAberta[];
  /** Motivo de o percurso não ter data, quando for o caso. */
  aviso?: "sem_rota" | "sem_sla" | "rota_nao_termina_no_cd";
};

export type ResultadoSimulacao = {
  premissa: Premissa;
  /** Data de referência do sistema — início do balanço. */
  dataBase: string;
  posicoes: PosicaoSimulada[];
  /** Saldo do plano ainda não colocado, por item. */
  saldoTotal: number;
  itensComSaldo: number;
  /** Posições que rompem antes de a entrada futura chegar. */
  totalRompem: number;
  /** Posições que rompem em algum momento do horizonte de 90 dias. */
  totalRompemNoHorizonte: number;
  /** Posições que já estão zeradas na data base. */
  jaZeradas: number;
  /** Quantas posições ficaram sem data por falta de rota ou SLA. */
  semProjecao: number;
  /**
   * Ações que o motor não conseguiu aplicar, com o motivo.
   *
   * Existe para o "cenário com as ações" nunca sair igual ao original sem
   * explicação: se uma transferência foi descartada por falta de SLA no par, a
   * tela precisa dizer isso em vez de mostrar dois números iguais.
   */
  acoesIgnoradas: { acao: Acao; motivo: string }[];
};

type LinhaPosicao = {
  codigo: string;
  descricao: string | null;
  filial: string;
  forecast: number;
  chao: number;
  rota_compra: string | null;
};

/** Meia-noite UTC, para o balanço comparar datas sem fuso atrapalhar. */
function dia(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function somarDias(base: Date, dias: number): Date {
  return new Date(dia(base) + dias * 86_400_000);
}

/**
 * Posições do fornecedor com estoque e rota de compra.
 *
 * Mesmo universo das demais telas — forecast do mês, torre "considerar" — para
 * a simulação falar da mesma realidade que o resto do sistema mostra.
 */
async function carregarPosicoes(data: string, fornecedor: string) {
  return prisma.$queryRawUnsafe<LinhaPosicao[]>(
    `SELECT f.codigo, pr.descricao, f.filial,
            f.forecast_m0::float8 AS forecast,
            COALESCE(${CHAO}, 0)::float8 AS chao,
            f.rota_compra
       FROM forecast f
       LEFT JOIN ${simuladorPorCd("s.data_snapshot = $1::date")} s
         ON s.codigo = f.codigo AND s.filial = f.filial AND s.data_snapshot = $1::date
       LEFT JOIN produtos pr ON pr.codigo = f.codigo
      WHERE ${snapshotMensalSql("forecast", "f", "$1")}
        AND f.forecast_m0 > 0
        AND ${torreValidaSql("f")}
        AND f.filial IS NOT NULL
        AND f.codigo IN (
          SELECT DISTINCT s2.codigo FROM simulador s2 ${joinFornecedor("s2")}
           WHERE s2.data_snapshot = $1::date AND ${nomeFornecedor("s2")} = $2
        )`,
    data,
    fornecedor
  );
}

/**
 * Saldo do plano ainda não colocado, por item.
 *
 * Mesma fórmula da tela de produto e de compras urgentes: plano do mês menos o
 * que está em aberto menos o que já foi recebido.
 */
async function carregarSaldo(data: string, fornecedor: string) {
  const [ano, mes] = data.split("-").map(Number);
  const inicio = new Date(Date.UTC(ano, mes - 1, 1)).toISOString().slice(0, 10);
  const proximo = new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10);

  const linhas = await prisma.$queryRawUnsafe<{ codigo: string; saldo: number }[]>(
    `SELECT c.codigo, (c.plano - c.aberto - c.recebido)::float8 AS saldo FROM (
       SELECT p.codigo, SUM(p.plano_de_compra) AS plano,
         COALESCE((SELECT SUM(quantidade_receber) FROM pedidos_de_compra pc
            WHERE pc.codigo = p.codigo AND pc.quantidade_receber > 0
              AND pc.data_snapshot = $1::date
              AND pc.data_emissao >= $2::date AND pc.data_emissao < $3::date), 0) AS aberto,
         COALESCE((SELECT SUM(quantidade) FROM recebimento r
            WHERE r.codigo = p.codigo
              AND r.data_pedido >= $2::date AND r.data_pedido < $3::date
              AND r.data >= $2::date AND r.data < $3::date), 0) AS recebido
        FROM plano_compra p
       WHERE ${snapshotMensalSql("plano_compra", "p", "$1")}
         AND p.codigo IN (
           SELECT DISTINCT s2.codigo FROM simulador s2 ${joinFornecedor("s2")}
            WHERE s2.data_snapshot = $1::date AND ${nomeFornecedor("s2")} = $4
         )
       GROUP BY p.codigo) c`,
    data,
    inicio,
    proximo,
    fornecedor
  );

  const mapa = new Map<string, number>();
  for (const l of linhas) if (l.saldo > 0) mapa.set(l.codigo, l.saldo);
  return mapa;
}

/**
 * Percorre a rota de compra somando o SLA de cada trecho.
 *
 * A entrada futura chega no primeiro CD da rota na data da premissa; dali cada
 * perna soma seu tempo de trânsito em dias úteis, como na projeção dos pedidos
 * reais. Sem SLA em algum trecho a corrente quebra e o percurso fica sem data —
 * preferível a inventar um prazo que pareceria calculado.
 */
function projetarEntrada(
  rota: string | null,
  cdDestino: string,
  dataEntrada: Date,
  sla: Map<string, number>
): { percurso: ParadaSimulada[]; chegada: Date | null; aviso?: PosicaoSimulada["aviso"] } {
  const percurso = resolverPercursoCompra(rota, cdDestino);
  if (!percurso) {
    return { percurso: [], chegada: null, aviso: "sem_rota" };
  }

  const paradas: ParadaSimulada[] = [
    { cd: percurso.primeiroCd, chegada: dataEntrada, transitTime: null },
  ];
  let cursor: Date | null = dataEntrada;

  for (const perna of percurso.pernas) {
    const tt = sla.get(chaveSla(perna.de, perna.para)) ?? null;
    const chegada: Date | null =
      cursor !== null && tt !== null ? somarDiasUteis(cursor, tt) : null;
    paradas.push({ cd: perna.para, chegada, transitTime: tt });
    cursor = chegada;
  }

  return {
    percurso: paradas,
    chegada: cursor,
    aviso:
      percurso.inconsistente ??
      (cursor === null ? "sem_sla" : undefined),
  };
}

/**
 * Balanço dia a dia de uma posição.
 *
 * Consumo é diário e corrido — venda não pára no fim de semana, e é assim que
 * `diasDeEstoque` já trata em todo o sistema. As chegadas entram no dia em que
 * a projeção diz que chegam.
 */
function balancear(
  estoqueInicial: number,
  consumoDiario: number,
  chegadas: { data: Date; quantidade: number }[],
  base: Date,
  /** Chegada da entrada futura; recorta o trecho que a premissa realmente afeta. */
  chegadaFutura: Date | null
): {
  dataRuptura: Date | null;
  diasDescobertos: number;
  diasDescobertosAteEntrada: number;
  faltaUnidades: number;
} {
  const porDia = new Map<number, number>();
  for (const c of chegadas) {
    const k = dia(c.data);
    porDia.set(k, (porDia.get(k) ?? 0) + c.quantidade);
  }

  const limite = chegadaFutura ? dia(chegadaFutura) : Infinity;

  let saldo = estoqueInicial;
  let dataRuptura: Date | null = null;
  let diasDescobertos = 0;
  let diasDescobertosAteEntrada = 0;
  let falta = 0;

  for (let d = 0; d <= HORIZONTE_DIAS; d += 1) {
    const hoje = somarDias(base, d);
    saldo += porDia.get(dia(hoje)) ?? 0;
    saldo -= consumoDiario;

    if (saldo < 0) {
      if (dataRuptura === null) dataRuptura = hoje;
      diasDescobertos += 1;
      if (dia(hoje) <= limite) {
        diasDescobertosAteEntrada += 1;
        // O déficit que importa é o acumulado até a carga chegar: é o tamanho
        // do buraco que uma contingência precisa tapar.
        falta = Math.max(falta, -saldo);
      }
    }
  }

  return {
    dataRuptura,
    diasDescobertos,
    diasDescobertosAteEntrada,
    faltaUnidades: Math.ceil(falta),
  };
}

/**
 * Simula a premissa e devolve o quadro posição a posição.
 *
 * O saldo de cada item é distribuído entre os CDs proporcionalmente ao forecast
 * daquele CD: o plano de compra é por item e empresa, sem abertura por CD, e o
 * forecast é a única repartição que o sistema conhece. Cada fatia então percorre
 * a rota de compra do seu próprio CD.
 */
export async function simular(
  data: string,
  premissa: Premissa,
  parametros: { diasTransferencias: number; diasPedidos: number },
  /** Contingências a aplicar. Vazio = cenário sem intervenção. */
  acoes: Acao[] = []
): Promise<ResultadoSimulacao> {
  const base = new Date(`${data}T00:00:00.000Z`);
  const entrada = new Date(`${premissa.dataEntrada}T00:00:00.000Z`);
  const fracao = premissa.fracao ?? 1;

  const [posicoes, saldos, sla, chegadasAtuais] = await Promise.all([
    carregarPosicoes(data, premissa.fornecedor),
    carregarSaldo(data, premissa.fornecedor),
    carregarSla(),
    carregarChegadas(data, parametros),
  ]);

  // Forecast total por item, para repartir o saldo entre os CDs.
  const forecastPorItem = new Map<string, number>();
  for (const p of posicoes) {
    forecastPorItem.set(p.codigo, (forecastPorItem.get(p.codigo) ?? 0) + p.forecast);
  }

  let semProjecao = 0;
  const acoesIgnoradas: { acao: Acao; motivo: string }[] = [];
  const aplicadas = new Set<number>();

  const simuladas: PosicaoSimulada[] = posicoes.map((p) => {
    const totalItem = forecastPorItem.get(p.codigo) ?? 0;
    const saldoItem = saldos.get(p.codigo) ?? 0;
    const cota = totalItem > 0 ? (saldoItem * fracao * p.forecast) / totalItem : 0;

    // Antecipação muda a data de entrada antes de projetar a rota — o ganho
    // real depende dos SLAs dos trechos, não da data em si.
    //
    // A do item ganha da geral: com as duas presentes, a ordem em que vieram
    // decidiria qual vale, e uma instrução específica não pode perder para uma
    // genérica por acaso de posição na lista.
    const antecipacoes = acoes.filter(
      (a): a is Extract<Acao, { tipo: "antecipar_entrada" }> => a.tipo === "antecipar_entrada"
    );
    const antecipacao =
      antecipacoes.find((a) => a.codigo === p.codigo) ??
      antecipacoes.find((a) => !a.codigo);
    const entradaEfetiva = antecipacao
      ? new Date(`${antecipacao.novaData}T00:00:00.000Z`)
      : entrada;

    const proj = projetarEntrada(p.rota_compra, p.filial, entradaEfetiva, sla);
    if (cota > 0 && proj.chegada === null) semProjecao += 1;

    // Reposições já em aberto continuam chegando: a premissa fala do que ainda
    // será colocado, não do que já está a caminho.
    const abertas = (chegadasAtuais.get(chaveChegada(p.codigo, p.filial)) ?? []).filter(
      (r) => r.chegada !== null
    );
    const entradasAbertas: EntradaAberta[] = abertas.map((r) => ({
      origem: r.origem,
      quantidade: r.quantidade,
      chegada: r.chegada as Date,
      documento: r.documento,
      rota: r.rota,
    }));
    const chegadas = abertas.map((r) => ({
      data: r.chegada as Date,
      quantidade: r.quantidade,
    }));

    if (cota > 0 && proj.chegada) {
      chegadas.push({ data: proj.chegada, quantidade: cota });
    }

    for (const [i, acao] of acoes.entries()) {
      if (acao.tipo === "transferencia" && acao.codigo === p.codigo) {
        // Chega no destino somando o SLA do par; sai do estoque da origem no
        // mesmo dia, porque a mercadoria deixa de estar disponível ali.
        if (acao.destino === p.filial) {
          const tt = sla.get(chaveSla(acao.origem, acao.destino));
          if (tt === undefined) {
            acoesIgnoradas.push({
              acao,
              motivo: `sem SLA cadastrado entre ${acao.origem} e ${acao.destino}`,
            });
          } else {
            chegadas.push({
              data: somarDiasUteis(base, tt),
              quantidade: acao.quantidade,
            });
            aplicadas.add(i);
          }
        } else if (acao.origem === p.filial) {
          chegadas.push({ data: base, quantidade: -acao.quantidade });
        }
      }
      if (
        acao.tipo === "compra_emergencial" &&
        acao.codigo === p.codigo &&
        acao.destino === p.filial
      ) {
        chegadas.push({
          data: new Date(`${acao.chegada}T00:00:00.000Z`),
          quantidade: acao.quantidade,
        });
        aplicadas.add(i);
      }
      if (acao.tipo === "antecipar_entrada" && antecipacao === acao) {
        aplicadas.add(i);
      }
    }

    const consumoDiario = p.forecast / DIAS_NO_MES;
    const balanco = balancear(p.chao, consumoDiario, chegadas, base, proj.chegada);

    return {
      codigo: p.codigo,
      descricao: p.descricao,
      filial: p.filial,
      forecast: p.forecast,
      consumoDiario,
      estoqueInicial: p.chao,
      entradaFutura: cota,
      percurso: proj.percurso,
      chegadaFutura: proj.chegada,
      entradasAbertas,
      ...balanco,
      rompeAntesDaEntrada:
        balanco.dataRuptura !== null &&
        (proj.chegada === null || balanco.dataRuptura < proj.chegada),
      aviso: proj.aviso,
    };
  });

  // Pior primeiro: quem rompe antes, e no empate quem fica mais tempo sem
  // cobertura até a carga chegar.
  simuladas.sort(
    (a, b) =>
      (a.dataRuptura?.getTime() ?? Infinity) - (b.dataRuptura?.getTime() ?? Infinity) ||
      b.diasDescobertosAteEntrada - a.diasDescobertosAteEntrada
  );

  // Ação que não encontrou nenhuma posição para aplicar. Sem isto ela sumiria
  // sem deixar rastro, e a tela mostraria dois cenários iguais sem explicação.
  for (const [i, acao] of acoes.entries()) {
    if (aplicadas.has(i) || acoesIgnoradas.some((x) => x.acao === acao)) continue;
    acoesIgnoradas.push({
      acao,
      motivo:
        acao.tipo === "antecipar_entrada"
          ? "outra antecipação, mais específica, já vale para estas posições"
          : "não encontrou posição correspondente",
    });
  }

  const saldoTotal = [...saldos.values()].reduce((a, v) => a + v, 0);

  return {
    premissa,
    dataBase: data,
    posicoes: simuladas,
    saldoTotal,
    itensComSaldo: saldos.size,
    totalRompem: simuladas.filter((p) => p.rompeAntesDaEntrada).length,
    totalRompemNoHorizonte: simuladas.filter((p) => p.dataRuptura !== null).length,
    jaZeradas: simuladas.filter((p) => p.estoqueInicial <= 0).length,
    semProjecao,
    acoesIgnoradas,
  };
}
