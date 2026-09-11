#!/usr/bin/env node
/**
 * Promove uma conta a administrador.
 *
 * Existe para resolver o problema do primeiro acesso: num banco vazio ninguém
 * é administrador, e a tela de usuários — que é onde se promove alguém — exige
 * ser administrador para abrir. Sem uma porta fora da aplicação, o sistema
 * sobe trancado.
 *
 * Também é a saída quando o único administrador perde o acesso.
 *
 * Usa `pg` direto, e não o Prisma, de propósito: assim roda sem depender do
 * cliente gerado, que pode não estar presente conforme de onde se executa.
 *
 *   npm run admin -- pessoa@empresa.com          (com DATABASE_URL no ambiente)
 *   npm run admin -- pessoa@empresa.com --listar (mostra todos e sai)
 *
 * Na VPS, sem precisar do repositório, o equivalente é uma linha:
 *
 *   docker compose exec banco psql -U drp -d drp_ai \
 *     -c "UPDATE \"user\" SET role='admin' WHERE email='pessoa@empresa.com'"
 */
import { readFileSync } from "node:fs";
import pg from "pg";

function urlDoBanco() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  // Conveniência para rodar na máquina de quem desenvolve, onde a variável
  // costuma viver só no .env e não no ambiente do shell.
  try {
    const m = readFileSync(".env", "utf8").match(/^DATABASE_URL="?([^"\n]+)"?/m);
    if (m) return m[1];
  } catch {
    // Sem .env: cai no erro abaixo, que explica o que fazer.
  }
  return null;
}

async function principal() {
  const args = process.argv.slice(2);
  const listar = args.includes("--listar");
  const email = args.find((a) => !a.startsWith("--"));

  if (!email && !listar) {
    console.error(
      "Informe o e-mail da conta a promover:\n" +
        "  npm run admin -- pessoa@empresa.com\n" +
        "  npm run admin -- --listar"
    );
    process.exit(1);
  }

  const connectionString = urlDoBanco();
  if (!connectionString) {
    console.error(
      "DATABASE_URL não encontrada. Defina no ambiente ou no arquivo .env da raiz."
    );
    process.exit(1);
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    if (listar) {
      const { rows } = await client.query(
        `SELECT email, name, role, "createdAt" FROM "user" ORDER BY "createdAt"`
      );
      if (rows.length === 0) {
        console.log("Nenhuma conta cadastrada ainda. Crie a sua na tela de login e rode de novo.");
        return;
      }
      console.table(
        rows.map((r) => ({
          email: r.email,
          nome: r.name,
          papel: r.role,
          criada: r.createdAt.toISOString().slice(0, 10),
        }))
      );
      return;
    }

    const { rows } = await client.query(
      `UPDATE "user" SET role = 'admin', "updatedAt" = now()
        WHERE lower(email) = lower($1)
        RETURNING email, name, role`,
      [email]
    );

    if (rows.length === 0) {
      console.error(
        `Nenhuma conta com o e-mail ${email}.\n` +
          "Crie a conta na tela de login primeiro, depois rode este comando.\n" +
          "Para ver as contas existentes: npm run admin -- --listar"
      );
      process.exit(1);
    }

    console.log(`${rows[0].name} <${rows[0].email}> agora é administrador.`);
    console.log("Saia e entre de novo para a sessão recarregar o papel.");
  } finally {
    await client.end();
  }
}

principal().catch((erro) => {
  console.error("Falhou:", erro.message);
  process.exit(1);
});
