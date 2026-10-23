/**
 * A árvore de decisão, como tabela.
 *
 * Classifica uma posição item × CD rompida em **uma** causa, percorrendo as
 * perguntas em ordem. É o irmão simples do motor contrafactual: aquele mede
 * quantos dias cada etapa explica e devolve várias causas com percentual; este
 * responde "qual foi", numa frase que qualquer pessoa consegue conferir
 * seguindo o fluxo.
 *
 * **Este arquivo é feito para ser editado.** A árvore é uma tabela de nós, não
 * uma cadeia de `if`: mudar uma pergunta, trocar um ramo ou acrescentar um nó
 * é editar uma entrada de `ARVORE`, e a ordem das perguntas se lê de cima para
 * baixo como se lê o diagrama. Os ids são os mesmos de
 * `docs/arvore-diagnostico.md`, e um teste compara os dois: rewirar um ramo
 * aqui sem atualizar o desenho quebra a suíte.
 *
 * Os limites moram em `parametros.ts`, junto com os do motor — um diagnóstico
 * que usasse réguas diferentes do outro produziria duas verdades.
 */
import type { PosicaoAbertura, MesAnterior, AberturaForecast } from "./abertura";
import { causaPorSlug } from "./catalogo";
import type { Entrega, PrazoFornecedor } from "./janela";
import type { Evento } from "./eventos";
import type { Chegada } from "./replay";
import { LIMITES } from "./parametros";

/**
 * Tudo que uma posição precisa para ser diagnosticada.
 *
 * Os primeiros campos vinham de `Contexto`, no módulo de regras do motor
 * contrafactual. Aquele módulo saiu junto com a atribuição de dias, e o tipo
 * veio morar aqui — é a árvore que consome tudo isto agora.
 *
 * Campos opcionais do segundo bloco são sinais que podem faltar. Um teste que
 * não consegue responder devolve `null`, e o caminhante **para** e devolve
 * "indefinida": seguir pelo "não" acusaria a partir de ausência de dado, que
 * foi o erro medido em 196 dos 458 eventos de setembro.
 */
export type ContextoArvore = {
  evento: Evento;
  /** Janela do replay: da foto de abertura até a data de referência. */
  de: string;
  ate: string;
  /** Vendas reais por dia, já tratadas como demanda nos dias de ruptura. */
  vendas: Map<string, number>;
  /** Entradas reais, de compra e de transferência. */
  chegadas: Chegada[];
  /** Forecast mensal da posição. */
  forecastMensal: number;
  /** Como a posição estava na foto de abertura; ausente quando não havia. */
  abertura?: PosicaoAbertura;
  /** Venda do mês anterior contra o forecast daquele mês. */
  mesAnterior?: MesAnterior;
  /** Quando o forecast desta posição foi aberto, se foi recente. */
  aberturaForecast?: AberturaForecast;
  /** Plano de compra do item no mês, somado na rede. */
  planoDoMes?: { plano: number; saldo: number };
  /** Lead time em dias para repor esta posição. */
  leadTime: number;
  /** Estoque disponível em outros CDs quando a ruptura ficou previsível. */
  excedenteOutrosCds: number;
  /** Entregas que chegaram na janela, com o prazo que levaram. */
  entregas?: Entrega[];
  /** Prazo cadastrado e real do par fornecedor × CD desta posição. */
  prazo?: PrazoFornecedor;

  /** A carga do dia falhou no teste de sanidade. */
  cargaSuspeita?: boolean;
  /** Estoque que existe no CD e não vende: Q40, RC, bloqueio, reserva. */
  retido?: number;
  /** Plano de compra do mês **anterior**, e se ele cobria a necessidade. */
  planoMesAnterior?: { plano: number; necessidade: number };
  /** A compra do mês anterior chegou dentro do prazo. */
  compraMesAnteriorNoPrazo?: boolean | null;
  /** Saldo do plano na data limite de compra. */
  saldoNaDataLimite?: number;
  /** Pedido do ciclo: quando saiu, quanto pediu. */
  pedido?: { emitidoEm: string; quantidade: number; dataLimite: string };
  /** O pedido sumiu da base sem recebimento correspondente. */
  pedidoSumiuSemReceber?: boolean;
  /** O pedido percorreu uma rota entre CDs. */
  triangulado?: boolean;
  /** O trecho entre CDs estourou o SLA de transferência. */
  slaInternoEstourado?: boolean | null;
  /** A mercadoria entrou no hub e a nota seguinte demorou a sair. */
  paradaNoHub?: boolean | null;
  /** O balanço do replay não fecha e não há venda nem transferência que explique. */
  saidaNaoUsual?: boolean | null;
  /** Outro CD tinha sobra acima do Alvo e nada saiu. */
  podiaTransferirENaoTransferiu?: boolean;
};

