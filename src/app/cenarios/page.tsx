
import { exigirSessao } from "@/lib/autorizacao";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { PainelCenario } from "@/components/cenarios/painel-cenario";
import { carregarCenario, listarCenarios } from "@/app/actions/cenario";
import { listarFornecedores } from "@/lib/disponibilidade/consultas";
import { carregarRotulosFiliais } from "@/lib/transferencias/consultas";
import { lerDataReferencia } from "@/lib/data-referencia.server";
import { temChaveConfigurada } from "@/lib/ia/cliente";
import { dataBr } from "@/lib/visao-geral/formato";

export const dynamic = "force-dynamic";

export default async function Cenarios({
  searchParams,
}: {
  searchParams: Promise<{ analise?: string | string[] }>;
}) {
  const sessao = await exigirSessao();

  const params = await searchParams;
  const analiseId = (Array.isArray(params.analise) ? params.analise[0] : params.analise)?.trim();

  const dataReferencia = await lerDataReferencia();
  const [fornecedores, rotulos, cenarios, selecionado] = await Promise.all([
    listarFornecedores(dataReferencia),
    carregarRotulosFiliais(),
    listarCenarios(),
    analiseId ? carregarCenario(analiseId) : Promise.resolve(null),
  ]);

  return (
    <DashboardShell
      user={{ name: sessao.usuario.name, email: sessao.usuario.email }}
      papel={sessao.usuario.papel}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-(--brand-petrol) dark:text-foreground">
              Cenários
            </h1>
            <p className="text-muted-foreground">
              Descreva uma hipótese em português e veja o efeito calculado na rede.
            </p>
          </div>
          <Badge variant="secondary" className="text-sm">
            {`Referência: ${dataBr(dataReferencia)}`}
          </Badge>
        </div>

        {!temChaveConfigurada() ? (
          <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
            A chave da API não está configurada, então a interpretação da pergunta e o texto
            da análise não funcionam. Os cálculos não dependem dela.
          </p>
        ) : null}

        {/* A chave remonta o painel ao trocar de análise: sem ela, o resultado
            da última execução continuaria na tela por cima do card aberto. */}
        <PainelCenario
          podeEditar={sessao.usuario.papel === "admin"}
          key={analiseId ?? "novo"}
          fornecedores={fornecedores}
          rotulos={Object.fromEntries(rotulos)}
          cenarios={cenarios}
          inicial={selecionado}
          selecionadoId={analiseId}
        />
      </div>
    </DashboardShell>
  );
}
