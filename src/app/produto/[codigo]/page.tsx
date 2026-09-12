import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarOff,
  CircleHelp,
  ClipboardList,
  PackageCheck,
  ShoppingCart,
  Sigma,
  Snowflake,
  Sun,
} from "lucide-react";

import { exigirSessao } from "@/lib/autorizacao";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardFilial } from "@/components/produto/card-filial";
import { lerDataReferencia } from "@/lib/data-referencia.server";
import { lerParametros } from "@/lib/parametros.server";
import { carregarDetalheProduto, type Refrigeracao } from "@/lib/produto/consultas";
import { carregarRotulosFiliais } from "@/lib/transferencias/consultas";
import { dataBr } from "@/lib/visao-geral/formato";

export const dynamic = "force-dynamic";

type Params = { codigo: string };

/** Mesma linguagem de cor dos blocos por filial: compras em âmbar, entradas
 *  em verde, plano em petróleo e saldo em cinza (é um resultado, não uma
 *  categoria — ganha cor só quando fica negativo). */
const ICONES = {
  ClipboardList: { icone: ClipboardList, cor: "text-(--brand-petrol) dark:text-sky-300" },
  ShoppingCart: { icone: ShoppingCart, cor: "text-amber-600 dark:text-amber-400" },
  PackageCheck: { icone: PackageCheck, cor: "text-emerald-600 dark:text-emerald-400" },
  Sigma: { icone: Sigma, cor: "text-muted-foreground" },
};

function numero(v: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function CardResumo({
  titulo,
  valor,
  detalhe,
  icone,
  destaque,
}: {
  titulo: string;
  valor: number;
  detalhe: string;
  icone: keyof typeof ICONES;
  destaque?: boolean;
}) {
  const { icone: Icone, cor: corIcone } = ICONES[icone];
  // Saldo negativo é informação, não erro: o plano já foi superado.
  const cor = destaque && valor < 0 ? "text-destructive" : "text-(--brand-petrol) dark:text-foreground";
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription>{titulo}</CardDescription>
          <Icone className={`size-4 ${corIcone}`} />
        </div>
      </CardHeader>
      <CardContent>
        <p className={`text-3xl font-semibold tabular-nums ${cor}`}>{numero(valor)}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detalhe}</p>
      </CardContent>
    </Card>
  );
}

/**
 * Selo de cadeia fria.
 *
 * Três estados e não dois: 2.321 itens têm "2" na coluna `usa_refrig`, valor
 * que não é nem S nem N e se concentra em produto para saúde (meias, seringas,
 * chupetas). Desenhar o cadeado do "não" em cima disso afirmaria algo que o
 * cadastro não diz. O estado desconhecido fica visível de propósito — é assim
 * que o dado errado chega a quem pode corrigi-lo na origem.
 */
function SeloRefrigeracao({ estado }: { estado: Refrigeracao }) {
  const selo = {
    sim: {
      Icone: Snowflake,
      texto: "Refrigerado",
      classe:
        "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300",
    },
    nao: {
      Icone: Sun,
      texto: "Temperatura ambiente",
      classe: "border-transparent bg-muted text-muted-foreground",
    },
    desconhecido: {
      Icone: CircleHelp,
      texto: "Refrigeração não informada",
      classe:
        "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400",
    },
  }[estado];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${selo.classe}`}
      title={selo.texto}
    >
      <selo.Icone className="size-3.5" aria-hidden />
      {selo.texto}
    </span>
  );
}

export default async function ProdutoDetalhe({ params }: { params: Promise<Params> }) {
  const sessao = await exigirSessao();

  const { codigo } = await params;
  const [dataReferencia, parametros] = await Promise.all([
    lerDataReferencia(),
    lerParametros(),
  ]);

  const [detalhe, rotulosMapa] = await Promise.all([
    carregarDetalheProduto(decodeURIComponent(codigo), dataReferencia, parametros),
    carregarRotulosFiliais(),
  ]);
  if (!detalhe) notFound();

  const rotulos = Object.fromEntries(rotulosMapa);
  const mesReferencia = dataReferencia.slice(0, 7);
  const mesVazio =
    detalhe.resumo.plano === 0 &&
    detalhe.resumo.emAberto === 0 &&
    detalhe.resumo.recebido === 0 &&
    detalhe.mesesComDados.length > 0 &&
    !detalhe.mesesComDados.includes(mesReferencia);

  return (
    <DashboardShell
      user={{ name: sessao.usuario.name, email: sessao.usuario.email }}
      papel={sessao.usuario.papel}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Button render={<Link href="/produto" />} variant="ghost" size="sm" className="-ml-2 mb-1">
              <ArrowLeft className="size-4" />
              Buscar outro produto
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-(--brand-petrol) dark:text-foreground">
                {detalhe.descricao ?? detalhe.codigo}
              </h1>
              <SeloRefrigeracao estado={detalhe.refrigeracao} />
            </div>
            <p className="text-muted-foreground">
              {[detalhe.codigo, detalhe.marca, detalhe.grupo, detalhe.unidade]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <Badge variant="secondary" className="text-sm">
            {`Referência: ${dataBr(dataReferencia)}`}
          </Badge>
        </div>

        {mesVazio ? (
          <Card className="border-dashed">
            <CardHeader className="flex flex-row items-center gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                <CalendarOff className="size-5" />
              </div>
              <div>
                <CardTitle className="text-base">
                  {`Sem movimento em ${mesReferencia.split("-").reverse().join("/")}`}
                </CardTitle>
                <CardDescription>
                  {`Este produto tem plano, pedidos ou recebimentos em: ${detalhe.mesesComDados.join(", ")}. Ajuste a data de referência no Painel para ver esses números.`}
                </CardDescription>
              </div>
            </CardHeader>
          </Card>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <CardResumo
            titulo="Plano mensal"
            valor={detalhe.resumo.plano}
            detalhe="Plano de compra do mês"
            icone="ClipboardList"
          />
          <CardResumo
            titulo="Em aberto"
            valor={detalhe.resumo.emAberto}
            detalhe="Pedidos do mês ainda a receber"
            icone="ShoppingCart"
          />
          <CardResumo
            titulo="Recebido"
            valor={detalhe.resumo.recebido}
            detalhe="Entradas do mês, de pedidos do mês"
            icone="PackageCheck"
          />
          <CardResumo
            titulo="Saldo"
            valor={detalhe.resumo.saldo}
            detalhe="Plano − em aberto − recebido"
            icone="Sigma"
            destaque
          />
        </div>

        {detalhe.filiais.length > 0 ? (
          <CardFilial
            posicao={detalhe.cia}
            rotulos={rotulos}
            indice={0}
            dataReferencia={dataReferencia}
            modo="cia"
          />
        ) : null}

        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-(--brand-petrol) dark:text-foreground">
            {`Posição por filial (${detalhe.filiais.length})`}
          </h2>
          {detalhe.filiais.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Sem posição de estoque, compras ou transferências para esta data.
              </CardContent>
            </Card>
          ) : (
            detalhe.filiais.map((posicao, i) => (
              <CardFilial
                key={posicao.filial}
                posicao={posicao}
                rotulos={rotulos}
                indice={i}
                dataReferencia={dataReferencia}
              />
            ))
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