/** A resposta de um nó, com o que o teste olhou. */
export type Veredito = {
  /** `null` quando o dado não permite responder. */
  resposta: boolean | null;
  evidencia?: Record<string, unknown>;
};

export type No = {
  id: string;
  pergunta: string;
  teste: (c: ContextoArvore) => Veredito;
  /** Id de outro nó, ou o slug de uma causa — o caminhante distingue sozinho. */
  sim: string;
  nao: string;
};

/** Um passo do caminho percorrido, para a tela mostrar o teste de cada etapa. */
export type Passo = {
  no: string;
  pergunta: string;
  resposta: boolean | null;
  evidencia?: Record<string, unknown>;
};

export type Classificacao = {
  /** Slug do catálogo. */
  causa: string;
  rotulo: string;
  dono: string;
  trilha: Passo[];
  /** Algum nó do caminho ficou sem dado para responder. */
  incompleta: boolean;
  /** O modificador: outro CD tinha sobra e nada saiu. */
  balanceamentoNaoRealizado: boolean;
};

const sim = (evidencia?: Record<string, unknown>): Veredito => ({
  resposta: true,
  evidencia,
});
const nao = (evidencia?: Record<string, unknown>): Veredito => ({
  resposta: false,
  evidencia,
});
const semDado = (evidencia?: Record<string, unknown>): Veredito => ({
  resposta: null,
  evidencia,
});

/** Consumo diário do forecast, a régua de todas as contas de necessidade. */
const porDia = (c: ContextoArvore) => c.forecastMensal / 30;

/**
 * Necessidade: o que precisaria estar comprado para atravessar o lead time
 * mais a política. Mesma fórmula que o motor usa em `regras.ts`.
 */
function necessidade(c: ContextoArvore): number {
  return porDia(c) * (c.leadTime + (c.abertura?.politicaDias ?? 0));
}

/** Soma das vendas da janela, contra o forecast proporcional a ela. */
function vendaContraForecast(c: ContextoArvore) {
  const vendido = [...c.vendas.values()].reduce((a, q) => a + q, 0);
  const dias = c.vendas.size || 1;
  const previsto = porDia(c) * dias;
  return { vendido, previsto, indice: previsto > 0 ? vendido / previsto : null };
}

/**
 * A árvore.
 *
 * Lê-se de cima para baixo na mesma ordem do diagrama. Cada entrada é
 * independente das outras: para mover uma pergunta de lugar, basta reapontar
 * os `sim`/`nao` que chegam nela.
 */
