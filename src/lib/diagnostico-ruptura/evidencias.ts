/**
 * A prova de cada causa.
 *
 * A árvore responde **qual foi**; isto responde **com base em quê**. Uma frase
 * pronta para a reunião e os números que a sustentam — para quem lê poder
 * discordar com argumento em vez de só desconfiar.
 *
 * **Este arquivo é feito para ser editado.** É uma tabela de causa → prova, não
 * uma cadeia de `if`. Acrescentar um número a uma causa é editar uma entrada;
 * causa sem entrada cai no genérico e não quebra nada.
 *
 * **Custo: nenhuma consulta.** Tudo que aqui vira prova já está em
 * `ContextoArvore` quando a árvore caminha — plano, forecast, abertura, pedido,
 * entregas, prazo do fornecedor, sobra dos outros CDs. O que antes era o
 * cálculo contrafactual do motor continua rodando (58ms nos 458 eventos), mas
 * agora como evidência e não como um segundo veredito: a prescrição —
 * *"transferir 180 até 04/09 teria evitado"* — é a parte acionável disto.
 */
import { diasEmRuptura, type Cenario } from "./replay";
import { prescrever } from "./prescricao";
import type { SobraNoCd } from "./eventos";
import type { ContextoArvore } from "./arvore";

/** A prova de uma causa, como a tela mostra. */
export type Evidencia = {
  /** Uma frase inteira, com os números dentro. É o que vai para a ata. */
  resumo: string;
  /** Os números soltos, para a grade de detalhe. */
  valores: Record<string, number | string | null>;
  /** O que teria evitado, e de onde. Só quando havia estoque na rede. */
  prescricao?: {
    tipo: "evitaria" | "reduziria";
    quantidade: number;
    data: string;
    diasRestantes: number;
    /** CD que tinha a sobra. */
    cd: string | null;
    sobraNoCd: number | null;
  };
  /** Os CDs com estoque acima do Alvo no dia, do maior para o menor. */
  doadores?: { cd: string; sobra: number; disponivel: number }[];
  /**
   * Outro CD tinha sobra acima do Alvo e nada saiu.
   *
   * Modificador, não causa: vale em cima de qualquer veredito. Uma ruptura
   * herdada da abertura continua sendo da abertura, e ainda assim podia ter
   * sido evitada com o que estava parado noutro CD.
   */
  balanceamentoNaoRealizado: boolean;
};

/** O que o diagnóstico sabe além do contexto da árvore. */
export type ExtrasEvidencia = {
  /** Sobra por CD do item, no dia de referência. */
  sobraPorCd: SobraNoCd[];
  /** Linhas de pedido que sumiram sem recebimento, nesta posição. */
  pedidosSumidos: number;
  /** Transferências em aberto rumo a este CD, e o atraso da perna atual. */
  percurso?: { transferencias: number; piorAtraso: number };
  /** Carga do dia que falhou na sanidade, quando foi esse o caso. */
  cargaSuspeita?: { data: string; motivo: string; detalhe: string };
};

const n1 = (v: number) =>
  v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const dia = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

/** Consumo diário pelo forecast — a régua de todas as contas de necessidade. */
const porDia = (c: ContextoArvore) => c.forecastMensal / 30;

/**
 * Necessidade: o que precisaria estar comprado para atravessar o lead time
 * mais a política. Mesma fórmula da árvore e do motor.
 */
const necessidade = (c: ContextoArvore) =>
  porDia(c) * (c.leadTime + (c.abertura?.politicaDias ?? 0));

/** Quantos dias de venda uma quantidade cobre. */
const emDias = (c: ContextoArvore, quantidade: number) =>
  porDia(c) > 0 ? quantidade / porDia(c) : 0;

type Montador = (
  c: ContextoArvore,
  x: ExtrasEvidencia,
) => { resumo: string; valores: Record<string, number | string | null> };

