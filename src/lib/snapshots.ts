import { prisma } from "@/lib/prisma";

/**
 * As datas de carga de uma tabela cumulativa.
 *
 * `SELECT DISTINCT data_snapshot` parece a forma óbvia, e é a forma lenta: o
 * Postgres percorre **todas** as entradas do índice para descobrir quais valores
 * existem. No simulador isso são 167.894 leituras para devolver 13 datas, e o
 * custo cresce com a tabela, não com o número de respostas.
 *
 * A consulta recursiva abaixo faz o contrário: pega a menor data e, a cada
 * passo, pergunta ao índice qual é a próxima maior. Treze saltos em vez de uma
 * varredura. É o "loose index scan" que o Postgres não faz sozinho.
 *
 *   simulador   262,5ms → 1,5ms      contratos   55,3ms → 0,2ms
 *   forecast     26,2ms → 0,3ms      plano       15,8ms → 0,1ms
 *
 * Os valores acima são tempo de banco medido com EXPLAIN ANALYZE; em
 * desenvolvimento a latência até o Supabase esconde a diferença, mas em
 * produção, com o banco na mesma máquina, ela é o tempo da consulta inteira.
 */

/** Nome de tabela e coluna só podem vir do nosso próprio config, nunca do usuário. */
const IDENTIFICADOR = /^[a-z_][a-z0-9_]*$/;

export async function listarSnapshots(
  tabela: string,
  campo = "data_snapshot"
): Promise<string[]> {
  // O nome da tabela entra na consulta por interpolação — não há como
  // parametrizá-lo. A validação é a garantia de que só um identificador simples
  // chega ali, mesmo que um dia alguém passe algo vindo de fora.
  if (!IDENTIFICADOR.test(tabela) || !IDENTIFICADOR.test(campo)) {
    throw new Error(`Identificador inválido: ${tabela}.${campo}`);
  }

  const linhas = await prisma.$queryRawUnsafe<{ d: Date | null }[]>(
    `WITH RECURSIVE saltos AS (
       (SELECT ${campo} AS d FROM ${tabela} WHERE ${campo} IS NOT NULL ORDER BY ${campo} LIMIT 1)
       UNION ALL
       SELECT (SELECT t.${campo} FROM ${tabela} t
                WHERE t.${campo} > saltos.d ORDER BY t.${campo} LIMIT 1)
         FROM saltos WHERE saltos.d IS NOT NULL
     )
     SELECT d FROM saltos WHERE d IS NOT NULL ORDER BY d DESC`
  );

  return linhas
    .filter((l): l is { d: Date } => l.d !== null)
    .map((l) => l.d.toISOString().slice(0, 10));
}