export const ARVORE: No[] = [
  {
    id: "D0",
    pergunta: "A carga do dia é confiável?",
    // Primeiro de todos de propósito. O motor atribui responsabilidade, e base
    // quebrada vira acusação errada: em 26/08/2026 uma carga de forecast veio
    // com 16.178 códigos nulos, e sem esta trava o dia apontaria 6.168
    // rupturas inexistentes, todas com confiança alta.
    teste: (c) =>
      c.cargaSuspeita ? nao({ carga_suspeita: true }) : sim(),
    sim: "D1",
    nao: "base_inconsistente",
  },
  {
    id: "D1",
    pergunta: "O estoque existe, mas está retido?",
    // Resposta de outra natureza: o estoque está lá. Vem cedo porque saber que
    // existe muda a ação — não se compra o que já está no CD.
    teste: (c) =>
      c.retido === undefined
        ? semDado()
        : c.retido > 0
          ? sim({ retido: c.retido })
          : nao({ retido: 0 }),
    sim: "estoque_retido",
    nao: "D2",
  },
  {
    id: "D2",
    pergunta:
      "O forecast deste CD abriu contra o snapshot anterior, há menos de um lead time?",
    // A comparação é com a importação imediatamente anterior, nunca com um
    // marco de mês: é assim que o fato acontece na operação.
    teste: (c) => {
      const a = c.aberturaForecast;
      if (!a) return nao();
      const dias =
        (Date.parse(`${c.evento.inicio}T00:00:00Z`) -
          Date.parse(`${a.data}T00:00:00Z`)) /
        86_400_000;
      const ev = {
        aberto_em: a.data,
        dias_ate_a_ruptura: dias,
        lead_time: c.leadTime,
      };
      // `dias >= 0` não é detalhe: sem o piso, um forecast ligado **depois** da
      // ruptura passava no teste e virava a causa dela. Visto na tela, com a
      // própria evidência imprimindo "a ruptura começou -19 dias depois" —
      // forecast de 20/10 explicando ruptura de 01/10. Abertura posterior ao
      // fato não causa o fato.
      return dias >= 0 && dias <= c.leadTime ? sim(ev) : nao(ev);
    },
    sim: "nova_abertura",
    nao: "D3",
  },
  {
    id: "D3",
    pergunta: "Abrimos o mês já rompido ou abaixo da política do item × CD?",
    // A política por item × CD, e não 30 dias fixos em Cia: a ruptura é por CD,
    // e 5.152 de 15.719 posições têm política diferente de 30.
    teste: (c) => {
      const a = c.abertura;
      if (!a) return semDado();
      const alvo = a.consumoDiario * a.politicaDias;
      const ev = {
        estoque_na_abertura: a.disponivel,
        politica_dias: a.politicaDias,
        estoque_que_a_politica_pede: alvo,
      };
      return a.disponivel <= 0 || a.abaixoDaPolitica ? sim(ev) : nao(ev);
    },
    sim: "A1",
    nao: "B1",
  },

  // ---- ponto de partida: por que o mês abriu assim -------------------------
  {
    id: "A1",
    pergunta: "A venda do mês anterior superou o forecast daquele mês?",
    teste: (c) => {
      const m = c.mesAnterior;
      if (!m || m.indice === null) return semDado();
      const ev = { vendido: m.vendido, forecast: m.forecast, indice: m.indice };
      return m.indice > 1 + LIMITES.aceleracaoVenda ? sim(ev) : nao(ev);
    },
    sim: "venda_acelerada_mes_anterior",
    nao: "A2",
  },
  {
    id: "A2",
    pergunta: "Havia plano de compra no mês anterior?",
    teste: (c) => {
      const p = c.planoMesAnterior;
      if (!p) return semDado();
      return p.plano > 0 ? sim({ plano: p.plano }) : nao({ plano: p.plano });
    },
    sim: "A3",
    nao: "sem_plano_mes_anterior",
  },
  {
    id: "A3",
    pergunta: "O plano do mês anterior cobria a necessidade?",
    teste: (c) => {
      const p = c.planoMesAnterior;
      if (!p) return semDado();
      const ev = { plano: p.plano, necessidade: p.necessidade };
      return p.plano >= p.necessidade * (1 - LIMITES.planoInsuficiente)
        ? sim(ev)
        : nao(ev);
    },
    sim: "A4",
    nao: "plano_insuficiente_mes_anterior",
  },
  {
    id: "A4",
    pergunta: "A compra do mês anterior chegou no prazo?",
    // O "não" desce para o ramo do fornecedor, com a janela do mês anterior:
    // a pergunta "por que não chegou" é a mesma, só muda o mês.
    teste: (c) =>
      c.compraMesAnteriorNoPrazo === undefined ||
      c.compraMesAnteriorNoPrazo === null
        ? semDado()
        : c.compraMesAnteriorNoPrazo
          ? sim()
          : nao(),
    sim: "abertura_descoberta",
    nao: "F1",
  },

  // ---- plano e compra do mês ----------------------------------------------
  {
    id: "B1",
    pergunta: "Havia plano de compra no mês atual?",
    teste: (c) => {
      const p = c.planoDoMes;
      const plano = p?.plano ?? 0;
      return plano > 0 ? sim({ plano }) : nao({ plano });
    },
    sim: "B2",
    nao: "fora_do_plano",
  },
  {
    id: "B2",
    pergunta: "O plano cobria a necessidade?",
    teste: (c) => {
      const plano = c.planoDoMes?.plano ?? 0;
      const n = necessidade(c);
      const ev = { plano, necessidade: n };
      if (n <= 0) return sim(ev);
      return plano >= n * (1 - LIMITES.planoInsuficiente) ? sim(ev) : nao(ev);
    },
    sim: "B3",
    nao: "plano_insuficiente",
  },
  {
    id: "B3",
    pergunta: "O pedido foi colocado até a data limite?",
    teste: (c) => {
      const p = c.pedido;
      // Ausência de pedido é fato, não falta de dado: `pedidos_de_compra` traz
      // tudo que está em aberto no snapshot, então não achar a posição ali
      // significa que nada foi emitido no mês. Devolver "sem dado" aqui — como
      // esta regra fazia — jogava 28 casos medidos para o ramo da data limite
      // sem nunca ter havido data de emissão para comparar.
      if (!p) return nao({ pedido: "nenhum no mes" });
      const atraso =
        (Date.parse(`${p.emitidoEm}T00:00:00Z`) -
          Date.parse(`${p.dataLimite}T00:00:00Z`)) /
        86_400_000;
      const ev = { emitido_em: p.emitidoEm, data_limite: p.dataLimite, atraso };
      return atraso <= LIMITES.diasTolerenciaPedido ? sim(ev) : nao(ev);
    },
    sim: "B4",
    nao: "B3a",
  },
  {
    id: "B3a",
    pergunta: "Havia saldo no plano na data limite?",
    // Separa duas conversas que o atraso sozinho confunde: sem verba, a
    // cobrança é de planejamento; com verba, é de compras.
    teste: (c) =>
      c.saldoNaDataLimite === undefined
        ? semDado()
        : c.saldoNaDataLimite > 0
          ? sim({ saldo: c.saldoNaDataLimite })
          : nao({ saldo: c.saldoNaDataLimite }),
    sim: "B3b",
    nao: "sem_saldo_plano",
  },
  {
    id: "B3b",
    pergunta: "Houve algum pedido no mês para esta posição?",
    // Separa o atraso da omissão. As duas vêm por B3 pelo "não" e são
    // cobranças diferentes: pedido tardio é prazo, nenhum pedido é a compra
    // que não aconteceu — e a frase "pedido colocado tarde" sobre uma posição
    // sem pedido nenhum é falsa.
    teste: (c) =>
      c.pedido
        ? sim({ emitido_em: c.pedido.emitidoEm })
        : nao({ pedido: "nenhum no mes" }),
    sim: "pedido_tarde",
    nao: "pedido_nao_colocado",
  },
  {
    id: "B4",
    pergunta: "A quantidade pedida cobria a necessidade?",
    teste: (c) => {
      const p = c.pedido;
      if (!p) return semDado();
      const n = necessidade(c);
      const ev = { quantidade: p.quantidade, necessidade: n };
      if (n <= 0) return sim(ev);
      return p.quantidade >= n * (1 - LIMITES.planoInsuficiente)
        ? sim(ev)
        : nao(ev);
    },
    sim: "B5",
    nao: "comprou_pouco",
  },
  {
    id: "B5",
    pergunta: "O pedido ainda existe?",
    // Só detectável porque a base é cumulativa: 667 linhas de pedido somem
    // entre snapshots consecutivos, e 107 sem recebimento correspondente.
    teste: (c) =>
      c.pedidoSumiuSemReceber === undefined
        ? semDado()
        : c.pedidoSumiuSemReceber
          ? nao({ sumiu_sem_receber: true })
          : sim(),
    sim: "T1",
    nao: "pedido_cancelado",
  },

  // ---- percurso: fornecedor e triangulação --------------------------------
  {
    id: "T1",
    pergunta: "O pedido era triangulado?",
    // Vem antes da pergunta do prazo, e não depois. No desenho original a
    // ordem era inversa e produzia uma contradição: o "não" de triangulado
    // levava a "atraso do fornecedor", depois de já ter sido respondido que o
    // fornecedor entregou dentro da média.
    teste: (c) =>
      c.triangulado === undefined
        ? semDado()
        : c.triangulado
          ? sim()
          : nao(),
    sim: "T2",
    nao: "F1",
  },
  {
    id: "T2",
    pergunta: "O trecho do fornecedor, pedido até NF, estourou o prazo?",
    // As três datas de `recebimento` separam os trechos. Conferido contra a
    // coluna `lead_time` da própria tabela, que bate com `data - data_pedido`
    // em 100% das 20.231 linhas: `data_pedido` é a colocação, `data_emissao` a
    // NF do fornecedor, `data` a entrada no CD.
    teste: (c) => {
      const entregas = c.entregas ?? [];
      if (entregas.length === 0) return semDado();
      const atrasadas = entregas.filter((e) => {
        const trecho =
          (Date.parse(`${e.chegouEm}T00:00:00Z`) -
            Date.parse(`${e.pedidoEm}T00:00:00Z`)) /
          86_400_000;
        return trecho > (c.prazo?.cadastrado ?? c.leadTime) + LIMITES.diasTolerenciaPedido;
      });
      const ev = { entregas: entregas.length, atrasadas: atrasadas.length };
      return atrasadas.length > 0 ? sim(ev) : nao(ev);
    },
    sim: "F2",
    nao: "T3",
  },
  {
    id: "T3",
    pergunta: "O trecho entre CDs estourou o SLA de transferência?",
    teste: (c) =>
      c.slaInternoEstourado === undefined || c.slaInternoEstourado === null
        ? semDado()
        : c.slaInternoEstourado
          ? sim()
          : nao(),
    sim: "triangulacao_lenta",
    nao: "T4",
  },
  {
    id: "T4",
    pergunta: "A mercadoria parou no hub?",
    teste: (c) =>
      c.paradaNoHub === undefined || c.paradaNoHub === null
        ? semDado()
        : c.paradaNoHub
          ? sim()
          : nao(),
    sim: "parada_hub",
    nao: "V1",
  },
  {
    id: "F1",
    pergunta: "O fornecedor entregou além do prazo cadastrado?",
    teste: (c) => {
      const entregas = c.entregas ?? [];
      const cadastrado = c.prazo?.cadastrado;
      if (entregas.length === 0 || !cadastrado) return semDado();
      const atrasadas = entregas.filter(
        (e) => e.leadReal > cadastrado + LIMITES.diasTolerenciaPedido,
      );
      const ev = {
        prazo_cadastrado: cadastrado,
        entregas: entregas.length,
        atrasadas: atrasadas.length,
      };
      return atrasadas.length > 0 ? sim(ev) : nao(ev);
    },
    sim: "F2",
    nao: "F3",
  },
  {
    id: "F2",
    pergunta: "O estouro é recorrente neste par fornecedor × CD?",
    // A distinção que mais importa deste ramo. Atraso isolado é do fornecedor;
    // prazo que estoura na maioria das entregas é cadastro errado, e o cadastro
    // alimenta toda data limite de compra do sistema. Medido: 56% dos 228 pares
    // têm o cadastrado abaixo da mediana real.
    teste: (c) => {
      const p = c.prazo;
      if (!p?.cadastrado || p.realMediano === null) return semDado();
      const ev = {
        cadastrado: p.cadastrado,
        real_mediano: p.realMediano,
        entregas: p.entregas,
      };
      return p.realMediano > p.cadastrado && p.entregas >= 6 ? sim(ev) : nao(ev);
    },
    sim: "lead_time_cadastro",
    nao: "fornecedor_atrasou",
  },
  {
    id: "F3",
    pergunta: "O fornecedor entregou a quantidade inteira?",
    teste: (c) => {
      const p = c.pedido;
      const entregas = c.entregas ?? [];
      if (!p || entregas.length === 0) return semDado();
      const recebido = entregas.reduce((a, e) => a + e.quantidade, 0);
      const ev = { pedido: p.quantidade, recebido };
      return recebido >= p.quantidade ? sim(ev) : nao(ev);
    },
    sim: "V1",
    nao: "entrega_parcial",
  },

  // ---- demanda do mês e resíduo -------------------------------------------
  {
    id: "V1",
    pergunta: "A venda do mês superou o forecast?",
    teste: (c) => {
      const v = vendaContraForecast(c);
      if (v.indice === null) return semDado();
      const ev = { vendido: v.vendido, previsto: v.previsto, indice: v.indice };
      return v.indice > 1 + LIMITES.aceleracaoVenda ? sim(ev) : nao(ev);
    },
    sim: "venda_acima_forecast",
    nao: "V1a",
  },
  {
    id: "V1a",
    pergunta: "Outro CD tinha sobra acima do Alvo?",
    // Aqui, e não antes. O balanceamento é **modificador** em toda a árvore —
    // uma ruptura provocada por pedido tardio continua sendo pedido tardio
    // ainda que uma transferência a tivesse salvo, e por isso ele não compete
    // com as outras causas. Mas neste ponto do percurso não há mais com o que
    // competir: o plano existia e cobria, o pedido saiu no prazo e completo, o
    // fornecedor cumpriu, e a venda ficou dentro do previsto. Se a rede tinha
    // o estoque e ele não se moveu, a distribuição **é** a causa.
    teste: (c) =>
      c.podiaTransferirENaoTransferiu === undefined
        ? semDado()
        : c.podiaTransferirENaoTransferiu
          ? sim({ excedente_outros_cds: c.excedenteOutrosCds })
          : nao({ excedente_outros_cds: c.excedenteOutrosCds }),
    sim: "transferencia_nao_feita",
    nao: "V2",
  },
  {
    id: "V2",
    pergunta: "Houve saída que não foi venda nem transferência?",
    teste: (c) =>
      c.saidaNaoUsual === undefined || c.saidaNaoUsual === null
        ? semDado()
        : c.saidaNaoUsual
          ? sim()
          : nao(),
    sim: "saida_nao_usual",
    nao: "indefinida",
  },
];

