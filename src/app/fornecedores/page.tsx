import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TabelaFornecedores } from "@/components/fornecedores/tabela-fornecedores";
import { carregarFornecedores } from "@/lib/fornecedores/consultas";
import { carregarRotulosFiliais } from "@/lib/transferencias/consultas";
import { lerDataReferencia } from "@/lib/data-referencia.server";
import { lerParametros } from "@/lib/parametros.server";
import { SeletorFaixa } from "@/components/fornecedores/seletor-faixa";
import { FAIXAS, faixaPorId, type FaixaId } from "@/utils/dias-estoque";
import { dataBr, inteiro } from "@/lib/visao-geral/formato";

export const dynamic = "force-dynamic";

/** Só a faixa de cobertura é escolhida aqui; o resto vem do Painel. */
type SearchParams = { faixa?: string | string[] };

export default async function Fornecedores({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const params = await searchParams;
  const faixaBruta = Array.isArray(params.faixa) ? params.faixa[0] : params.faixa;
  // Só aceita faixa conhecida — evita consulta com valor arbitrário da URL.
  const faixa: FaixaId = FAIXAS.some((f) => f.id === faixaBruta)
    ? (faixaBruta as FaixaId)
    : "zero";
  const rotuloFaixa = faixaPorId(faixa)!.rotulo;

  const dataReferencia = await lerDataReferencia();
  const parametros = await lerParametros();

  const [dados, rotulos] = await Promise.all([
    carregarFornecedores(dataReferencia, parametros, faixa),
    carregarRotulosFiliais(),
  ]);

  const { posicoes, linhasIgnoradas } = dados;
  const ignoradas = linhasIgnoradas.pedidos + linhasIgnoradas.transferencias;

  return (
    <DashboardShell user={{ name: session.user.name, email: session.user.email }}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-(--brand-petrol) dark:text-foreground">
              Fornecedores
            </h1>
            <p className="text-muted-foreground">
              Cobertura por fornecedor e o que já está a caminho para resolvê-la.
            </p>
          </div>
          <Badge variant="secondary" className="text-sm">
            {`Referência: ${dataBr(dataReferencia)}`}
          </Badge>
        </div>

        <Card>
          <CardContent className="pt-6">
            <SeletorFaixa atual={faixa} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{`${rotuloFaixa} — por fornecedor`}</CardTitle>
            <CardDescription>
              {`${inteiro(posicoes.length)} posições (item × CD) na faixa "${rotuloFaixa}": itens válidos (torre "considerar") com forecast no mês, pela mesma régua de cobertura da Disponibilidade. Cada posição entra em uma única situação; quando há compra e transferência, vale a que chega primeiro. As datas usam os parâmetros de projeção do Painel (${parametros.diasPedidos} dias para pedidos vencidos, ${parametros.diasTransferencias} para transferências).`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TabelaFornecedores
              posicoes={posicoes}
              rotulosFiliais={Object.fromEntries(rotulos)}
            />
          </CardContent>
        </Card>

        {ignoradas > 0 ? (
          <p className="text-xs text-muted-foreground">
            {`Atenção: ${inteiro(linhasIgnoradas.pedidos)} linha(s) de pedidos de compra e ${inteiro(linhasIgnoradas.transferencias)} de transferências abertas estão com o código do produto nulo e ficaram de fora desta análise. São cargas antigas — apague esses snapshots na tela de importação.`}
          </p>
        ) : null}
      </div>
    </DashboardShell>
  );
}
