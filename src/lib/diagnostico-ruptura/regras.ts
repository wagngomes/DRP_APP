/**
 * As regras: de sinal a causa, pela medição.
 *
 * Cada regra olha um sinal (a venda subiu, o mês abriu descoberto, não havia
 * plano) e monta um **cenário corrigido** — o dia a dia como teria sido se só
 * aquela etapa tivesse funcionado, com todo o resto mantido real. O replay
 * conta os dias de ruptura dos dois cenários, e a diferença é o que a causa
 * explica.
 *
 * O sinal sozinho nunca basta. Venda 20% acima do forecast não causa ruptura
 * se a compra foi suficiente e chegou a tempo — nesse caso o cenário corrigido
 * tem os mesmos dias de ruptura do real, a diferença é zero, e a regra vira
 * observação: aparece na tela como erro cometido, sem levar dia nenhum.
 *
 * Funções puras. Recebem os fatos já carregados e devolvem candidatas; quem
 * chama cuida de banco.
 */
import type { PosicaoAbertura, MesAnterior, AberturaForecast } from "./abertura";
import type { Entrega, PrazoFornecedor } from "./janela";
import type { Candidata } from "./contrafactual";
import type { Evento } from "./eventos";
import {
  consumoDoForecast,
  consumoLimitado,
  diasEvitados,
  type Cenario,
  type Chegada,
} from "./replay";
import { LIMITES } from "./parametros";

/** Tudo que uma posição precisa para ser diagnosticada. */
export type Contexto = {
  evento: Evento;
  /** Janela do replay: da foto de abertura até a data de referência. */
  de: string;
  ate: string;
  /** Vendas reais por dia. */
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
};

/** O cenário real, que todas as correções modificam em um ponto só. */
function cenarioReal(c: Contexto): Cenario {
  return {
    de: c.de,
    ate: c.ate,
    estoqueInicial: c.abertura?.disponivel ?? 0,
    consumo: c.vendas,
    chegadas: c.chegadas,
  };
}

/**
 * Venda acima do forecast.
 *
 * Correção: vendeu o previsto. Não "não vendeu o excesso" — dia que ficou
 * abaixo do previsto continua abaixo, porque a correção é do excesso e não uma
 * reescrita da demanda.
 */
function vendaAcimaForecast(c: Contexto): Candidata | null {
  const teto = consumoDoForecast(c.de, c.ate, c.forecastMensal);
  const real = [...c.vendas.values()].reduce((a, q) => a + q, 0);
  const previsto = [...teto.values()].reduce((a, q) => a + q, 0);
  if (previsto <= 0 || real <= previsto * (1 + LIMITES.aceleracaoVenda)) {
    return null;
  }

  return {
    slug: "venda_acima_forecast",
    diasEvitados: diasEvitados(cenarioReal(c), {
      ...cenarioReal(c),
      consumo: consumoLimitado(c.vendas, teto),
    }),
    evidencias: {
      valores: {
        vendido_na_janela: real,
        previsto_na_janela: previsto,
        indice: real / previsto,
      },
      registros: [{ tabela: "historico_vendas", chave: c.evento.codigo }],
    },
  };
}

/**
 * Venda do mês anterior acelerada.
 *
 * É a explicação mais profunda da abertura descoberta: o mês passado vendeu
 * além do previsto e levou embora o estoque que abriria este. A correção
 * devolve ao estoque inicial exatamente o excedente daquele mês.
 *
 * Quando as duas falham, Shapley divide — e por construção esta leva a parte
 * que o excedente explica, deixando o resto para a abertura.
 */
function vendaAceleradaMesAnterior(c: Contexto): Candidata | null {
  const m = c.mesAnterior;
  if (!m || m.indice === null) return null;
  if (m.indice <= 1 + LIMITES.aceleracaoVenda || m.excedente <= 0) return null;

  const real = cenarioReal(c);
  return {
    slug: "venda_acelerada_mes_anterior",
    diasEvitados: diasEvitados(real, {
      ...real,
      estoqueInicial: real.estoqueInicial + m.excedente,
    }),
    evidencias: {
      valores: {
        vendido_mes_anterior: m.vendido,
        forecast_mes_anterior: m.forecast,
        indice: m.indice,
        excedente: m.excedente,
      },
      registros: [{ tabela: "historico_vendas", chave: c.evento.codigo }],
    },
  };
}

