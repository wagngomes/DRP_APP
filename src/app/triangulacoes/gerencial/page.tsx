import Link from "next/link";
import { ArrowLeftRight, Network, Package, Route, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PainelTrechos } from "@/components/triangulacoes/painel-trechos";
import { FiltroFornecedor } from "@/components/visao-geral/filtro-fornecedor";
import { exigirSessao } from "@/lib/autorizacao";
import { carregarTriangulacoes } from "@/lib/triangulacoes/consultas";
import { montarTrechos, totaisAgora } from "@/lib/triangulacoes/trechos";
import { carregarRotulosFiliais } from "@/lib/transferencias/consultas";
import { lerDataReferencia } from "@/lib/data-referencia.server";
import { lerParametros } from "@/lib/parametros.server";

/**
 * Visão gerencial das triangulações, por trecho.
 *
 * A tela de triangulações responde "como está o produto X". Esta responde
 * "onde está o capital" — e por isso o eixo é o trecho entre dois CDs, não o
 * produto nem a rota inteira: são 63 rotas abertas contra 35 trechos, e por rota
 * a tela teria o dobro de cartões dizendo menos.
 *
 * Usa `carregarTriangulacoes`, a mesma função da outra tela, e não uma consulta
 * própria. É o que faz os números das duas baterem por construção: se a regra de
 * triangulação mudar, muda nas duas ao mesmo tempo, sem ninguém precisar lembrar
 * de replicar.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Triangulações gerenciais · DRP_AI" };

function moeda(v: number): string {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function primeiro(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : undefined;
}

export default async function TriangulacoesGerenciais({
  searchParams,
}: {
  searchParams: Promise<{ fornecedor?: string | string[] }>;
}) {
  const sessao = await exigirSessao();
  const params = await searchParams;
  const fornecedor = primeiro(params.fornecedor);

  const [dataReferencia, parametros] = await Promise.all([
    lerDataReferencia(),
    lerParametros(),
  ]);

  const [dados, rotulos] = await Promise.all([
    carregarTriangulacoes(dataReferencia, parametros, undefined, fornecedor),
    carregarRotulosFiliais(),
  ]);

  const trechos = montarTrechos(dados.produtos);
  const totais = totaisAgora(trechos);

  // O que a tela por produto conta e esta não: documento sem percurso não tem
  // trecho onde aparecer. Mostrar a diferença com o valor fecha a conta entre as
  // duas telas — sem isso, quem comparasse acharia um furo sem explicação.
  const foraDoPercurso =
    dados.valorTransferencia + dados.valorCompra - totais.valor;

  return (
    <DashboardShell
      user={{ name: sessao.usuario.name, email: sessao.usuario.email }}
      papel={sessao.usuario.papel}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium tracking-widest text-muted-foreground uppercase">
              <Network className="size-3.5" />
              Visão gerencial
            </p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-(--brand-petrol) dark:text-foreground">
              Triangulações por trecho
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Onde está o capital nas rotas, e o que ainda vai passar por cada
              corredor.
            </p>
          </div>

          <div className="flex items-end gap-2">
            <FiltroFornecedor
              fornecedores={dados.fornecedores}
              atual={fornecedor}
              basePath="/triangulacoes/gerencial"
            />
            {/* Ponte para a outra tela: esta aponta onde olhar, aquela resolve o
                caso concreto por produto. */}
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/triangulacoes" />}
            >
              <ArrowLeftRight className="size-4" />
              Por produto
            </Button>
          </div>
        </div>

        {/* Totais do que está em trânsito **agora**. Não incluem o "vai passar":
            lá o mesmo documento aparece em vários trechos, e somá-lo daria
            capital contado duas vezes. Estes são os números que batem com a tela
            de triangulações. */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-5">
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Truck className="size-4" />
                Em trânsito agora
              </p>
              <p className="font-mono text-2xl font-semibold text-(--brand-petrol) tabular-nums dark:text-(--brand-turquoise)">
                {moeda(totais.valor)}
              </p>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground tabular-nums">
                {`${moeda(totais.valorTransferencia)} transf · ${moeda(totais.valorCompra)} compra`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Route className="size-4" />
                Trechos ativos
              </p>
              <p className="font-mono text-2xl font-semibold tabular-nums">
                {totais.trechos}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {`${trechos.length} no total, contando os que só têm carga futura`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Package className="size-4" />
                Produtos em rota
              </p>
              <p className="font-mono text-2xl font-semibold tabular-nums">
                {totais.produtos.toLocaleString("pt-BR")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">Documentos</p>
              <p className="font-mono text-2xl font-semibold tabular-nums">
                {totais.documentos.toLocaleString("pt-BR")}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {`${dados.linhasTransferencia} NF · ${dados.linhasCompra} pedidos`}
              </p>
            </CardContent>
          </Card>
        </div>

        {dados.semPercurso > 0 ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            {`${dados.semPercurso} documento(s) — ${moeda(foraDoPercurso)} — ficaram de fora: a rota traz sigla que não está no cadastro de filiais, e sem percurso não há trecho onde mostrá-los. É a diferença entre o total desta tela e o da tela por produto.`}
          </p>
        ) : null}

        <PainelTrechos
          trechos={trechos}
          rotulos={Object.fromEntries(rotulos)}
        />
      </div>
    </DashboardShell>
  );
}
