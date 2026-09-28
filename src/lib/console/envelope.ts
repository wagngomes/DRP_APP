/**
 * Aplica o teto de linhas no banco, e não na memória da aplicação.
 *
 * Cortar com `slice` depois de receber tudo não protege nada: `SELECT * FROM
 * historico_vendas` traz 561.848 linhas para o heap do Node antes de a primeira
 * ser descartada, e é esse mesmo padrão que já derrubou este processo por falta
 * de heap durante uma importação. Envolvendo a consulta numa subconsulta com
 * LIMIT, o Postgres para de produzir linhas no teto e a aplicação nunca as vê.
 *
 * Pede-se uma linha a mais que o teto: é assim que se sabe que havia mais sem
 * precisar contar o total.
 *
 * O envelope só serve a consultas que podem virar subconsulta. `EXPLAIN`,
 * `SHOW` e afins não podem, e por isso são reconhecidos e executados crus, com
 * o corte em memória — são consultas de poucas linhas, onde isso não custa.
 *
 * A heurística de texto aqui é aceitável porque **não é a barreira de
 * segurança**: essa continua sendo a transação somente-leitura, que não lê texto
 * nenhum. Se a heurística errar, o pior caso é o corte acontecer em memória,
 * como antes — nunca uma escrita passar.
 */

/** Comentários de linha, de bloco e espaços no início, que escondem a palavra-chave. */
const PREFIXO_IGNORAVEL = /^(?:--[^\n]*\n|\/\*[\s\S]*?\*\/|\s)+/;

const ENVELOPAVEIS = ["select", "with", "table"];

export function envelopar(
  sql: string,
  limite: number,
): { sql: string; envelopado: boolean } {
  const limpo = sql.trim().replace(/;\s*$/, "");
  const comeco = limpo.replace(PREFIXO_IGNORAVEL, "").toLowerCase();

  if (!ENVELOPAVEIS.some((p) => comeco.startsWith(p))) {
    return { sql: limpo, envelopado: false };
  }

  return {
    sql: `SELECT * FROM (${limpo}) AS _console LIMIT ${limite + 1}`,
    envelopado: true,
  };
}
