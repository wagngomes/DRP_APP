import Link from "next/link";
import { AlertTriangle, CalendarClock, Truck } from "lucide-react";

import { exigirSessao } from "@/lib/autorizacao";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TabelaFluxo } from "@/components/transferencias/tabela-fluxo";
import { lerDataReferencia } from "@/lib/data-referencia.server";
import { lerParametros } from "@/lib/parametros.server";
import { carregarRotulosFiliais, projetarTransferencias } from "@/lib/transferencias/consultas";
import { dataBr, inteiro } from "@/lib/visao-geral/formato";

export const dynamic = "force-dynamic";

/** Cenário e recorte vivem na URL, então o link reproduz a mesma projeção. */
type SearchParams = {
  cdFinal?: string | string[];
};

const primeiro = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

export default async function Transferencias({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sessao = await exigirSessao();

  const params = await searchParams;
  const cdFinal = primeiro(params.cdFinal);

  // O prazo das vencidas é definido no Painel, junto da data de referência.
  const [dataReferencia, parametros] = await Promise.all([
    lerDataReferencia(),
    lerParametros(),
  ]);
  const [todas, rotulosMapa] = await Promise.all([
    projetarTransferencias({
      data: dataReferencia,
      diasParaVencidas: parametros.diasTransferencias,
    }),
    carregarRotulosFiliais(),
  ]);

  const rotulos = Object.fromEntries(rotulosMapa);
  const linhas = cdFinal ? todas.filter((t) => t.projecao.cdFinal === cdFinal) : todas;

  const comData = todas.filter((t) => t.projecao.chegadaFinal).length;
  const reprojetadas = todas.filter((t) => t.projecao.reprojetada).length;
  const indefinidas = todas.length - comData;

  // Volume por CD final, para o recorte rápido.
  const porCd = new Map<string, number>();
  for (const t of todas) {
    const c = t.projecao.cdFinal;
    if (c) porCd.set(c, (porCd.get(c) ?? 0) + 1);
  }
  const cds = [...porCd.entries()].sort((a, b) => b[1] - a[1]);

  const linkCd = (codigo?: string) =>
    codigo ? `/transferencias?cdFinal=${encodeURIComponent(codigo)}` : "/transferencias";

  return (
    <DashboardShell
      user={{ name: sessao.usuario.name, email: sessao.usuario.email }}
      papel={sessao.usuario.papel}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-(--brand-petrol) dark:text-foreground">
              Projeção de transferências
            </h1>
            <p className="text-muted-foreground">
              Percurso completo e data prevista de chegada em cada CD.
            </p>
          </div>
          <Badge variant="secondary" className="text-sm">
            {`Referência: ${dataBr(dataReferencia)}`}
          </Badge>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardDescription>Em aberto</CardDescription>
                <Truck className="size-4 text-(--brand-turquoise)" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold text-(--brand-petrol) tabular-nums dark:text-foreground">
                {inteiro(todas.length)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {`${inteiro(comData)} com data prevista`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardDescription>Reprojetadas</CardDescription>
                <CalendarClock className="size-4 text-(--brand-turquoise)" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold text-(--brand-petrol) tabular-nums dark:text-foreground">
                {inteiro(reprojetadas)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Projeção pela emissão já vencida
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardDescription>Sem projeção</CardDescription>
                <AlertTriangle className="size-4 text-amber-600" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold text-(--brand-petrol) tabular-nums dark:text-foreground">
                {inteiro(indefinidas)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Falta SLA em algum trecho</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Fluxo das transferências</CardTitle>
            <CardDescription>
              {cdFinal
                ? `${inteiro(linhas.length)} transferência(s) com destino final ${rotulos[cdFinal] ?? cdFinal}. Clique numa linha para ver o percurso.`
                : `${inteiro(linhas.length)} transferência(s). Clique numa linha para ver o percurso perna a perna.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              <Button
                render={<Link href={linkCd()} />}
                variant={cdFinal ? "outline" : "default"}
                size="sm"
                className={cdFinal ? "" : "bg-(--brand-turquoise) text-(--brand-petrol)"}
              >
                {`Todos (${inteiro(todas.length)})`}
              </Button>
              {cds.map(([codigo, n]) => (
                <Button
                  key={codigo}
                  render={<Link href={linkCd(codigo)} />}
                  variant={cdFinal === codigo ? "default" : "outline"}
                  size="sm"
                  className={cdFinal === codigo ? "bg-(--brand-turquoise) text-(--brand-petrol)" : ""}
                >
                  {`${rotulos[codigo] ?? codigo} (${n})`}
                </Button>
              ))}
            </div>

            <TabelaFluxo linhas={linhas} rotulos={rotulos} />
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
