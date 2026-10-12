/**
 * Aplica uma migration escrita à mão e a registra no histórico do Prisma.
 *
 *   npx tsx --env-file=.env scripts/aplicar-migration.ts 20261012090000_arvore_diagnostico
 *
 * Existe porque `prisma migrate dev` não pode ser usado neste projeto: o
 * histórico de migrations do banco diverge do diretório desde o baseline de
 * 11/09, e o comando propõe **resetar o schema** — o que apagaria as bases
 * inteiras. `prisma migrate deploy` tenta aplicar as sete migrations que o
 * banco não tem registradas, várias delas já aplicadas à mão, e falha na
 * primeira.
 *
 * Então o caminho é este: executar o SQL e escrever a linha no histórico, para
 * que um `migrate deploy` futuro não tente aplicá-la de novo.
 *
 * Idempotente dos dois lados. O SQL das migrations deste projeto usa
 * `IF NOT EXISTS`, e o registro é checado antes de inserir — rodar duas vezes
 * não faz nada na segunda. É de propósito: um script de migration que só pode
 * rodar uma vez é um script que ninguém tem coragem de rodar.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { prisma } from "@/lib/prisma";

/**
 * Quebra o arquivo em comandos.
 *
 * Ponto e vírgula no fim da linha, ignorando os que estão dentro de
 * comentário. Não é um parser de SQL e não precisa ser: as migrations deste
 * projeto são DDL simples, sem função nem bloco `DO $$`. Se algum dia
 * precisarem, isto tem de ser trocado — e o erro vai aparecer alto, porque o
 * comando quebrado falha na hora.
 */
function comandos(sql: string): string[] {
  const limpo = sql
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");
  return limpo
    .split(";")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

async function main() {
  const nome = process.argv[2];
  if (!nome) {
    console.error(
      "Uso: tsx scripts/aplicar-migration.ts <pasta_da_migration>\n" +
        "Exemplo: 20261012090000_arvore_diagnostico",
    );
    process.exit(1);
  }

  const caminho = join("prisma", "migrations", nome, "migration.sql");
  const sql = readFileSync(caminho, "utf8");
  const lista = comandos(sql);

  console.log(`\n${nome}`);
  console.log(`  ${lista.length} comandos em ${caminho}`);

  const [registro] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*) AS n FROM _prisma_migrations WHERE migration_name = $1`,
    nome,
  );
  const jaRegistrada = Number(registro.n) > 0;
  if (jaRegistrada) {
    console.log(
      "  já consta no histórico — o SQL roda de novo por ser idempotente",
    );
  }

  for (const [i, comando] of lista.entries()) {
    const resumo = comando.replace(/\s+/g, " ").slice(0, 78);
    process.stdout.write(`  ${i + 1}. ${resumo}... `);
    await prisma.$executeRawUnsafe(comando);
    console.log("ok");
  }

  if (!jaRegistrada) {
    // O checksum é o do arquivo, como o Prisma calcula: assim um
    // `migrate status` futuro não acusa alteração depois da aplicação.
    const checksum = createHash("sha256").update(sql).digest("hex");
    await prisma.$executeRawUnsafe(
      `INSERT INTO _prisma_migrations
         (id, checksum, finished_at, migration_name, logs, rolled_back_at,
          started_at, applied_steps_count)
       VALUES (gen_random_uuid()::text, $1, now(), $2, NULL, NULL, now(), $3)`,
      checksum,
      nome,
      lista.length,
    );
    console.log("  registrada no histórico do Prisma");
  }

  console.log("");
  process.exit(0);
}

main().catch((e) => {
  console.error("\nFALHOU:", e instanceof Error ? e.message : e);
  process.exit(1);
});
