import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Flame, TrendingUp, Users, X } from "lucide-react";

import { auth } from "@/lib/auth";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CurvaAcumulada } from "@/components/aceleracao/curva-acumulada";
import { Quadrantes } from "@/components/aceleracao/quadrantes";
import { FiltroFornecedor } from "@/components/visao-geral/filtro-fornecedor";
import {
  carregarAceleracao,
  carregarDetalheItem,
  carregarJanela,
  DIAS_RISCO,
  type FiltrosAceleracao,
} from "@/lib/aceleracao/consultas";
import { lerDataReferencia } from "@/lib/data-referencia.server";
import { VAZIO } from "@/lib/fornecedores/agregacao";
import { dataBr, inteiro } from "@/lib/visao-geral/formato";
import { faixaDe } from "@/utils/dias-estoque";

export const dynamic = "force-dynamic";

type SearchParams = {
  bu?: string | string[];
  curva?: string | string[];
  fornecedor?: string | string[];
  produto?: string | string[];
  foco?: string | string[];
  item?: string | string[];
  pag?: string | string[];
};

const POR_PAGINA = 25;

const primeiro = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

function num(v: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function umaCasa(v: number | null): string {
  return v === null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/**
 * Cores da cobertura reaproveitando as variáveis das faixas de disponibilidade
 * — mesma escala de leitura nas duas telas, definida num lugar só no CSS.
 */
function estiloDias(dias: number | null): React.CSSProperties {
  const id = faixaDe(dias);
  if (!id) return { backgroundColor: "var(--muted)", color: "var(--muted-foreground)" };
  return {
    backgroundColor: `var(--faixa-${id})`,
    color: `var(--faixa-${id}-ink)`,
  };
}

const FOCOS = [
  { id: "todos", rotulo: "Todos os acelerados" },
  { id: "multi", rotulo: "Com 2+ clientes fora do padrão" },
  { id: "risco", rotulo: `Cobertura abaixo de ${DIAS_RISCO} dias` },
] as const;

export default async function Aceleracao({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const params = await searchParams;
  const bu = primeiro(params.bu);
  const curva = primeiro(params.curva);
  const fornecedor = primeiro(params.fornecedor);
  const produto = primeiro(params.produto);
  const focoParam = primeiro(params.foco);
  const foco = (FOCOS.some((f) => f.id === focoParam) ? focoParam : "todos") as
    NonNullable<FiltrosAceleracao["foco"]>;
  const item = primeiro(params.item);
  const pagPedida = Number(primeiro(params.pag) ?? 1) || 1;

  const dataReferencia = await lerDataReferencia();
  // A janela é lida uma vez e compartilhada: as duas consultas dependiam dela e
  // cada uma a relia, em sequência. Com ela pronta, as duas correm juntas.
  const janela = await carregarJanela();
  const [dados, detalhe] = await Promise.all([
    carregarAceleracao(dataReferencia, { bu, curva, fornecedor, produto, foco }, janela),
    item ? carregarDetalheItem(item, janela) : null,
  ]);

  const paginas = Math.max(1, Math.ceil(dados.itens.length / POR_PAGINA));
  const pagina = Math.min(Math.max(1, pagPedida), paginas);
  const visiveis = dados.itens.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  const selecionado = dados.itens.find((i) => i.codigo === item);

  /** Preserva o recorte ao trocar um filtro; qualquer troca volta à página 1. */
  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (bu) p.set("bu", bu);
    if (curva) p.set("curva", curva);
    if (fornecedor) p.set("fornecedor", fornecedor);
    if (produto) p.set("produto", produto);
    if (foco !== "todos") p.set("foco", foco);
    if (item) p.set("item", item);
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined) p.delete(k);
      else p.set(k, v);
    }
    const qs = p.toString();
    return qs ? `/aceleracao?${qs}` : "/aceleracao";
  };


  /** Filtros atuais em texto, para o gráfico montar os links no cliente. */
  const filtrosQuery = (() => {
    const p = new URLSearchParams();
    if (bu) p.set("bu", bu);
    if (curva) p.set("curva", curva);
    if (fornecedor) p.set("fornecedor", fornecedor);
    if (produto) p.set("produto", produto);
    if (foco !== "todos") p.set("foco", foco);
    return p.toString();
  })();

  return (
    <DashboardShell user={{ name: session.user.name, email: session.user.email }}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-(--brand-petrol) dark:text-foreground">
              Aceleração de vendas
            </h1>
            <p className="text-muted-foreground">
              Itens vendendo acima do plano na visão Cia, e os clientes que puxaram.
            </p>
          </div>
          <Badge variant="secondary" className="text-sm">
            {`Referência: ${dataBr(dataReferencia)}`}
          </Badge>
        </div>

        <Card>
          <CardContent className="grid gap-4 pt-6">
            {/* Formulário GET: a busca vira URL e o recorte inteiro cabe num link. */}
            <form action="/aceleracao" className="flex flex-wrap items-end gap-2">
              {bu ? <input type="hidden" name="bu" value={bu} /> : null}
              {curva ? <input type="hidden" name="curva" value={curva} /> : null}
              {fornecedor ? (
                <input type="hidden" name="fornecedor" value={fornecedor} />
              ) : null}
              {foco !== "todos" ? <input type="hidden" name="foco" value={foco} /> : null}
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
                Buscar
              </Button>
              {produto ? (
                <Button
                  variant="ghost"
                  render={<Link href={href({ produto: undefined, pag: undefined })} />}
                >
                  Limpar
                </Button>
              ) : null}
            </form>

            <div className="flex flex-wrap items-center gap-1.5">
              {FOCOS.map((f) => (
                <Chip key={f.id} href={href({ foco: f.id, pag: undefined })} ativo={foco === f.id}>
                  {`${f.rotulo} (${inteiro(dados.totaisFoco[f.id])})`}
                </Chip>
              ))}
            </div>

            {dados.curvas.length > 1 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-sm font-medium text-muted-foreground">Curva</span>
                <Chip href={href({ curva: undefined, pag: undefined })} ativo={!curva}>
                  Todas
                </Chip>
                {dados.curvas.map((c) => (
                  <Chip key={c} href={href({ curva: c, pag: undefined })} ativo={curva === c}>
                    {c === VAZIO ? "Sem curva" : c}
                  </Chip>
                ))}
              </div>
            ) : null}

            {dados.bus.length > 1 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-sm font-medium text-muted-foreground">BU</span>
                <Chip href={href({ bu: undefined, pag: undefined })} ativo={!bu}>
                  Todas
                </Chip>
                {dados.bus.map((b) => (
                  <Chip key={b} href={href({ bu: b, pag: undefined })} ativo={bu === b}>
                    {b === VAZIO ? "Sem BU" : b}
                  </Chip>
                ))}
              </div>
            ) : null}

            <FiltroFornecedor
              fornecedores={dados.fornecedores}
              atual={fornecedor}
              basePath="/aceleracao"
            />
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Cartao
            titulo="Itens acelerados"
            valor={inteiro(dados.totaisFoco.todos)}
            nota={
              bu || curva || fornecedor || produto
                ? `no recorte · ${inteiro(dados.totalAcelerados)} no total`
                : `de ${inteiro(dados.totalUniverso)} com forecast`
            }
            icone={<Flame className="size-4" />}
          />
          <Cartao
            titulo="Com 2+ clientes fora do padrão"
            valor={inteiro(dados.totaisFoco.multi)}
            nota="aceleração difusa, não pico isolado"
            icone={<Users className="size-4" />}
            destaque
          />
          <Cartao
            titulo={`Cobertura abaixo de ${DIAS_RISCO} dias`}
            valor={inteiro(dados.totaisFoco.risco)}
            nota="no ritmo que está acontecendo"
            icone={<TrendingUp className="size-4" />}
          />
          <Cartao
            titulo="Excedente sobre o padrão"
            valor={num(dados.excedenteTotal)}
            nota="unidades acima da mediana dos clientes"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          {`Aceleração medida contra o forecast do mês, proporcional aos dias decorridos. Os clientes comparam os dias 1 a ${dados.diaCorte} de ${dados.mesCorrente} com os dias 1 a ${dados.diaCorte} de ${dados.mesesBaseline.join(", ") || "—"}.`}
        </p>

        <Card>
          <CardHeader>
            <CardTitle>Aceleração x cobertura</CardTitle>
            <CardDescription>
              Cada bolha é um item. Quanto mais à direita, mais acima do plano está vendendo;
              quanto mais abaixo, menos dias de estoque restam no ritmo real. A região
              destacada é onde as duas coisas acontecem juntas. Clique numa bolha para abrir
              o item.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Quadrantes
              pontos={dados.itens.map((i) => ({
                codigo: i.codigo,
                descricao: i.descricao,
                indice: i.indice,
                dias: i.diasNoRitmoReal,
                excedente: i.excedente,
                clientesFora: i.clientesFora,
              }))}
              selecionado={item}
              diasRisco={DIAS_RISCO}
              filtros={filtrosQuery}
            />
          </CardContent>
        </Card>

        {detalhe ? (
          <Card className="border-(--brand-turquoise)">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Link
                  href={`/produto/${encodeURIComponent(detalhe.codigo)}`}
                  className="font-mono text-(--brand-petrol) underline underline-offset-2 dark:text-(--brand-turquoise)"
                >
                  {detalhe.codigo}
                </Link>
                <span className="min-w-0 flex-1 truncate text-base font-normal">
                  {selecionado?.descricao ?? "—"}
                </span>
                {selecionado ? (
                  <Badge variant="secondary" className="font-mono">
                    {`índice ${selecionado.indice.toFixed(2)}`}
                  </Badge>
                ) : (
                  <Badge variant="secondary">fora do recorte atual</Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  render={<Link href={href({ item: undefined })} scroll={false} />}
                >
                  <X className="size-4" />
                  Fechar
                </Button>
              </CardTitle>
              <CardDescription>
                {`Venda acumulada dia a dia. A linha vermelha é ${dados.mesCorrente}; a tracejada marca o dia ${dados.diaCorte}, último com dado.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 xl:grid-cols-[1fr_24rem]">
              <CurvaAcumulada
                curvas={detalhe.curvas}
                mesCorrente={detalhe.mesCorrente}
                diaCorte={detalhe.diaCorte}
              />

              <div>
                <p className="mb-2 text-sm font-semibold">
                  {`Clientes fora do padrão (${detalhe.clientes.length})`}
                </p>
                {detalhe.clientes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhum cliente isolado explica esta aceleração — o aumento está diluído
                    entre muitos, o que costuma indicar forecast defasado e não pedido pontual.
                  </p>
                ) : (
                  <div className="max-h-[15rem] overflow-auto rounded-md border">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-card">
                        <TableRow>
                          <TableHead className="text-xs">Cliente</TableHead>
                          <TableHead className="text-right text-xs">Mês</TableHead>
                          <TableHead className="text-right text-xs">Padrão</TableHead>
                          <TableHead className="text-right text-xs">Excedente</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detalhe.clientes.map((c) => (
                          <TableRow key={c.cnpj}>
                            <TableCell className="max-w-52 py-1.5">
                              <span className="block truncate text-xs" title={c.cliente}>
                                {c.cliente}
                              </span>
                              {c.grupo ? (
                                <span className="block truncate text-[10px] text-muted-foreground">
                                  {c.grupo}
                                </span>
                              ) : null}
                            </TableCell>
                            <TableCell className="py-1.5 text-right font-mono text-xs tabular-nums">
                              {num(c.atual)}
                            </TableCell>
                            <TableCell className="py-1.5 text-right font-mono text-xs tabular-nums text-muted-foreground">
                              {num(c.mediana)}
                            </TableCell>
                            <TableCell className="py-1.5 text-right font-mono text-xs font-semibold tabular-nums text-red-700 dark:text-red-400">
                              {`+${num(c.excedente)}`}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{`${inteiro(dados.itens.length)} item(ns) neste recorte`}</CardTitle>
            <CardDescription>
              Ordenado pelo excedente — as unidades que a aceleração acrescentou. Clique no
              item para ver a curva do mês e os clientes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[36rem] overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead className="text-center">Curva</TableHead>
                    <TableHead className="text-right">Índice</TableHead>
                    <TableHead className="text-right">Vendido</TableHead>
                    <TableHead className="text-right">Forecast</TableHead>
                    <TableHead className="text-center">Clientes</TableHead>
                    <TableHead className="text-right">Excedente</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Dias real</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Dias plano</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
                        Nenhum item neste recorte.
                      </TableCell>
                    </TableRow>
                  ) : (
                    visiveis.map((i) => (
                      <TableRow
                        key={i.codigo}
                        className={i.codigo === item ? "bg-muted/60" : undefined}
                      >
                        <TableCell className="font-mono">
                          <Link
                            href={href({ item: i.codigo })}
                            scroll={false}
                            className="text-(--brand-petrol) underline underline-offset-2 dark:text-(--brand-turquoise)"
                          >
                            {i.codigo}
                          </Link>
                        </TableCell>
                        <TableCell
                          className="max-w-56 truncate text-xs text-muted-foreground"
                          title={i.descricao ?? ""}
                        >
                          {i.descricao ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-36 truncate text-xs">{i.fornecedor}</TableCell>
                        <TableCell className="text-center text-xs">{i.curva}</TableCell>
                        <TableCell className="text-right font-mono font-semibold tabular-nums text-red-700 dark:text-red-400">
                          {i.indice.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {num(i.vendido)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                          {num(i.forecast)}
                        </TableCell>
                        <TableCell className="text-center">
                          {i.clientesFora === 0 ? (
                            <span className="font-mono text-muted-foreground/40">0</span>
                          ) : (
                            <Badge
                              variant={i.clientesFora >= 2 ? "default" : "secondary"}
                              className="font-mono"
                            >
                              {i.clientesFora}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {i.excedente > 0 ? `+${num(i.excedente)}` : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className="inline-block rounded px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums"
                            style={estiloDias(i.diasNoRitmoReal)}
                          >
                            {umaCasa(i.diasNoRitmoReal)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                          {umaCasa(i.diasNoPlano)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {paginas > 1 ? (
              <div className="mt-3 flex items-center justify-end gap-2">
                <span className="text-sm text-muted-foreground">
                  {`Página ${pagina} de ${paginas}`}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagina <= 1}
                  render={<Link href={href({ pag: String(pagina - 1) })} scroll={false} />}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagina >= paginas}
                  render={<Link href={href({ pag: String(pagina + 1) })} scroll={false} />}
                >
                  Próxima
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}

function Cartao({
  titulo,
  valor,
  nota,
  icone,
  destaque,
}: {
  titulo: string;
  valor: string;
  nota: string;
  icone?: React.ReactNode;
  destaque?: boolean;
}) {
  return (
    <Card className={destaque ? "border-l-4 border-(--brand-turquoise)" : undefined}>
      <CardContent className="pt-6">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {icone}
          {titulo}
        </p>
        <p className="font-mono text-3xl font-semibold tabular-nums">{valor}</p>
        <p className="text-xs text-muted-foreground">{nota}</p>
      </CardContent>
    </Card>
  );
}

function Chip({
  href,
  ativo,
  children,
}: {
  href: string;
  ativo: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        ativo
          ? "bg-(--brand-petrol) text-white dark:bg-(--brand-turquoise) dark:text-(--brand-petrol)"
          : "bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
