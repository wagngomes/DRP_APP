import { Terminal } from "lucide-react";

import { ConsoleSql } from "@/components/console/console-sql";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { exigirAdmin } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";

/**
 * Console SQL, só para administradores.
 *
 * Existe para responder pergunta que a tela pronta não responde — conferir um
 * número, entender por que dois relatórios divergem, olhar uma tabela que ainda
 * não virou tela. Sem ele, a alternativa é abrir a porta do banco na VPS, que é
 * bem pior: porta publicada é porta varrida.
 *
 * `exigirAdmin` aqui e `exigirAdminOuErro` na rota: a página redireciona quem
 * não pode, e a rota recusa. As duas são necessárias — proteger só a página
 * deixaria a API aberta a quem souber o caminho.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Console SQL · DRP_AI" };

export default async function Console() {
  const sessao = await exigirAdmin();

  // A lista alimenta o atalho lateral. `pg_stat_user_tables` em vez de
  // `information_schema`: traz só as tabelas de dados, sem as internas.
  const tabelas = await prisma.$queryRawUnsafe<{ relname: string }[]>(
    `SELECT relname FROM pg_stat_user_tables ORDER BY relname`,
  );

  return (
    <DashboardShell
      user={{ name: sessao.usuario.name, email: sessao.usuario.email }}
      papel={sessao.usuario.papel}
    >
      <div className="space-y-4">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium tracking-widest text-muted-foreground uppercase">
            <Terminal className="size-3.5" />
            Administração
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-(--brand-petrol) dark:text-foreground">
            Console SQL
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Consultas somente leitura, direto no banco. Escrita é recusada pelo
            próprio Postgres, e cada consulta fica registrada no log de
            auditoria.
          </p>
        </div>

        <ConsoleSql tabelas={tabelas.map((t) => t.relname)} />
      </div>
    </DashboardShell>
  );
}
