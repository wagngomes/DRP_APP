import Link from "next/link";
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  ShoppingCart,
  TrendingUp,
  Truck,
  Warehouse,
} from "lucide-react";

import { exigirSessao } from "@/lib/autorizacao";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WorkflowRota } from "@/components/produto/workflow-rota";
import { FiltroFornecedor } from "@/components/visao-geral/filtro-fornecedor";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  agruparPorDestino,
  agruparPorFornecedor,
  carregarTriangulacoes,
  type LinhaTriangulacao,
  type PosicaoDestino,
} from "@/lib/triangulacoes/consultas";
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
  /** Ramo aberto: fornecedor, produto dentro dele, CD dentro do produto. */
  forn?: string | string[];
  prod?: string | string[];
  cd?: string | string[];
};

/**
 * Fornecedores por página.
 *
 * O corte é no servidor e a expansão vai pela URL: só o ramo aberto é
 * renderizado. Mandar a hierarquia inteira ao navegador custaria 820 KB de
 * dado — e a versão plana desta tela já passou de 7 MB de HTML antes de ganhar
 * paginação.
 *
 * Os totais do topo continuam sendo os do recorte completo, não os da página.
 */
const POR_PAGINA = 15;

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

  // A hierarquia é montada aqui, sobre o mesmo dado: fornecedor -> produto ->
  // CD -> documento. Nenhuma consulta a mais.
  const porFornecedor = agruparPorFornecedor(dados.produtos);

  const fornAberto = primeiro(params.forn);
  const prodAberto = primeiro(params.prod);
  const cdAberto = primeiro(params.cd);

  const paginas = Math.max(1, Math.ceil(porFornecedor.length / POR_PAGINA));
  const pagina = Math.min(Math.max(1, pagPedida), paginas);
  const visiveis = porFornecedor.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  /** Link preservando filtros, página e o ramo aberto. */
  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | undefined> = {
      produto,
      fornecedor,
      pag: pagina > 1 ? String(pagina) : undefined,
      forn: fornAberto,
      prod: prodAberto,
      cd: cdAberto,
      ...extra,
    };
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/triangulacoes?${qs}` : "/triangulacoes";
  };

  // Abrir um nível fecha os de baixo: eles pertencem ao ramo anterior, e
  // mantê-los abertos mostraria o detalhe de um produto sob outro fornecedor.
  const hrefFornecedor = (f: string) =>
    href({ forn: fornAberto === f ? undefined : f, prod: undefined, cd: undefined });
  const hrefProduto = (c: string) =>
    href({ prod: prodAberto === c ? undefined : c, cd: undefined });
  const hrefCd = (f: string) => href({ cd: cdAberto === f ? undefined : f });

  const hrefPagina = (n: number) =>
    href({
      pag: n > 1 ? String(n) : undefined,
      forn: undefined,
      prod: undefined,
      cd: undefined,
    });

  const rotulo = (codigo: string | null) => (codigo ? rotulos.get(codigo) ?? codigo : "—");

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
          visiveis.map((f) => {
            const fAberto = fornAberto === f.fornecedor;
            return (
              <Card
                key={f.fornecedor}
                className={fAberto ? "ring-1 ring-(--brand-turquoise)/40" : ""}
              >
                {/* Primeiro nível: o fornecedor. O cabeçalho inteiro é o alvo
                    do clique — mira maior que um ícone de seta. */}
                <Link href={hrefFornecedor(f.fornecedor)} scroll={false} className="block">
                  <CardHeader className="transition-colors hover:bg-muted/40">
                    <CardTitle className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {fAberto ? (
                        <ChevronDown className="size-4 shrink-0 text-(--brand-turquoise)" />
                      ) : (
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{f.fornecedor}</span>
                      <span className="font-mono text-sm font-normal text-muted-foreground">
                        {f.produtos.length + " item(ns) · " + num(f.quantidade) + " un"}
                      </span>
                      {f.valorTransferencia > 0 ? (
                        <Badge
                          className={"font-mono " + TOM.transferencia.fundo + " " + TOM.transferencia.texto}
                        >
                          {"Transf. " + moeda(f.valorTransferencia)}
                        </Badge>
                      ) : null}
                      {f.valorCompra > 0 ? (
                        <Badge className={"font-mono " + TOM.compra.fundo + " " + TOM.compra.texto}>
                          {"Compra " + moeda(f.valorCompra)}
                        </Badge>
                      ) : null}
                    </CardTitle>
                  </CardHeader>
                </Link>

                {fAberto ? (
                  <CardContent className="grid gap-2">
                    {f.produtos.map((p) => {
                      const pAberto = prodAberto === p.codigo;
                      const destinos = pAberto ? agruparPorDestino(p.linhas) : [];
                      return (
                        <div key={p.codigo} className="rounded-lg border bg-muted/20">
                          {/* Segundo nível: o produto. */}
                          <Link
                            href={hrefProduto(p.codigo)}
                            scroll={false}
                            className="flex flex-wrap items-center gap-x-3 gap-y-1 p-2.5 transition-colors hover:bg-muted/40"
                          >
                            {pAberto ? (
                              <ChevronDown className="size-3.5 shrink-0 text-(--brand-turquoise)" />
                            ) : (
                              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <span className="font-mono text-sm font-semibold text-(--brand-petrol) dark:text-(--brand-turquoise)">
                              {p.codigo}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm">
                              {p.descricao ?? "—"}
                            </span>
                            <span className="font-mono text-xs text-muted-foreground">
                              {num(p.quantidade) + " un"}
                            </span>
                            {p.valorTransferencia > 0 ? (
                              <span className={"font-mono text-xs " + TOM.transferencia.texto}>
                                {moeda(p.valorTransferencia)}
                              </span>
                            ) : null}
                            {p.valorCompra > 0 ? (
                              <span className={"font-mono text-xs " + TOM.compra.texto}>
                                {moeda(p.valorCompra)}
                              </span>
                            ) : null}
                          </Link>

                          {pAberto ? (
                            <div className="grid gap-2 px-2.5 pb-2.5 pl-7">
                              {destinos.map((d) => {
                                const cAberto = cdAberto === d.filial;
                                return (
                                  <div key={d.filial} className="rounded-md border bg-card">
                                    {/* Terceiro nível: o CD onde a rota termina. */}
                                    <Link
                                      href={hrefCd(d.filial)}
                                      scroll={false}
                                      className="flex flex-wrap items-center gap-x-3 gap-y-1 p-2 transition-colors hover:bg-muted/40"
                                    >
                                      {cAberto ? (
                                        <ChevronDown className="size-3.5 shrink-0 text-(--brand-turquoise)" />
                                      ) : (
                                        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                                      )}
                                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-(--brand-petrol) px-2 py-0.5 text-white dark:bg-(--brand-turquoise) dark:text-(--brand-petrol)">
                                        <Warehouse className="size-3.5 shrink-0" />
                                        <span className="font-mono text-xs leading-none font-bold">
                                          {rotulo(d.filial)}
                                        </span>
                                      </span>
                                      <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                                        {d.linhas.length + " documento(s)"}
                                      </span>
                                      <span className="font-mono text-xs font-semibold">
                                        {num(d.quantidade) + " un"}
                                      </span>
                                      {d.valorTransferencia > 0 ? (
                                        <span className={"font-mono text-xs " + TOM.transferencia.texto}>
                                          {moeda(d.valorTransferencia)}
                                        </span>
                                      ) : null}
                                      {d.valorCompra > 0 ? (
                                        <span className={"font-mono text-xs " + TOM.compra.texto}>
                                          {moeda(d.valorCompra)}
                                        </span>
                                      ) : null}
                                    </Link>

                                    {/* Quarto nível: os documentos, com o
                                        percurso — o detalhe que a tela já
                                        mostrava, agora no lugar certo. */}
                                    {cAberto ? (
                                      <div className="grid gap-2 border-t p-2.5">
                                        {/* A situação do item neste CD é o que
                                            diz se a triangulação é urgente:
                                            chegar 800 unidades num centro com
                                            estoque zerado é outra conversa que
                                            chegar num que já tem trinta dias.
                                            Fica aqui, no CD, e não no produto:
                                            a posição é por centro, e no nível
                                            de cima ela obrigava a cruzar qual
                                            destino pertencia a qual número. */}
                                        <PosicaoNoDestino
                                          posicao={p.destinos.find((x) => x.filial === d.filial)}
                                        />
                                        {d.linhas.map((l) => (
                                          <Documento
                                            key={l.origem + "-" + l.id}
                                            linha={l}
                                            rotulo={rotulo}
                                          />
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </CardContent>
                ) : null}
              </Card>
            );
          })
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

/**
 * Um documento triangulando: a nota ou o pedido, com o percurso.
 *
 * Extraído para o quarto nível da hierarquia. Era o corpo do card de produto na
 * versão plana da tela; aqui vive sob o CD de destino, que é onde a pergunta
 * "qual nota traz isso para cá" finalmente faz sentido.
 */
function Documento({
  linha: l,
  rotulo,
}: {
  linha: LinhaTriangulacao;
  rotulo: (codigo: string | null) => string;
}) {
  const tom = TOM[l.origem];
  return (
    <div className={`rounded-md border bg-muted/25 p-2.5 ${tom.borda}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={`font-mono text-lg font-semibold tabular-nums ${tom.texto}`}>
          {num(l.quantidade)}
          <span className="ml-1 text-xs font-normal text-muted-foreground">un</span>
        </span>
        <Badge variant="outline" className={`text-[10px] ${tom.texto}`}>
          {tom.rotulo}
        </Badge>
        <span className="font-mono text-xs font-medium">{tom.documento(l.documento)}</span>
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
          <WorkflowRota etapas={l.etapas} rotulo={rotulo} tom={l.origem} inicio={l.inicio} />
        ) : (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Percurso sem data prevista: falta SLA ou a rota tem sigla fora do cadastro de
            filiais.
          </p>
        )}
      </div>
    </div>
  );
}

/** Situação do produto no CD onde a triangulação termina. */
function PosicaoNoDestino({ posicao }: { posicao: PosicaoDestino | undefined }) {
  if (!posicao) return null;

  const itens = [
    { rotulo: "Estoque chão", valor: num(posicao.estoqueChao), icone: Boxes },
    { rotulo: "Em transferência", valor: num(posicao.emTransferencia), icone: Truck },
    { rotulo: "Em compra", valor: num(posicao.emCompra), icone: ShoppingCart },
    {
      rotulo: "Forecast do mês",
      valor: posicao.forecastM0 === null ? "sem forecast" : num(posicao.forecastM0),
      icone: TrendingUp,
    },
  ];

  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs">
      {itens.map((i) => (
        <div key={i.rotulo} className="flex items-center gap-1.5">
          <i.icone className="size-3.5 shrink-0 text-muted-foreground" />
          <dt className="text-muted-foreground">{i.rotulo}</dt>
          <dd className="font-mono font-semibold tabular-nums">{i.valor}</dd>
        </div>
      ))}
    </dl>
  );
}