/**
 * Uma entrada por causa.
 *
 * A ordem não importa — é busca por chave. O que importa é que cada frase
 * nomeie os números que a decidiram, nas mesmas unidades em que a operação
 * pensa: unidades para quantidade, dias para prazo.
 */
const POR_CAUSA: Record<string, Montador> = {
  base_inconsistente: (c, x) => ({
    resumo: x.cargaSuspeita
      ? `A carga de ${dia(x.cargaSuspeita.data)} não passou no teste de sanidade (${x.cargaSuspeita.motivo}): ${x.cargaSuspeita.detalhe}. Nenhuma causa é atribuída sobre base quebrada.`
      : "A carga do dia não passou no teste de sanidade, e nenhuma causa é atribuída sobre base quebrada.",
    valores: {
      carga: x.cargaSuspeita?.data ?? null,
      motivo: x.cargaSuspeita?.motivo ?? null,
    },
  }),

  estoque_retido: (c) => {
    const retido = c.retido ?? 0;
    return {
      resumo: `Há ${n1(retido)} unidades no CD que não vendem — Q40 ou RC —, equivalentes a ${n1(emDias(c, retido))} dias de venda. O estoque existe e está no lugar errado: não se compra o que já chegou.`,
      valores: {
        retido,
        dias_que_o_retido_cobriria: emDias(c, retido),
        disponivel_para_venda: c.abertura?.disponivel ?? 0,
        consumo_diario: porDia(c),
      },
    };
  },

  nova_abertura: (c) => {
    const a = c.aberturaForecast;
    const dias = a
      ? (Date.parse(`${c.evento.inicio}T00:00:00Z`) -
          Date.parse(`${a.data}T00:00:00Z`)) /
        86_400_000
      : null;
    return {
      resumo: a
        ? `O forecast deste CD foi ligado em ${dia(a.data)} com ${n1(a.forecast)} unidades/mês${a.linhaNova ? " (CD novo para o item)" : " (a posição existia zerada)"}, e a ruptura começou ${n1(dias ?? 0)} dias depois — menos que o lead time de ${n1(c.leadTime)} dias. Não houve prazo material para comprar.`
        : "O forecast desta posição é recente e não houve prazo para comprar.",
      valores: {
        forecast_aberto_em: a?.data ?? null,
        forecast_que_entrou: a?.forecast ?? null,
        linha_nova: a?.linhaNova ? "sim" : "não",
        dias_ate_a_ruptura: dias,
        lead_time: c.leadTime,
      },
    };
  },

  abertura_descoberta: (c) => {
    const a = c.abertura;
    const pede = (a?.consumoDiario ?? 0) * (a?.politicaDias ?? 0);
    return {
      resumo: a
        ? `O mês abriu com ${n1(a.disponivel)} unidades e ${n1(a.aCaminho)} a caminho, contra ${n1(pede)} que a política de ${n1(a.politicaDias)} dias pede — cobertura de ${a.coberturaDias === null ? "indefinida" : `${n1(a.coberturaDias)} dias`}. A ruptura já estava contratada antes do mês começar.`
        : "O mês abriu descoberto.",
      valores: {
        estoque_na_abertura: a?.disponivel ?? 0,
        a_caminho_na_abertura: a?.aCaminho ?? 0,
        politica_dias: a?.politicaDias ?? 0,
        estoque_que_a_politica_pede: pede,
        cobertura_dias_na_abertura: a?.coberturaDias ?? null,
        consumo_diario: porDia(c),
        forecast_mensal: c.forecastMensal,
      },
    };
  },

  venda_acelerada_mes_anterior: (c) => {
    const m = c.mesAnterior;
    const excedente = m?.excedente ?? 0;
    return {
      resumo: m
        ? `No mês anterior vendeu ${n1(m.vendido)} contra ${n1(m.forecast)} previstos — ${m.indice === null ? "sem base de comparação" : `${n1(m.indice * 100)}% do previsto`}. O excedente de ${n1(excedente)} unidades é o estoque que cobriria ${n1(emDias(c, excedente))} dias deste mês e saiu antes.`
        : "A venda do mês anterior superou o previsto.",
      valores: {
        vendido_mes_anterior: m?.vendido ?? 0,
        forecast_mes_anterior: m?.forecast ?? 0,
        indice: m?.indice ?? null,
        excedente: excedente,
        dias_que_o_excedente_cobriria: emDias(c, excedente),
      },
    };
  },

  sem_plano_mes_anterior: (c) => ({
    resumo: `Não havia plano de compra no mês anterior para este item, e a necessidade daquele mês era de ${n1(c.planoMesAnterior?.necessidade ?? 0)} unidades. O mês abriu com o que sobrou do anterior, não com o que foi planejado.`,
    valores: {
      plano_mes_anterior: c.planoMesAnterior?.plano ?? 0,
      necessidade_mes_anterior: c.planoMesAnterior?.necessidade ?? 0,
      forecast_mes_anterior: c.mesAnterior?.forecast ?? 0,
      estoque_na_abertura: c.abertura?.disponivel ?? 0,
    },
  }),

  plano_insuficiente_mes_anterior: (c) => {
    const p = c.planoMesAnterior;
    const falta = Math.max(0, (p?.necessidade ?? 0) - (p?.plano ?? 0));
    return {
      resumo: `O plano do mês anterior era de ${n1(p?.plano ?? 0)} unidades contra uma necessidade de ${n1(p?.necessidade ?? 0)} — faltaram ${n1(falta)}, ou ${n1(emDias(c, falta))} dias de cobertura que não entraram no plano.`,
      valores: {
        plano_mes_anterior: p?.plano ?? 0,
        necessidade_mes_anterior: p?.necessidade ?? 0,
        faltou: falta,
        dias_de_cobertura_que_faltaram: emDias(c, falta),
      },
    };
  },

  fora_do_plano: (c) => ({
    resumo: `Este item não tem plano de compra no mês, e a necessidade é de ${n1(necessidade(c))} unidades — ${n1(c.leadTime)} dias de lead time mais ${n1(c.abertura?.politicaDias ?? 0)} de política, a ${n1(porDia(c))} por dia. Sem plano, nenhum pedido tinha de onde sair.`,
    valores: {
      plano_do_mes: c.planoDoMes?.plano ?? 0,
      necessidade: necessidade(c),
      forecast_mensal: c.forecastMensal,
      consumo_diario: porDia(c),
      lead_time: c.leadTime,
      politica_dias: c.abertura?.politicaDias ?? 0,
      estoque_na_abertura: c.abertura?.disponivel ?? 0,
    },
  }),

  plano_insuficiente: (c) => {
    const plano = c.planoDoMes?.plano ?? 0;
    const falta = Math.max(0, necessidade(c) - plano);
    return {
      resumo: `O plano do mês é de ${n1(plano)} unidades contra uma necessidade de ${n1(necessidade(c))} — faltam ${n1(falta)}, ou ${n1(emDias(c, falta))} dias de cobertura. O pedido não podia cobrir o que o plano não previu.`,
      valores: {
        plano_do_mes: plano,
        necessidade: necessidade(c),
        faltou: falta,
        dias_de_cobertura_que_faltaram: emDias(c, falta),
        forecast_mensal: c.forecastMensal,
        estoque_na_abertura: c.abertura?.disponivel ?? 0,
      },
    };
  },

  sem_saldo_plano: (c) => ({
    resumo: `Na data limite de compra, ${c.pedido ? dia(c.pedido.dataLimite) : "—"}, o saldo do plano já estava em ${n1(c.saldoNaDataLimite ?? 0)}. O pedido não saiu por falta de verba, não por esquecimento — a cobrança é de planejamento, não de compras.`,
    valores: {
      data_limite: c.pedido?.dataLimite ?? null,
      saldo_na_data_limite: c.saldoNaDataLimite ?? 0,
      plano_do_mes: c.planoDoMes?.plano ?? 0,
      saldo_do_mes: c.planoDoMes?.saldo ?? 0,
      necessidade: necessidade(c),
    },
  }),

  pedido_tarde: (c) => {
    const p = c.pedido;
    const atraso = p
      ? (Date.parse(`${p.emitidoEm}T00:00:00Z`) -
          Date.parse(`${p.dataLimite}T00:00:00Z`)) /
        86_400_000
      : 0;
    return {
      resumo: p
        ? `Havia plano e havia ${n1(c.saldoNaDataLimite ?? 0)} de saldo, e o pedido saiu em ${dia(p.emitidoEm)} — ${n1(atraso)} dias depois da data limite de ${dia(p.dataLimite)}, que é o início da ruptura menos o lead time de ${n1(c.leadTime)} dias.`
        : "O pedido saiu depois da data limite.",
      valores: {
        emitido_em: p?.emitidoEm ?? null,
        data_limite: p?.dataLimite ?? null,
        atraso_dias: atraso,
        quantidade_pedida: p?.quantidade ?? 0,
        saldo_na_data_limite: c.saldoNaDataLimite ?? 0,
        lead_time: c.leadTime,
      },
    };
  },

  pedido_nao_colocado: (c) => ({
    resumo: `Havia plano de ${n1(c.planoDoMes?.plano ?? 0)} unidades e ${n1(c.saldoNaDataLimite ?? 0)} de saldo na data limite, e nenhum pedido foi emitido no mês para esta posição. A compra simplesmente não aconteceu.`,
    valores: {
      plano_do_mes: c.planoDoMes?.plano ?? 0,
      saldo_na_data_limite: c.saldoNaDataLimite ?? 0,
      necessidade: necessidade(c),
      pedidos_no_mes: 0,
    },
  }),

  comprou_pouco: (c) => {
    const p = c.pedido;
    const falta = Math.max(0, necessidade(c) - (p?.quantidade ?? 0));
    return {
      resumo: `O pedido saiu no prazo, em ${p ? dia(p.emitidoEm) : "—"}, mas com ${n1(p?.quantidade ?? 0)} unidades contra uma necessidade de ${n1(necessidade(c))} — ${n1(falta)} a menos, ou ${n1(emDias(c, falta))} dias descobertos.`,
      valores: {
        quantidade_pedida: p?.quantidade ?? 0,
        necessidade: necessidade(c),
        faltou: falta,
        dias_descobertos: emDias(c, falta),
        emitido_em: p?.emitidoEm ?? null,
      },
    };
  },

  pedido_cancelado: (c, x) => ({
    resumo: `${x.pedidosSumidos} linha(s) de pedido desapareceram da base entre snapshots consecutivos sem recebimento correspondente. O pedido existia, foi cortado ou cancelado, e ninguém foi avisado.`,
    valores: {
      linhas_que_sumiram: x.pedidosSumidos,
      num_pedido: c.pedido ? "ver detalhe do pedido" : null,
      quantidade_pedida: c.pedido?.quantidade ?? 0,
      emitido_em: c.pedido?.emitidoEm ?? null,
    },
  }),

  fornecedor_atrasou: (c) => {
    const atrasadas = (c.entregas ?? []).filter(
      (e) => c.prazo?.cadastrado && e.leadReal > c.prazo.cadastrado,
    );
    const pior = atrasadas.reduce(
      (a, e) => Math.max(a, e.leadReal - (c.prazo?.cadastrado ?? 0)),
      0,
    );
    return {
      resumo: `${atrasadas.length} de ${(c.entregas ?? []).length} entregas da janela passaram do prazo cadastrado de ${n1(c.prazo?.cadastrado ?? 0)} dias — a pior em ${n1(pior)} dias. O cadastro não é o problema: a mediana real do par é ${c.prazo?.realMediano === null ? "indisponível" : `${n1(c.prazo?.realMediano ?? 0)} dias`}.`,
      valores: {
        prazo_cadastrado: c.prazo?.cadastrado ?? null,
        prazo_real_mediano: c.prazo?.realMediano ?? null,
        entregas_na_janela: (c.entregas ?? []).length,
        entregas_atrasadas: atrasadas.length,
        pior_atraso_dias: pior,
      },
    };
  },

  lead_time_cadastro: (c) => {
    const p = c.prazo;
    const diferenca = (p?.realMediano ?? 0) - (p?.cadastrado ?? 0);
    return {
      resumo: `O prazo cadastrado é de ${n1(p?.cadastrado ?? 0)} dias e a mediana real é de ${n1(p?.realMediano ?? 0)} — ${n1(diferenca)} dias de diferença, sustentados por ${p?.entregas ?? 0} entregas. Não é atraso isolado: é o cadastro que alimenta toda data limite de compra do sistema.`,
      valores: {
        prazo_cadastrado: p?.cadastrado ?? null,
        prazo_real_mediano: p?.realMediano ?? null,
        diferenca_dias: diferenca,
        entregas_que_sustentam: p?.entregas ?? 0,
      },
    };
  },

  entrega_parcial: (c) => {
    const recebido = (c.entregas ?? []).reduce((a, e) => a + e.quantidade, 0);
    const pedido = c.pedido?.quantidade ?? 0;
    return {
      resumo: `O pedido era de ${n1(pedido)} unidades e entraram ${n1(recebido)} — faltam ${n1(Math.max(0, pedido - recebido))}, ou ${n1(emDias(c, Math.max(0, pedido - recebido)))} dias de cobertura. Entrega parcial ou backorder.`,
      valores: {
        quantidade_pedida: pedido,
        quantidade_recebida: recebido,
        faltou: Math.max(0, pedido - recebido),
        entregas: (c.entregas ?? []).length,
      },
    };
  },

  triangulacao_lenta: (c, x) => ({
    resumo: `Há ${x.percurso?.transferencias ?? 0} transferência(s) em aberto com destino final neste CD, e a perna atual já passou do SLA em ${n1(x.percurso?.piorAtraso ?? 0)} dias. A mercadoria existe e está no caminho errado do prazo.`,
    valores: {
      transferencias_a_caminho: x.percurso?.transferencias ?? 0,
      pior_atraso_dias: x.percurso?.piorAtraso ?? 0,
      pedido_triangulado: c.triangulado ? "sim" : "não",
    },
  }),

  parada_hub: (c, x) => ({
    resumo: `A mercadoria já entrou num CD intermediário e a nota seguinte não saiu: a perna atual sai de um hub e está ${n1(x.percurso?.piorAtraso ?? 0)} dias além do SLA. ${x.percurso?.transferencias ?? 0} transferência(s) em aberto para este CD.`,
    valores: {
      transferencias_a_caminho: x.percurso?.transferencias ?? 0,
      pior_atraso_dias: x.percurso?.piorAtraso ?? 0,
    },
  }),

  venda_acima_forecast: (c) => {
    const vendido = [...c.vendas.values()].reduce((a, q) => a + q, 0);
    const dias = c.vendas.size || 1;
    const previsto = porDia(c) * dias;
    return {
      resumo: `Na janela vendeu ${n1(vendido)} contra ${n1(previsto)} previstos em ${dias} dias — ${previsto > 0 ? n1((vendido / previsto) * 100) : "—"}% do forecast. O excedente de ${n1(Math.max(0, vendido - previsto))} unidades não estava comprado.`,
      valores: {
        vendido_na_janela: vendido,
        previsto_na_janela: previsto,
        dias_da_janela: dias,
        excedente: Math.max(0, vendido - previsto),
        forecast_mensal: c.forecastMensal,
      },
    };
  },

  saida_nao_usual: (c) => ({
    resumo: `O balanço do dia a dia não fecha e não há venda nem transferência que explique a saída. Vale conferir perda, ajuste de inventário ou nota de outra natureza.`,
    valores: {
      estoque_na_abertura: c.abertura?.disponivel ?? 0,
      vendido_na_janela: [...c.vendas.values()].reduce((a, q) => a + q, 0),
      chegadas_na_janela: c.chegadas.length,
    },
  }),

  indefinida: (c) => ({
    resumo: `O percurso da árvore parou por falta de dado — a trilha mostra em qual pergunta. Não é falha do diagnóstico: é carga faltando, e repor o dado resolve o caso.`,
    valores: {
      forecast_mensal: c.forecastMensal,
      estoque_na_abertura: c.abertura?.disponivel ?? 0,
      lead_time: c.leadTime,
      plano_do_mes: c.planoDoMes?.plano ?? 0,
    },
  }),
};

