import { exigirSessao } from "@/lib/autorizacao";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ImportsWorkspace } from "@/components/imports/imports-workspace";

export default async function UploadsPage() {
  const sessao = await exigirSessao();
  // Quem é consulta vê os dados importados e navega nas guias; importar e
  // limpar substituem a base inteira e ficam para administrador.
  const podeEditar = sessao.usuario.papel === "admin";

  return (
    <DashboardShell
      user={{ name: sessao.usuario.name, email: sessao.usuario.email }}
      papel={sessao.usuario.papel}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-(--brand-petrol)">Importação de dados</h1>
          <p className="text-muted-foreground">
            {podeEditar
              ? "Selecione uma guia para importar, visualizar ou limpar os dados de cada tabela."
              : "Selecione uma guia para consultar os dados de cada tabela. Importar e limpar exigem perfil de administrador."}
          </p>
        </div>

        <ImportsWorkspace podeEditar={podeEditar} />
      </div>
    </DashboardShell>
  );
}
