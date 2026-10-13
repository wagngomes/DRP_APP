/**
 * A série de uma posição: tipos e as contas puras do gráfico.
 *
 * Sem banco de propósito. O gráfico é um componente de cliente e importa daqui
 * — se o carregamento morasse neste arquivo, o `@/lib/prisma` entraria no
 * bundle do navegador. O projeto tem um teste que varre essa fronteira, e foi
 * ele que apontou o problema; a separação segue a convenção já usada em
 * `data-referencia.ts` e `data-referencia.server.ts`.
 *
 * **A janela é sempre mês anterior fechado + mês corrente.** O mês é a unidade
 * em que esta operação pensa: o forecast é mensal, o plano de compra é mensal,
 * e a abertura do mês é o eixo que mais explica ruptura nesta base.
 *
 * **O futuro é projetado, não medido.** Do dia de referência em diante o
 * estoque é simulado: consome o forecast diário, soma as entradas previstas e
 * não desce de zero.
 */

/** Anda no calendário a partir de uma data ISO. Negativo recua. */
export function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Um dia da janela. */
export type PontoSerie = {
  data: string;
  /** Estoque disponível para venda. `null` em dia sem carga do simulador. */
  estoque: number | null;
  /** Estoque simulado, do dia de referência em diante. */
  projetado: number | null;
  /** Venda realizada no dia, pela nota. */
  venda: number;
};

/** Uma entrada, realizada ou prevista. */
export type ChegadaSerie = {
  data: string;
  quantidade: number;
  tipo: "compra" | "transferencia";
  /** Ainda não aconteceu: é previsão, não fato. */
  prevista: boolean;
  /** De onde vem a data, para o tooltip poder dizer. */
  origem?: string;
  /** Quantas notas ou pedidos a entrada reúne. */
  notas?: number;
  /**
   * A data prometida, quando ela já passou e a entrada foi trazida para o dia
   * de referência.
   *
   * Não é detalhe: medido na base, **19 de 21 entradas previstas das 25 maiores
   * rupturas estão vencidas**. Desenhá-las como "vai chegar" sem dizer que já
   * era para ter chegado seria a leitura mais errada possível — e foi o que a
   * primeira versão fez, empilhando todas em cima da linha de hoje sem
   * distinção nenhuma.
   */
  prometidaPara?: string;
};

/** Quando um pedido foi emitido, para a régua abaixo do gráfico. */
export type MarcoPedido = {
  data: string;
  rotulo: string;
  quantidade: number;
};

/** Forecast contra venda, por mês da janela. */
export type MesDaSerie = {
  mes: string;
  /** Previsto proporcional aos dias já decorridos. */
  previsto: number;
  real: number;
  /**
   * Forecast cheio do mês. É o número que o rótulo da linha mostra no último
   * dia, e é o que a pessoa reconhece como "o forecast do item".
   */
  forecastDoMes: number;
  /**
   * Forecast dividido pelos dias **reais** do mês — a régua da linha de ritmo.
   *
   * Aqui não vale o `forecast / 30` que o resto do sistema usa para dias de
   * estoque: aquela régua responde "quantos dias este estoque cobre", e trinta
   * é a convenção que todas as telas compartilham. Esta responde outra coisa —
   * "a venda vai consumir o forecast até o fim do mês?" —, e a linha precisa
   * pousar exatamente no forecast no dia 31. Com /30 ela terminaria 3,3% acima
   * num mês de 31 dias, e o rótulo mostraria um número que não é o forecast.
   */
  consumoDiario: number;
  diasDoMes: number;
  /** O mês ainda não fechou. */
  corrente: boolean;
};

export type SerieItem = {
  de: string;
  ate: string;
  /** Data de referência do sistema: a fronteira entre medido e projetado. */
  referencia: string;
  pontos: PontoSerie[];
  chegadas: ChegadaSerie[];
  marcos: MarcoPedido[];
  meses: MesDaSerie[];
  /** Estoque mínimo que a política pede, em unidades. */
  politicaUnidades: number;
  politicaDias: number;
  consumoDiario: number;
  forecastMensal: number;
  /**
   * O forecast do mês corrente ainda não foi importado, e o ritmo projetado é
   * o do mês anterior.
   *
   * Acontece todo começo de mês — a primeira carga de forecast de setembro foi
   * no dia 4. Sem a queda, a projeção ficaria parada numa reta horizontal,
   * dizendo que o item não consome nada; com ela, e sem avisar, a tela
   * afirmaria uma previsão que ninguém fez.
   */
  forecastHerdado: boolean;
};

/**
 * Simula o estoque do dia de referência até o fim do mês.
 *
 * Parte do último estoque medido, consome o forecast diário e soma as entradas
 * previstas. Não desce de zero: o replay do motor usa a mesma regra, porque
 * prateleira vazia não acumula dívida — o que não se vendeu por falta de
 * estoque não vira venda represada quando a mercadoria chega.
 *
 * Função pura, para a conta ficar testável sem banco. Altera `pontos` no lugar
 * porque o chamador acabou de montá-los e ninguém mais os viu.
 */
