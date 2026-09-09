import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Boxes, ShoppingCart, TrendingUp, Truck } from "lucide-react";

import { auth } from "@/lib/auth";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EstoquePorCd } from "@/components/visao-geral/estoque-por-cd";
import { PerfilFiscal } from "@/components/visao-geral/perfil-fiscal";
import { SemDados } from "@/components/visao-geral/sem-dados";
import { FiltroFornecedor } from "@/components/visao-geral/filtro-fornecedor";
import { lerDataReferencia } from "@/lib/data-referencia.server";
import { carregarVisaoGeral } from "@/lib/visao-geral/consultas";
import { dataBr, inteiro, moeda, moedaCurta } from "@/lib/visao-geral/formato";

export const dynamic = "force-dynamic";

/** Filtro de laboratório vive na URL: o link fica compartilhável e as
 *  consultas, que rodam no servidor, enxergam o filtro direto. */
type SearchParams = { fornecedor?: string | string[] };

const ICONES = { Boxes, TrendingUp, ShoppingCart, Truck };

function Kpi({
  titulo,
  valor,
  detalhe,
  icone,
}: {
  titulo: string;
  valor: number;
  detalhe: string;
  icone: keyof typeof ICONES;
}) {
  const Icone = ICONES[icone];
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription>{titulo}</CardDescription>
          <Icone className="size-4 text-(--brand-turquoise)" />
        </div>
      </CardHeader>
      <CardContent>
        {/* Número herói: é a leitura primária do cartão. */}
        <p className="text-3xl font-semibold tracking-tight text-(--brand-petrol) tabular-nums dark:text-foreground">
          {moedaCurta(valor)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{detalhe}</p>
      </CardContent>
    </Card>
  );
}

export default async function VisaoGeral({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const { fornecedor: bruto } = await searchParams;
  const fornecedor = (Array.isArray(bruto) ? bruto[0] : bruto)?.trim() || undefined;

  const dataReferencia = await lerDataReferencia();
  const { datasDisponiveis, fornecedores, totaisPorCd, perfilFiscal, rotas } =
    await carregarVisaoGeral(dataReferencia, fornecedor);

  const total = totaisPorCd.reduce(
    (soma, cd) => ({
      estoque: soma.estoque + cd.estoque,
      vendido: soma.vendido + cd.vendido,
      compras: soma.compras + cd.compras,
      transferencias: soma.transferencias + cd.transferencias,
      itens: soma.itens + cd.itens,
    }),
    { estoque: 0, vendido: 0, compras: 0, transferencias: 0, itens: 0 }
  );

  return (
    <DashboardShell user={{ name: session.user.name, email: session.user.email }}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-(--brand-petrol) dark:text-foreground">
              Visão geral
            </h1>
            <p className="text-muted-foreground">
              Estoque, vendas e reposição por centro de distribuição.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {fornecedor ? (
              <Badge className="bg-(--brand-turquoise) text-(--brand-petrol) text-sm">
                {`Laboratório: ${fornecedor}`}
              </Badge>
            ) : null}
            <Badge variant="secondary" className="text-sm">
              {`Referência: ${dataBr(dataReferencia)}`}
            </Badge>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <FiltroFornecedor fornecedores={fornecedores} atual={fornecedor} />
          </CardContent>
        </Card>

        {totaisPorCd.length === 0 ? (
          <SemDados dataReferencia={dataReferencia} datasDisponiveis={datasDisponiveis} />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi
                titulo="Estoque total"
                valor={total.estoque}
                detalhe={`${inteiro(total.itens)} itens em ${totaisPorCd.length} CDs`}
                icone="Boxes"
              />
              <Kpi
                titulo="Vendido no mês"
                valor={total.vendido}
                detalhe="Soma dos armazéns 01, 11, 26 e transferência"
                icone="TrendingUp"
              />
              <Kpi
                titulo="Compras em aberto"
                valor={total.compras}
                detalhe="Armazéns 01, 26 e nacional"
                icone="ShoppingCart"
              />
              <Kpi
                titulo="Transferências em aberto"
                valor={total.transferencias}
                detalhe="Coluna total_trans do simulador"
                icone="Truck"
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Estoque por CD</CardTitle>
                <CardDescription>
                  {`Valorizado pelo CMV unitário. Total de ${moeda(total.estoque)} distribuído em ${totaisPorCd.length} centros.`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EstoquePorCd dados={totaisPorCd} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Perfil fiscal do estoque</CardTitle>
                <CardDescription>
                  Composição tributária dentro de cada CD, cruzando o código do produto com a
                  guia Fiscal. Cada barra soma 100% do estoque do centro; abra uma tributação
                  na tabela para ver as rotas que a abastecem.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PerfilFiscal
                  fatias={perfilFiscal}
                  rotas={rotas}
                  totaisPorCd={totaisPorCd}
                />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
