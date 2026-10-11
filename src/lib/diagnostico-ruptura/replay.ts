/**
 * O balanço dia a dia de uma posição, e o contrafactual que o usa.
 *
 * **Por que existe.** Uma regra ter falhado não torna ela a causa da ruptura.
 * A venda pode ter subido 20% acima do forecast e a ruptura não ter nada a ver
 * com isso — se a compra foi suficiente e chegou no prazo, limitar a venda ao
 * previsto não teria evitado um único dia sem estoque. O contrário também
 * vale: uma compra pequena só causa ruptura se a demanda a tiver consumido.
 *
 * Por isso a causa não é decidida por casamento de regra. É **medida**: refaz
 * o dia a dia trocando só aquela etapa pelo que deveria ter sido, mantendo
 * todo o resto real, e conta quantos dias de ruptura somem. Zero dias a menos,
 * zero crédito — a regra vira observação na tela, sem dias.
 *
 * Tudo aqui é função pura: entra estoque inicial, chegadas e consumo, sai o
 * número de dias sem estoque. Nenhum acesso a banco, o que torna cada cenário
 * testável contra um caso montado à mão.
 */

/** Uma entrada de mercadoria no dia em que ela ficou disponível. */
export type Chegada = { data: string; quantidade: number };

export type Cenario = {
  /** Primeiro dia da janela, inclusive. */
  de: string;
  /** Último dia da janela, inclusive. */
  ate: string;
  estoqueInicial: number;
  /** Consumo por dia (ISO -> unidades). Dia ausente consome zero. */
  consumo: Map<string, number>;
  chegadas: Chegada[];
};

const DIA = 86_400_000;

/** Os dias da janela, em ISO, inclusive nas duas pontas. */
export function diasDaJanela(de: string, ate: string): string[] {
  const fim = Date.parse(`${ate}T00:00:00Z`);
  const dias: string[] = [];
  for (let t = Date.parse(`${de}T00:00:00Z`); t <= fim; t += DIA) {
    dias.push(new Date(t).toISOString().slice(0, 10));
  }
  return dias;
}

/**
 * Quantos dias a posição passa sem estoque.
 *
 * A ordem dentro do dia é chegada antes de consumo: mercadoria que entrou pela
 * manhã atende a venda da tarde. A ordem inversa criaria um dia de ruptura
 * fantasma toda vez que a reposição chegasse no limite — e é justamente no
 * limite que ela costuma chegar.
 *
 * O estoque não fica negativo entre os dias: o que não havia não foi vendido.
 * Deixar a dívida acumular faria o estoque levar dias para "voltar ao zero"
 * depois de uma reposição, inventando ruptura onde a prateleira já tinha
 * produto.
 */
export function diasEmRuptura(cenario: Cenario): number {
  const porData = new Map<string, number>();
  for (const c of cenario.chegadas) {
    if (c.data < cenario.de || c.data > cenario.ate) continue;
    porData.set(c.data, (porData.get(c.data) ?? 0) + c.quantidade);
  }

  let estoque = cenario.estoqueInicial;
  let dias = 0;

  for (const d of diasDaJanela(cenario.de, cenario.ate)) {
    estoque += porData.get(d) ?? 0;
    estoque -= cenario.consumo.get(d) ?? 0;
    if (estoque <= 0) {
      dias += 1;
      estoque = 0;
    }
  }

  return dias;
}

/**
 * Quantos dias de ruptura o conserto de uma etapa teria evitado.
 *
 * Nunca negativo: se o cenário "corrigido" piora a situação, a correção não é
 * uma explicação da ruptura, e um número negativo só poluiria a divisão.
 */
export function diasEvitados(real: Cenario, corrigido: Cenario): number {
  return Math.max(0, diasEmRuptura(real) - diasEmRuptura(corrigido));
}

/**
 * O consumo que o forecast previa, espalhado pelos dias da janela.
 *
 * Usado como teto no cenário de venda acelerada: "e se tivesse vendido o
 * previsto?". Por dia corrido e não por dia útil, pela mesma razão que o resto
 * do sistema divide o forecast mensal por 30 — é a régua que todas as telas
 * usam, e trocá-la só aqui faria o diagnóstico discordar delas.
 */
export function consumoDoForecast(
  de: string,
  ate: string,
  forecastMensal: number,
): Map<string, number> {
  const porDia = forecastMensal / 30;
  return new Map(diasDaJanela(de, ate).map((d) => [d, porDia]));
}

/**
 * O consumo real, limitado ao que o forecast previa.
 *
 * O cenário da venda acelerada não é "não vendeu nada a mais" — é "vendeu o
 * que estava previsto". Dia que vendeu abaixo do previsto continua abaixo: a
 * correção é do excesso, não uma reescrita da demanda.
 */
export function consumoLimitado(
  real: Map<string, number>,
  teto: Map<string, number>,
): Map<string, number> {
  const limitado = new Map<string, number>();
  for (const [d, q] of real) {
    limitado.set(d, Math.min(q, teto.get(d) ?? q));
  }
  return limitado;
}