export function projetarEstoque(
  pontos: PontoSerie[],
  referencia: string,
  consumoDiario: number,
  previstas: ChegadaSerie[],
): void {
  const medidos = pontos.filter(
    (p) => p.data <= referencia && p.estoque !== null,
  );
  const ultimo = medidos.at(-1);
  if (!ultimo) return;

  const entraEm = new Map<string, number>();
  for (const c of previstas) {
    entraEm.set(c.data, (entraEm.get(c.data) ?? 0) + c.quantidade);
  }

  // A projeção começa no último dia medido, e não no seguinte: sem esse ponto
  // em comum a linha tracejada nasce solta no ar, a um dia de distância da
  // curva cheia.
  let saldo = ultimo.estoque ?? 0;
  for (const p of pontos) {
    if (p.data < ultimo.data) continue;
    if (p.data === ultimo.data) {
      p.projetado = saldo;
      continue;
    }
    saldo = Math.max(0, saldo + (entraEm.get(p.data) ?? 0) - consumoDiario);
    p.projetado = saldo;
  }
}

/**
 * As faixas em que a prateleira ficou vazia, com o estado carregado através
 * dos buracos de carga.
 *
 * Dia sem carga herda o estado do dia anterior — a mesma regra do
 * `rompidaPorDia` do motor, e por isso o gráfico conta os mesmos dias que a
 * tabela. Sem ela, um item zerado no dia 4 e zerado no dia 8, com três dias sem
 * importação no meio, aparecia como **duas** rupturas de quatro dias: afirmava
 * uma recuperação que ninguém observou e discordava do número de dias que o
 * próprio diagnóstico atribuiu.
 *
 * O carregamento vai até a **data de referência**, e não até a última carga: um
 * item zerado na última medição continua zerado hoje até que algo diga o
 * contrário, que é exatamente o que o motor assume ao contar os dias.
 *
 * Nada avança além dela. O futuro é projeção, e projeção zerada é alerta, não
 * ruptura consumada.
 */
export function faixasSemEstoque(
  pontos: PontoSerie[],
  referencia: string,
): { de: number; ate: number }[] {
  if (!pontos.some((p) => p.estoque !== null)) return [];

  const faixas: { de: number; ate: number }[] = [];
  let rompido = false;
  pontos.forEach((p, i) => {
    if (p.data > referencia) return;
    if (p.estoque !== null) rompido = p.estoque === 0;
    if (!rompido) return;
    const ultima = faixas.at(-1);
    if (ultima && i === ultima.ate + 1) ultima.ate = i;
    else faixas.push({ de: i, ate: i });
  });
  return faixas;
}

/**
 * Forecast contra venda, mês a mês.
 *
 * O previsto do mês corrente é proporcional aos dias **já decorridos**, e não
 * ao mês inteiro: comparar doze dias de venda com o forecast de trinta diria
 * que a venda desabou em todo item, todo mês.
 *
 * Cada mês usa o forecast que valia nele. Cobrar agosto pela previsão de
 * setembro seria comparar com uma régua que ninguém tinha na mão.
 */
export function mesesDaJanela(
  pontos: PontoSerie[],
  referencia: string,
  forecastCorrente: number,
  forecastAnterior: number,
): MesDaSerie[] {
  const mesCorrente = referencia.slice(0, 7);
  const porMes = new Map<string, { real: number; dias: number }>();

  for (const p of pontos) {
    // Dia futuro não entra no realizado nem no previsto proporcional: ainda
    // não aconteceu, e contá-lo afundaria o percentual de todo mês corrente.
    if (p.data > referencia) continue;
    const mes = p.data.slice(0, 7);
    const atual = porMes.get(mes) ?? { real: 0, dias: 0 };
    atual.real += p.venda;
    atual.dias += 1;
    porMes.set(mes, atual);
  }

  return [...porMes.entries()]
    .map(([mes, { real, dias }]) => {
      const corrente = mes === mesCorrente;
      const forecastDoMes = corrente ? forecastCorrente : forecastAnterior;
      const diasDoMes = diasNoMes(mes);
      const consumoDiario = diasDoMes > 0 ? forecastDoMes / diasDoMes : 0;
      return {
        mes,
        real,
        previsto: consumoDiario * dias,
        forecastDoMes,
        consumoDiario,
        diasDoMes,
        corrente,
      };
    })
    .sort((a, b) => a.mes.localeCompare(b.mes));
}

/** Quantos dias tem o mês "AAAA-MM". */
export function diasNoMes(mes: string): number {
  const [ano, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(ano, m, 0)).getUTCDate();
}