const POR_ID = new Map(ARVORE.map((n) => [n.id, n]));

/** Onde a árvore começa. Mudar aqui muda a raiz, e o teste confere com o desenho. */
export const RAIZ = "D0";

/**
 * Causas que o modificador do balanceamento não alcança.
 *
 * Na primeira não há o que cobrar de ninguém; na segunda não houve tempo
 * material para reagir, e cobrar transferência de quem soube ontem seria
 * cobrar o impossível.
 */
const SEM_MODIFICADOR = new Set(["base_inconsistente", "nova_abertura"]);

/**
 * Percorre a árvore e devolve a causa, o caminho e as provas.
 *
 * **Nó sem dado pára o percurso e devolve "indefinida".** A trilha guarda qual
 * pergunta ficou sem resposta, então nada se perde — e a alternativa, seguir
 * pelo "não", acusa a partir de ausência de dado. Medido: a carga de
 * `plano_compra` de agosto perdeu os códigos num reimport de Produtos, A2 ficou
 * sem resposta em 196 dos 458 eventos, e a versão anterior desta função
 * devolvia "sem plano no mês anterior" em 44,5% dos casos — uma acusação a
 * Planejamento construída sobre um dado que não existe.
 *
 * Ausência de fato é diferente de ausência de dado, e quem decide é o nó: B3
 * responde "não" quando nenhum pedido foi emitido, porque a base em aberto
 * cobre o mês inteiro e o silêncio ali é informação.
 */