/**
 * Mês começou descoberto.
 *
 * Correção: o estoque de abertura estava no nível que a política pede —
 * consumo diário × dias de política. É a definição que o negócio usa: a
 * política é quantos dias de estoque o item deve ter para abrir o mês.
 */
function aberturaDescoberta(c: Contexto): Candidata | null {
  const a = c.abertura;
  if (!a || !a.abaixoDaPolitica || a.consumoDiario <= 0) return null;

  const alvo = a.consumoDiario * a.politicaDias;
  const real = cenarioReal(c);
  return {
    slug: "abertura_descoberta",
    diasEvitados: diasEvitados(real, { ...real, estoqueInicial: alvo }),
    evidencias: {
      valores: {
        estoque_na_abertura: a.disponivel,
        politica_dias: a.politicaDias,
        estoque_que_a_politica_pede: alvo,
        cobertura_na_abertura: a.coberturaDias,
      },
      registros: [{ tabela: "simulador", chave: `${c.evento.codigo}|${c.evento.filial}` }],
    },
  };
}

/**
 * Forecast aberto sem tempo de comprar.
 *
 * A posição passou a ter previsão de venda há menos de um lead time. Não houve
 * prazo material para abastecer, e cobrar compra disso seria cobrar o
 * impossível.
 *
 * Correção: a previsão existia a tempo, então a reposição chegou quando a
 * demanda começou. Modelada como uma entrada do forecast mensal na data em que
 * o forecast abriu — é o que uma compra feita com antecedência teria posto lá.
 */
function novaAbertura(c: Contexto): Candidata | null {
  const a = c.aberturaForecast;
  if (!a) return null;

  const diasDesde =
    (Date.parse(`${c.evento.inicio}T00:00:00Z`) -
      Date.parse(`${a.data}T00:00:00Z`)) /
    86_400_000;
  if (diasDesde > c.leadTime) return null;

  const real = cenarioReal(c);
  return {
    slug: "nova_abertura",
    diasEvitados: diasEvitados(real, {
      ...real,
      chegadas: [
        ...real.chegadas,
        { data: a.data, quantidade: c.forecastMensal },
      ],
    }),
    evidencias: {
      valores: {
        forecast_aberto_em: a.data,
        linha_nova: a.linhaNova,
        dias_ate_a_ruptura: diasDesde,
        lead_time: c.leadTime,
      },
      registros: [{ tabela: "forecast", chave: `${c.evento.codigo}|${c.evento.filial}` }],
    },
  };
}

/**
 * Fora do plano, ou plano insuficiente.
 *
 * As duas são exclusivas e testadas nesta ordem: ou não havia plano, ou havia e
 * era pequeno. Somá-las contaria duas vezes a mesma falha de planejamento.
 *
 * Correção: o plano cobria a necessidade, e a compra correspondente chegou um
 * lead time depois da abertura do mês — que é o mais cedo que ela poderia ter
 * chegado se tivesse sido planejada na virada.
 */
function planoDeCompra(c: Contexto): Candidata | null {
  const p = c.planoDoMes;
  const necessidade = (c.forecastMensal / 30) * (c.leadTime + (c.abertura?.politicaDias ?? 0));
  if (necessidade <= 0) return null;

  const plano = p?.plano ?? 0;
  const semPlano = plano <= 0;
  const insuficiente =
    !semPlano && plano < necessidade * (1 - LIMITES.planoInsuficiente);
  if (!semPlano && !insuficiente) return null;

  const chegada = somarDias(c.de, c.leadTime);
  const real = cenarioReal(c);
  return {
    slug: semPlano ? "fora_do_plano" : "plano_insuficiente",
    diasEvitados: diasEvitados(real, {
      ...real,
      chegadas: [...real.chegadas, { data: chegada, quantidade: necessidade - plano }],
    }),
    evidencias: {
      valores: {
        plano_do_mes: plano,
        necessidade: necessidade,
        lead_time: c.leadTime,
        chegaria_em: chegada,
      },
      registros: [{ tabela: "plano_compra", chave: c.evento.codigo }],
    },
  };
}

/**
 * Transferência não feita.
 *
 * Outro CD tinha estoque de sobra e nada saiu. Correção: a transferência foi
 * emitida a tempo e chegou no dia em que a ruptura começou.
 *
 * O limite de "sobra" não é escolhido aqui: vem do Alvo do Painel, o mesmo
 * parâmetro que a tela de sugestão de transferência usa. Duas réguas para a
 * mesma pergunta acabariam dizendo que cabia transferência onde a outra tela
 * nunca sugeriu.
 */
