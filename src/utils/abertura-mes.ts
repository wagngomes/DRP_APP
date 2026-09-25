/**
 * O marco de abertura de um mês: qual carga do simulador vale como a foto do
 * saldo com que o mês começou.
 *
 * Existe porque a base é cumulativa e não há garantia de carga no dia 1º. Em
 * agosto de 2026, por exemplo, a primeira carga é do dia 6 — e a foto que de
 * fato representa a abertura pode até ser a última de julho, que é a posição
 * imediatamente anterior à virada. Por isso o marco é uma escolha explícita,
 * não uma dedução: o mês da carga não determina de que mês ela é a abertura.
 *
 * Sem marca, vale o primeiro snapshot dentro do próprio mês. É palpite razoável
 * e faz a tela funcionar sem ninguém configurar nada — mas a tela diz qual data
 * usou e se ela veio de marca ou de palpite, porque uma carga quebrada feita
 * cedo viraria a abertura em silêncio. Já encontramos dezessete dessas na base.
 */

/** Prefixo das chaves em `configuracao_sistema`. */
export const PREFIXO_ABERTURA = "abertura:simulador:";

/** Mês no formato `aaaa-mm`. */
export function chaveAbertura(mes: string): string {
  return `${PREFIXO_ABERTURA}${mes.slice(0, 7)}`;
}

/** Extrai o mês de uma chave de abertura; `null` se não for uma. */
export function mesDaChave(chave: string): string | null {
  if (!chave.startsWith(PREFIXO_ABERTURA)) return null;
  const mes = chave.slice(PREFIXO_ABERTURA.length);
  return /^\d{4}-\d{2}$/.test(mes) ? mes : null;
}

export type Abertura = {
  /** Data ISO do snapshot que vale como abertura; `null` quando não há nenhum. */
  data: string | null;
  /** Como a data foi obtida — a tela precisa distinguir escolha de palpite. */
  origem: "marcada" | "primeira-do-mes" | "ausente";
};

/**
 * Resolve a abertura de um mês.
 *
 * `marcas` são as configurações já lidas (chave completa -> data ISO), e
 * `snapshots` as datas disponíveis na tabela, em qualquer ordem.
 */
export function resolverAbertura(
  mes: string,
  marcas: Map<string, string>,
  snapshots: string[]
): Abertura {
  const marcada = marcas.get(chaveAbertura(mes));
  // A marca vale mesmo que a carga tenha sumido da tabela? Não: apontar para
  // uma data que não existe mais devolveria uma tela vazia sem explicação.
  if (marcada && snapshots.includes(marcada)) {
    return { data: marcada, origem: "marcada" };
  }

  const prefixo = mes.slice(0, 7);
  const doMes = snapshots.filter((d) => d.startsWith(prefixo)).sort();
  if (doMes.length > 0) return { data: doMes[0], origem: "primeira-do-mes" };

  return { data: null, origem: "ausente" };
}

/**
 * Meses que uma carga pode abrir: o dela e o seguinte.
 *
 * A última carga de julho costuma ser a melhor foto da abertura de agosto — é a
 * posição imediatamente anterior à virada. Ir além disso não faz sentido: uma
 * carga de julho não descreve como setembro começou.
 */
export function mesesQuePodeAbrir(dataSnapshot: string): string[] {
  const [ano, mes] = dataSnapshot.slice(0, 7).split("-").map(Number);
  const proximo = new Date(Date.UTC(ano, mes, 1));
  return [
    dataSnapshot.slice(0, 7),
    `${proximo.getUTCFullYear()}-${String(proximo.getUTCMonth() + 1).padStart(2, "0")}`,
  ];
}
