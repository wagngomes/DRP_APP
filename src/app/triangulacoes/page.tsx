import Link from "next/link";
import { Boxes, Layers, ShoppingCart, TrendingUp, Truck } from "lucide-react";

import { exigirSessao } from "@/lib/autorizacao";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WorkflowRota } from "@/components/produto/workflow-rota";
import { FiltroFornecedor } from "@/components/visao-geral/filtro-fornecedor";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { carregarTriangulacoes, type LinhaTriangulacao } from "@/lib/triangulacoes/consultas";
import { carregarRotulosFiliais } from "@/lib/transferencias/consultas";
import { lerDataReferencia } from "@/lib/data-referencia.server";
import { lerParametros } from "@/lib/parametros.server";
import { dataBr, inteiro, moeda } from "@/lib/visao-geral/formato";

export const dynamic = "force-dynamic";

/** Recorte da tela: produto (texto livre) e fornecedor normalizado. */
type SearchParams = {
  produto?: string | string[];
  fornecedor?: string | string[];
  pag?: string | string[];
};

/**
 * Produtos por página. O corte é no servidor: cada card carrega o percurso de
 * todas as notas e pedidos do item, e a lista inteira passava de 7 MB de HTML.
 * Os totais do topo continuam sendo os do recorte completo, não os da página.
 */
const POR_PAGINA = 12;

const primeiro = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

/**
 * Cores por origem, as mesmas da tela de produto: turquesa é transferência,
 * âmbar é compra. Ler a cor já diz de onde a mercadoria vem.
 */
const TOM = {
  transferencia: {
    texto: "text-teal-700 dark:text-teal-300",
    borda: "border-l-4 border-teal-500",
    fundo: "bg-teal-500/10",
    rotulo: "Transferência",
    documento: (d: string | null) => `NF ${d ?? "—"}`,
    data: "digitada",
  },
  compra: {
    texto: "text-amber-700 dark:text-amber-400",
    borda: "border-l-4 border-amber-500",
    fundo: "bg-amber-500/10",
    rotulo: "Compra",
    documento: (d: string | null) => `Pedido ${d ?? "—"}`,
    data: "emitido",
  },
} as const;

/** Remove um filtro preservando o outro. Trocar de filtro volta à página 1. */
function hrefSem(qual: "produto" | "fornecedor", fornecedor?: string): string {
  const p = new URLSearchParams();
  if (qual === "produto" && fornecedor) p.set("fornecedor", fornecedor);
  const qs = p.toString();
  return qs ? `/triangulacoes?${qs}` : "/triangulacoes";
}

