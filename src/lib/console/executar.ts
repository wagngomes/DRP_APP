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
 * **O que isto NÃO protege:** a tela alcança qualquer tabela que o usuário do
 * banco alcança, inclusive `account`, que guarda os hashes de senha. Bloquear
 * por nome de tabela teria o mesmo buraco da lista de palavras proibidas, e por
 * isso não está aqui. A proteção correta seria um papel Postgres próprio, sem
 * SELECT nessas tabelas; enquanto não houver, o acesso é o do administrador.
 */

/** Linhas devolvidas à tela. Acima disso, o resto é cortado e avisado. */
export const LIMITE_TELA = 1_000;

/** Linhas devolvidas na exportação. Mais generoso, e ainda assim um teto. */
export const LIMITE_EXPORTACAO = 20_000;

const TIMEOUT_CONSULTA_MS = 10_000;

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