function transferenciaNaoFeita(c: Contexto): Candidata | null {
  if (c.excedenteOutrosCds <= 0) return null;

  const necessidade = (c.forecastMensal / 30) * c.leadTime;
  const quantidade = Math.min(necessidade, c.excedenteOutrosCds);
  if (quantidade <= 0) return null;

  const real = cenarioReal(c);
  return {
    slug: "transferencia_nao_feita",
    diasEvitados: diasEvitados(real, {
      ...real,
      chegadas: [...real.chegadas, { data: c.evento.inicio, quantidade }],
    }),
    evidencias: {
      valores: {
        excedente_em_outros_cds: c.excedenteOutrosCds,
        transferiria: quantidade,
        chegaria_em: c.evento.inicio,
      },
      registros: [{ tabela: "simulador", chave: c.evento.codigo }],
    },
  };
}

/**
 * Lead time estourado: o pedido saiu, e chegou depois do combinado.
 *
 * Correção: a entrega chegou no prazo — `data_pedido + prazo cadastrado`. Tudo
 * o mais permanece real, inclusive a quantidade: a pergunta é sobre o atraso,
 * não sobre o tamanho do pedido.
 *
 * **O dono depende da recorrência, e a diferença não é detalhe.** Um atraso
 * isolado é do fornecedor. Um prazo que estoura sempre não é atraso: é
 * cadastro errado, e a cobrança vai para quem mantém o cadastro — porque todo
 * cálculo de data limite de compra do sistema usa esse número. Medido na base,
 * 56% dos pares fornecedor × CD têm o cadastro abaixo da mediana real, com
 * casos de 4 dias cadastrados contra 35 cumpridos em 23 entregas.
 *
 * A régua da recorrência é a mediana real contra o cadastrado: se **a metade
 * das entregas** já estoura o prazo, o prazo é que está errado.
 */
function leadTimeEstourou(c: Contexto): Candidata | null {
  const entregas = c.entregas ?? [];
  const cadastrado = c.prazo?.cadastrado;
  if (!cadastrado || cadastrado <= 0 || entregas.length === 0) return null;

  // Só as entregas que de fato estouraram, e por mais que a tolerância.
  const atrasadas = entregas.filter(
    (e) => e.leadReal > cadastrado + LIMITES.diasTolerenciaPedido,
  );
  if (atrasadas.length === 0) return null;

  const real = cenarioReal(c);
  // Cada entrega atrasada volta para a data em que deveria ter chegado.
  const noPrazo = real.chegadas.filter(
    (ch) => !atrasadas.some((a) => a.chegouEm === ch.data && a.quantidade === ch.quantidade),
  );
  for (const a of atrasadas) {
    noPrazo.push({
      data: somarDias(a.pedidoEm, cadastrado),
      quantidade: a.quantidade,
    });
  }

  const recorrente =
    (c.prazo?.realMediano ?? 0) > cadastrado && (c.prazo?.entregas ?? 0) >= 6;

  return {
    slug: recorrente ? "lead_time_cadastro" : "fornecedor_atrasou",
    diasEvitados: diasEvitados(real, { ...real, chegadas: noPrazo }),
    evidencias: {
      valores: {
        prazo_cadastrado: cadastrado,
        prazo_real_mediano: c.prazo?.realMediano,
        entregas_que_sustentam: c.prazo?.entregas,
        recorrente,
      },
      registros: atrasadas.map((a) => ({
        tabela: "recebimento",
        chave: a.pedido ?? `${c.evento.codigo}|${a.chegouEm}`,
        pedido_em: a.pedidoEm,
        chegou_em: a.chegouEm,
        prazo_real: a.leadReal,
        atraso: a.leadReal - cadastrado,
      })),
    },
  };
}

function somarDias(iso: string, dias: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + dias * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Roda todas as regras e devolve as candidatas.
 *
 * A ordem aqui é a da cadeia, e não muda o resultado — Shapley é simétrico.
 * Ela existe para a leitura do código acompanhar a leitura da tela.
 */
export function candidatas(c: Contexto): Candidata[] {
  const regras = [
    vendaAceleradaMesAnterior,
    aberturaDescoberta,
    novaAbertura,
    vendaAcimaForecast,
    planoDeCompra,
    leadTimeEstourou,
    transferenciaNaoFeita,
  ];

  return regras
    .map((r) => r(c))
    .filter((x): x is Candidata => x !== null);
}