function num(v: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function dataIso(d: Date | null): string {
  return d ? dataBr(d.toISOString().slice(0, 10)) : "—";
}

export default async function Triangulacoes({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sessao = await exigirSessao();

  const params = await searchParams;
  const produto = primeiro(params.produto);
  const fornecedor = primeiro(params.fornecedor);
  const pagPedida = Number(primeiro(params.pag) ?? 1) || 1;

  const dataReferencia = await lerDataReferencia();
  const parametros = await lerParametros();

  const [dados, rotulos] = await Promise.all([
    carregarTriangulacoes(dataReferencia, parametros, produto, fornecedor),
    carregarRotulosFiliais(),
  ]);

  const paginas = Math.max(1, Math.ceil(dados.produtos.length / POR_PAGINA));
  const pagina = Math.min(Math.max(1, pagPedida), paginas);
  const visiveis = dados.produtos.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  /** Link de outra página preservando os filtros. */
  const hrefPagina = (n: number) => {
    const p = new URLSearchParams();
    if (produto) p.set("produto", produto);
    if (fornecedor) p.set("fornecedor", fornecedor);
    if (n > 1) p.set("pag", String(n));
    const qs = p.toString();
    return qs ? `/triangulacoes?${qs}` : "/triangulacoes";
  };

  const rotulo = (codigo: string | null) => (codigo ? rotulos.get(codigo) ?? codigo : "—");

  /** Descrição do card: quantas linhas de cada origem e para onde vão. */
  const resumo = (linhas: LinhaTriangulacao[], destinos: string[]) => {
    const t = linhas.filter((l) => l.origem === "transferencia").length;
    const c = linhas.length - t;
    const partes = [
      t > 0 ? `${t} nota(s) de transferência` : null,
      c > 0 ? `${c} pedido(s) de compra` : null,
    ].filter(Boolean);
    return `${partes.join(" · ")} · destino final em ${destinos.join(", ")}`;
  };

  return (
    <DashboardShell
      user={{ name: sessao.usuario.name, email: sessao.usuario.email }}
      papel={sessao.usuario.papel}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-(--brand-petrol) dark:text-foreground">
              Triangulações
            </h1>
            <p className="text-muted-foreground">
              Transferências e pedidos de compra que passam por CDs intermediários até o
              destino final.
            </p>
          </div>
          <Badge variant="secondary" className="text-sm">
            {`Referência: ${dataBr(dataReferencia)}`}
          </Badge>
        </div>

        <Card>
          <CardContent className="grid gap-4 pt-6">
            {/* Formulário GET: o recorte vira URL e cabe num link. */}
            <form action="/triangulacoes" className="flex flex-wrap items-end gap-2">
              {fornecedor ? (
                <input type="hidden" name="fornecedor" value={fornecedor} />
              ) : null}
              <div className="space-y-1.5">
                <label htmlFor="produto" className="text-xs text-muted-foreground">
                  Produto
                </label>
                <Input
                  id="produto"
                  name="produto"
                  defaultValue={produto ?? ""}
                  placeholder="Código ou descrição…"
                  className="w-72"
                />
              </div>
              <Button type="submit" variant="outline">
                Filtrar
              </Button>
              {produto ? (
                <Button variant="ghost" render={<Link href={hrefSem("produto", fornecedor)} />}>
                  Limpar produto
                </Button>
              ) : null}
            </form>

            <FiltroFornecedor
              fornecedores={dados.fornecedores}
              atual={fornecedor}
              basePath="/triangulacoes"
            />
          </CardContent>
        </Card>

        {/* Valores separados por origem: as colunas de origem são diferentes
            (`valor` na nota, `saldo_ajustado` no pedido) e somá-las esconderia
            de qual das duas frentes o capital parado vem. */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className={TOM.transferencia.borda}>
            <CardContent className="pt-6">
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Truck className="size-4" />
                Em transferência
              </p>
              <p
                className={`font-mono text-2xl font-semibold tabular-nums ${TOM.transferencia.texto}`}
              >
                {moeda(dados.valorTransferencia)}
              </p>
              <p className="text-xs text-muted-foreground">
                {`${inteiro(dados.linhasTransferencia)} nota(s)`}
              </p>
            </CardContent>
          </Card>
          <Card className={TOM.compra.borda}>
            <CardContent className="pt-6">
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <ShoppingCart className="size-4" />
                Em compra
              </p>
              <p className={`font-mono text-2xl font-semibold tabular-nums ${TOM.compra.texto}`}>
                {moeda(dados.valorCompra)}
              </p>
              <p className="text-xs text-muted-foreground">
                {`${inteiro(dados.linhasCompra)} pedido(s)`}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Total em triangulação</p>
              <p className="font-mono text-2xl font-semibold text-(--brand-petrol) tabular-nums dark:text-foreground">
                {moeda(dados.valorTransferencia + dados.valorCompra)}
              </p>
              <p className="text-xs text-muted-foreground">
                {`${inteiro(dados.linhasTransferencia + dados.linhasCompra)} documento(s)`}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Produtos envolvidos</p>
              <p className="font-mono text-2xl font-semibold tabular-nums">
                {inteiro(dados.produtos.length)}
              </p>
            </CardContent>
          </Card>
        </div>

        {dados.semPercurso > 0 ? (
          <p className="text-xs text-muted-foreground">
            {`${inteiro(dados.semPercurso)} documento(s) com rota que não casa com o cadastro de filiais — o percurso deles aparece sem datas.`}
          </p>
        ) : null}

        {dados.produtos.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              Nenhuma triangulação em aberto nesta data.
            </CardContent>
          </Card>
        ) : (
          visiveis.map((p) => (
            <Card key={p.codigo}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link
                    href={`/produto/${encodeURIComponent(p.codigo)}`}
                    className="font-mono text-(--brand-petrol) underline underline-offset-2 dark:text-(--brand-turquoise)"
                  >
                    {p.codigo}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-base font-normal">
                    {p.descricao ?? "—"}
                  </span>
                  <span className="font-mono text-sm font-normal text-muted-foreground">
                    {`${num(p.quantidade)} un`}
                  </span>
                  {p.valorTransferencia > 0 ? (
                    <Badge
                      className={`font-mono ${TOM.transferencia.fundo} ${TOM.transferencia.texto}`}
                    >
                      {`Transf. ${moeda(p.valorTransferencia)}`}
                    </Badge>
                  ) : null}
                  {p.valorCompra > 0 ? (
                    <Badge className={`font-mono ${TOM.compra.fundo} ${TOM.compra.texto}`}>
                      {`Compra ${moeda(p.valorCompra)}`}
                    </Badge>
                  ) : null}
                </CardTitle>
                <CardDescription>
                  {resumo(p.linhas, p.destinos.map((d) => rotulo(d.filial)))}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-[1fr_auto]">
                {/* Percursos: cada documento com onde está e quando chega em
                    cada parada. A borda colorida separa compra de transferência. */}
                <div className="grid min-w-0 gap-2">
                  {p.linhas.map((l) => {
                    const tom = TOM[l.origem];
                    return (
                      <div
                        key={`${l.origem}-${l.id}`}
                        className={`rounded-md border bg-muted/25 p-2.5 ${tom.borda}`}
                      >
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span
                            className={`font-mono text-lg font-semibold tabular-nums ${tom.texto}`}
                          >
                            {num(l.quantidade)}
                            <span className="ml-1 text-xs font-normal text-muted-foreground">
                              un
                            </span>
                          </span>
                          <Badge variant="outline" className={`text-[10px] ${tom.texto}`}>
                            {tom.rotulo}
                          </Badge>
                          <span className="font-mono text-xs font-medium">
                            {tom.documento(l.documento)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {`${tom.data} ${dataIso(l.dataEmissao)}`}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">{l.rota}</span>
                          {/* Onde a mercadoria está agora: saiu do CD da perna atual. */}
                          <Badge variant="secondary" className="text-[10px]">
                            {l.origem === "transferencia"
                              ? `saiu de ${rotulo(l.origemAtual)}`
                              : `entrega em ${rotulo(l.origemAtual)}`}
                          </Badge>
                          {l.reprojetada ? (
                            <Badge variant="secondary" className="text-[10px]">
                              reprojetada
                            </Badge>
                          ) : null}
                          {l.valor ? (
                            <span className="ml-auto font-mono text-xs text-muted-foreground">
                              {moeda(l.valor)}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-2">
                          {l.etapas.length > 0 ? (
                            <WorkflowRota
                              etapas={l.etapas}
                              rotulo={rotulo}
                              tom={l.origem}
                              inicio={l.inicio}
                            />
                          ) : (
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                              Percurso sem data prevista: falta SLA ou a rota tem sigla fora do
                              cadastro de filiais.
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Posição no CD final: é o que diz se a triangulação é urgente. */}
                <div className="grid content-start gap-2 lg:w-64">
                  {p.destinos.map((d) => (
                    <div key={d.filial} className="rounded-md border bg-card p-3">
                      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                        <Layers className="size-4 shrink-0 text-muted-foreground" />
                        {`No destino ${rotulo(d.filial)}`}
                      </p>
                      <dl className="grid gap-1 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <dt className="flex items-center gap-1.5 text-muted-foreground">
                            <Boxes className="size-3.5" />
                            Estoque chão
                          </dt>
                          <dd
                            className={`font-mono font-semibold tabular-nums ${
                              d.estoqueChao <= 0 ? "text-red-700 dark:text-red-400" : ""
                            }`}
                          >
                            {num(d.estoqueChao)}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <dt className="flex items-center gap-1.5 text-muted-foreground">
                            <Truck className="size-3.5" />
                            Em transferência
                          </dt>
                          <dd className={`font-mono tabular-nums ${TOM.transferencia.texto}`}>
                            {num(d.emTransferencia)}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <dt className="flex items-center gap-1.5 text-muted-foreground">
                            <ShoppingCart className="size-3.5" />
                            Em pedidos de compra
                          </dt>
                          <dd className={`font-mono tabular-nums ${TOM.compra.texto}`}>
                            {num(d.emCompra)}
                          </dd>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 border-t pt-1">
                          <dt className="flex items-center gap-1.5 text-muted-foreground">
                            <TrendingUp className="size-3.5" />
                            Forecast do mês
                          </dt>
                          <dd className="font-mono font-semibold tabular-nums">
                            {d.forecastM0 === null ? "sem forecast" : num(d.forecastM0)}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}

        {paginas > 1 ? (
          <div className="flex items-center justify-end gap-2">
            <span className="text-sm text-muted-foreground">
              {`Página ${pagina} de ${paginas} · ${inteiro(dados.produtos.length)} produto(s)`}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagina <= 1}
              render={<Link href={hrefPagina(pagina - 1)} scroll={false} />}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagina >= paginas}
              render={<Link href={hrefPagina(pagina + 1)} scroll={false} />}
            >
              Próxima
            </Button>
          </div>
        ) : null}
      </div>
    </DashboardShell>
  );
}