/** Genérico, para causa sem entrada própria. Nunca deixa a tela vazia. */
const GENERICO: Montador = (c) => ({
  resumo: `Ruptura de ${c.evento.dias} dias, com forecast de ${n1(c.forecastMensal)} unidades/mês e ${n1(c.abertura?.disponivel ?? 0)} de estoque na abertura.`,
  valores: {
    forecast_mensal: c.forecastMensal,
    estoque_na_abertura: c.abertura?.disponivel ?? 0,
    consumo_diario: porDia(c),
    lead_time: c.leadTime,
  },
});

/**
 * Monta a prova da causa que a árvore apontou.
 *
 * A prescrição entra à parte, e não como uma causa: ela responde outra
 * pergunta — não *de quem foi*, mas *o que teria bastado*. Vale em cima de
 * qualquer causa, porque mesmo uma ruptura herdada da abertura podia ter sido
 * evitada com o estoque que estava parado noutro CD.
 */
export function evidenciar(
  c: ContextoArvore,
  causa: string,
  x: ExtrasEvidencia,
  /** Vem da classificação: a árvore decide a quais causas o modificador vale. */
  balanceamentoNaoRealizado = false,
): Evidencia {
  const montador = POR_CAUSA[causa] ?? GENERICO;
  const { resumo, valores } = montador(c, x);

  const real: Cenario = {
    de: c.de,
    ate: c.ate,
    estoqueInicial: c.abertura?.disponivel ?? 0,
    consumo: c.vendas,
    chegadas: c.chegadas,
  };
  const disponivel = x.sobraPorCd.reduce((a, s) => a + s.sobra, 0);
  const receita = prescrever(real, disponivel, c.evento.inicio);

  // O doador é o CD com a maior sobra: é por ele que a operação começaria, e
  // dizer "a rede tinha estoque" sem nomear onde não é acionável.
  const doador = x.sobraPorCd[0] ?? null;

  return {
    resumo,
    valores,
    balanceamentoNaoRealizado,
    ...(receita
      ? {
          prescricao: {
            tipo: receita.tipo,
            quantidade: receita.prescricao.quantidade,
            data: receita.prescricao.data,
            diasRestantes: receita.prescricao.diasRestantes,
            cd: doador?.filial ?? null,
            sobraNoCd: doador?.sobra ?? null,
          },
        }
      : {}),
    ...(x.sobraPorCd.length > 0
      ? {
          doadores: x.sobraPorCd.slice(0, 5).map((s) => ({
            cd: s.filial,
            sobra: s.sobra,
            disponivel: s.disponivel,
          })),
        }
      : {}),
  };
}

/**
 * O replay reproduz a ruptura observada?
 *
 * Fica aqui porque é prova, não causa: um diagnóstico construído sobre um
 * balanço que não fecha não merece a mesma confiança, e a tela precisa dizer
 * isso. Medido na validação, 75% dos eventos passam.
 */
export function replayDivergiu(c: ContextoArvore): boolean {
  const simulado = diasEmRuptura({
    de: c.de,
    ate: c.ate,
    estoqueInicial: c.abertura?.disponivel ?? 0,
    consumo: c.vendas,
    chegadas: c.chegadas,
  });
  return Math.abs(simulado - c.evento.dias) > Math.max(2, c.evento.dias * 0.3);
}
