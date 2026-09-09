import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ImportsWorkspace } from "@/components/imports/imports-workspace";

export default async function UploadsPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  return (
    <DashboardShell user={{ name: session.user.name, email: session.user.email }}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-(--brand-petrol)">Importação de dados</h1>
          <p className="text-muted-foreground">
            Selecione uma guia para importar, visualizar ou limpar os dados de cada tabela.
          </p>
        </div>

        <ImportsWorkspace />
      </div>
    </DashboardShell>
  );
}