export function classificar(c: ContextoArvore): Classificacao {
  const trilha: Passo[] = [];
  let incompleta = false;
  let atual = RAIZ;

  // Teto de segurança: a árvore é acíclica e o teste garante isso, mas um
  // laço infinito em produção seria pior que uma exceção.
  for (let passos = 0; passos <= ARVORE.length; passos++) {
    const no = POR_ID.get(atual);
    if (!no) break; // chegou numa causa

    const { resposta, evidencia } = no.teste(c);
    trilha.push({ no: no.id, pergunta: no.pergunta, resposta, evidencia });
    if (resposta === null) {
      incompleta = true;
      atual = "indefinida";
      break;
    }

    atual = resposta === true ? no.sim : no.nao;
  }

  if (POR_ID.has(atual)) {
    throw new Error(`classificar: a árvore não terminou numa causa (parou em ${atual})`);
  }

  const cat = causaPorSlug(atual);
  return {
    causa: atual,
    rotulo: cat?.rotulo ?? atual,
    dono: cat?.dono ?? "—",
    trilha,
    incompleta,
    balanceamentoNaoRealizado:
      !SEM_MODIFICADOR.has(atual) && c.podiaTransferirENaoTransferiu === true,
  };
}

/** Os slugs que a árvore pode devolver, para validação e para a tela. */
export function causasAlcancaveis(): string[] {
  const ids = new Set(ARVORE.map((n) => n.id));
  const causas = new Set<string>();
  for (const n of ARVORE) {
    for (const destino of [n.sim, n.nao]) {
      if (!ids.has(destino)) causas.add(destino);
    }
  }
  return [...causas].sort();
}
