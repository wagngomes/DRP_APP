import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { envelopar } from "./envelope";

/**
 * Executa SQL arbitrário sem deixar que ele escreva.
 *
 * A trava é do Postgres, não daqui. O reflexo comum seria filtrar a string —
 * recusar `DROP`, `DELETE`, `UPDATE` — e isso não funciona: comentário, CTE,
 * `DO $$`, função que escreve por dentro, cada um é um jeito de escapar do
 * filtro. Uma lista de palavras proibidas dá a sensação de proteção sem a
 * proteção.
 *
 * `SET TRANSACTION READ ONLY` transfere a decisão para o motor. Testado contra
 * o banco real: UPDATE, DELETE, DROP, TRUNCATE e CREATE voltam todos com
 * `25006` (read_only_sql_transaction), inclusive quando escondidos atrás de um
 * SELECT na mesma linha. Não há string a escapar porque não há string sendo
 * lida.
 *
 * `statement_timeout` cobre o outro risco, que não é de escrita: a máquina tem
 * dois núcleos, e uma consulta mal escrita sobre as 512 mil linhas do histórico
 * prenderia os dois. Dez segundos e o Postgres cancela sozinho (`57014`).
 *
 * O teto de linhas cobre o terceiro: o heap do Node. `SELECT * FROM
 * historico_vendas` são 512 mil linhas viajando para a memória da aplicação, e
 * a importação já matou este processo por falta de heap uma vez.
 *
 * A quarta trava é o papel. `SET LOCAL ROLE console_leitura` tira do alcance as
 * três tabelas que guardam credencial — `session`, `account` e `verification` —
 * e o bloqueio é do motor (`42501`), não de uma lista de nomes proibidos, que
 * teria o mesmo buraco da lista de palavras. `user` fica legível de propósito:
 * nome, e-mail e papel são informação administrativa e não servem para se
 * passar por ninguém.
 *
 * Por que o papel e não um simples REVOKE: o usuário da aplicação é dono das
 * tabelas, e dono passa por cima de REVOKE. Assumir outro papel dentro da
 * transação é o que faz a restrição valer.
 *
 * Se o papel não existir — banco onde a migração não rodou —, o `SET LOCAL
 * ROLE` lança e a consulta inteira falha. É o comportamento desejado: o console
 * para de funcionar, em vez de voltar silenciosamente a enxergar tudo.
 */

/** Linhas devolvidas à tela. Acima disso, o resto é cortado e avisado. */
export const LIMITE_TELA = 1_000;

/** Linhas devolvidas na exportação. Mais generoso, e ainda assim um teto. */
export const LIMITE_EXPORTACAO = 20_000;

const TIMEOUT_CONSULTA_MS = 10_000;

/**
 * Papel que o console assume. Criado pela migração `papel_console_leitura`.
 *
 * Constante, nunca vinda de entrada: é um identificador SQL, e identificador
 * não se parametriza.
 */
const PAPEL_CONSOLE = "console_leitura";

export type ResultadoConsulta = {
  colunas: string[];
  linhas: Record<string, string | number | boolean | null>[];
  /** Linhas devolvidas. Igual ao teto quando `truncado`. */
  total: number;
  /** Verdadeiro quando o teto cortou o resultado. */
  truncado: boolean;
  duracaoMs: number;
};

/**
 * Converte o que o driver devolve em algo que o JSON aceita.
 *
 * `count(*)` volta como BigInt, que `JSON.stringify` recusa com um TypeError
 * seco; `numeric` volta como Decimal; datas voltam como Date e precisam de
 * forma estável. Sem isto a tela quebra na primeira consulta com contagem, que
 * é justamente a primeira consulta que qualquer um escreve.
 */
function normalizar(valor: unknown): string | number | boolean | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "bigint") return Number(valor);
  if (valor instanceof Date) return valor.toISOString();
  if (valor instanceof Prisma.Decimal) return valor.toNumber();
  if (Buffer.isBuffer(valor)) return `0x${valor.toString("hex")}`;
  if (typeof valor === "object") return JSON.stringify(valor);
  if (typeof valor === "number" || typeof valor === "boolean") return valor;
  return String(valor);
}

export async function executarConsulta(
  sql: string,
  limite = LIMITE_TELA,
): Promise<ResultadoConsulta> {
  const inicio = Date.now();
  const envelope = envelopar(sql, limite);

  const brutas = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      // Papel restrito: tira do alcance as tabelas que guardam credencial.
      //
      // Somente-leitura impede escrita, não leitura — e `SELECT token FROM
      // session` devolvia token de sessão ativo, que é login imediato para quem
      // o copiar. Sem isto, comprometer uma conta de administrador comprometia
      // todas as outras.
      //
      // `SET LOCAL` vale só nesta transação: fora daqui a aplicação continua
      // lendo essas tabelas normalmente, que é como a autenticação funciona.
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${PAPEL_CONSOLE}`);
      await tx.$executeRawUnsafe(
        `SET LOCAL statement_timeout = '${TIMEOUT_CONSULTA_MS}ms'`,
      );
      return tx.$queryRawUnsafe<Record<string, unknown>[]>(envelope.sql);
    },
    // A transação precisa durar mais que o `statement_timeout`, senão o Prisma
    // a encerra antes e o erro que chega à tela é o dele, não o do Postgres —
    // e "Transaction already closed" não diz a quem lê que a consulta demorou.
    { timeout: TIMEOUT_CONSULTA_MS + 5_000, maxWait: 5_000 },
  );

  // Envelopado, `total` é o que coube no teto — o número real fica desconhecido
  // de propósito, porque contá-lo exigiria varrer a tabela inteira, que é
  // justamente o que o teto existe para evitar.
  const truncado = brutas.length > limite;
  const cortadas = brutas.slice(0, limite);
  const total = truncado ? limite : brutas.length;

  // As colunas saem da primeira linha porque o driver devolve objetos, não
  // metadados. Consulta sem resultado não tem colunas a mostrar — e mostrar
  // "0 linhas" já é a resposta.
  const colunas = cortadas.length > 0 ? Object.keys(cortadas[0]) : [];

  return {
    colunas,
    linhas: cortadas.map((linha) => {
      const saida: Record<string, string | number | boolean | null> = {};
      for (const c of colunas) saida[c] = normalizar(linha[c]);
      return saida;
    }),
    total,
    truncado,
    duracaoMs: Date.now() - inicio,
  };
}
