import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { UploadCloud } from "lucide-react";

import { auth } from "@/lib/auth";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DataReferenciaPicker } from "@/components/painel/data-referencia-picker";
import { ParametrosProjecao } from "@/components/painel/parametros-projecao";
import { ParametrosCobertura } from "@/components/painel/parametros-cobertura";
import { lerCoberturas, lerParametros } from "@/lib/parametros.server";
import { descreverEscopo } from "@/lib/data-referencia";
import { lerDataReferencia } from "@/lib/data-referencia.server";
import { IMPORT_MODELS } from "@/lib/imports/config";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  const [dataReferencia, parametros, coberturas] = await Promise.all([
    lerDataReferencia(),
    lerParametros(),
    lerCoberturas(),
  ]);
  const [ano, mes, dia] = dataReferencia.split("-");
  const dataBr = `${dia}/${mes}/${ano}`;
  // Só as tabelas recortadas por data entram no resumo — listar as demais como
  // "não aplica" faria o cartão crescer sem informar nada.
  const afetadas = IMPORT_MODELS.filter((model) => model.snapshotScope);

  return (
    <DashboardShell user={{ name: session.user.name, email: session.user.email }}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-(--brand-petrol)">
            Olá, {session.user.name.split(" ")[0]}
          </h1>
          <p className="text-muted-foreground">
            Visão geral do abastecimento e riscos de ruptura da sua rede.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Data de referência do sistema</CardTitle>
            <CardDescription>
              {`Define de qual dia as bases cumulativas são lidas. Todas as consultas do sistema passam a usar ${dataBr}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <DataReferenciaPicker valorAtual={dataReferencia} />
            <Separator />
            <div>
              <p className="mb-2 text-sm font-medium text-(--brand-petrol) dark:text-foreground">
                Prazo para chegadas vencidas
              </p>
              <ParametrosProjecao atuais={parametros} />
            </div>
            <Separator />
            <div>
              <p className="mb-2 text-sm font-medium text-(--brand-petrol) dark:text-foreground">
                Faixas de cobertura
              </p>
              <ParametrosCobertura atuais={coberturas} />
            </div>
            <Separator />
            <div>
              <p className="mb-2 text-sm font-medium text-(--brand-petrol)">
                Como cada base é recortada
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {afetadas.map((model) => (
                  <li
                    key={model.key}
                    className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"
                  >
                    <span>{model.label}</span>
                    <Badge variant="secondary">{descreverEscopo(model)}</Badge>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                As demais bases (Produtos, Fiscal, Rotas, Recebimento, SLA, Clientes e
                Histórico de Vendas) não são recortadas por data.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-(--brand-turquoise)/20 text-(--brand-petrol)">
              <UploadCloud className="size-6" />
            </div>
            <div>
              <CardTitle>Importação de arquivos CSV</CardTitle>
              <CardDescription>
                Traga saldos de estoque, pedidos e transferências em aberto para começar a
                gerar previsões.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button
              render={<Link href="/uploads" />}
              className="bg-(--brand-turquoise) text-(--brand-petrol) hover:bg-(--brand-turquoise)/90"
            >
              Ir para importação
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
