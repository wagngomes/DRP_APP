import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertOctagon,
  ArrowRight,
  Factory,
  Info,
  ListChecks,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  Truck,
} from "lucide-react";

import { auth } from "@/lib/auth";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BotaoGerar } from "@/components/cockpit/botao-gerar";
import { SeletorVista, type Vista } from "@/components/cockpit/seletor-vista";
import { FiltroBu } from "@/components/cockpit/filtro-bu";
import { ListaCompleta } from "@/components/cockpit/lista-completa";
import { lerAnalise, type Avisos, type ContextoItem } from "@/lib/ia/persistencia";
import type { ItemAnalise } from "@/lib/ia/schema";
import { lerDataReferencia } from "@/lib/data-referencia.server";
import { ORDEM_SECOES, ROTULO_SECAO, type Secao } from "@/lib/riscos/tipos";
import { dataBr, inteiro } from "@/lib/visao-geral/formato";

export const dynamic = "force-dynamic";

type SearchParams = {
  vista?: string | string[];
  bu?: string | string[];
  /** Qual lista completa está aberta (seção ou curva). */
  lista?: string | string[];
  pag?: string | string[];
  q?: string | string[];
};

const primeiro = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

/** Cor e ícone por seção — do mais urgente ao mais informativo. */
const ESTILO: Record<Secao, { icone: typeof AlertOctagon; cor: string; borda: string }> = {
  urgente: {
    icone: AlertOctagon,
    cor: "text-red-700 dark:text-red-400",
    borda: "border-red-500/50",
  },
  recomendada: {
    icone: ListChecks,
    cor: "text-amber-700 dark:text-amber-400",
    borda: "border-amber-500/50",
  },
  alerta: {
    icone: TriangleAlert,
    cor: "text-sky-700 dark:text-sky-300",
    borda: "border-sky-500/50",
  },
  aviso: {
    icone: Info,
    cor: "text-muted-foreground",
    borda: "border-foreground/20",
  },
};

function num(v: number | null, casas = 0): string {
  return v === null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: casas });
}

export default async function Cockpit({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const params = await searchParams;

  const data = await lerDataReferencia();
  const gravada = await lerAnalise(data);

  const vista: Vista = primeiro(params.vista) === "curva" ? "curva" : "criticidade";
  const bu = primeiro(params.bu);
  const listaAberta = primeiro(params.lista);
  const pagina = Number(primeiro(params.pag) ?? 1) || 1;
  const busca = primeiro(params.q) ?? "";

  /** URLs preservando vista e BU — o recorte inteiro cabe num link. */
  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (vista === "curva") p.set("vista", vista);
    if (bu) p.set("bu", bu);
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/cockpit?${qs}` : "/cockpit";
  };

  const contexto = new Map(
    (gravada?.resultado.contexto ?? []).map((c) => [`${c.codigo}|${c.filial}`, c])
  );
  const todos = gravada?.resultado.todos ?? [];

  // BUs disponíveis com o total de posições em risco de cada uma.
  const busMapa = new Map<string, number>();
  for (const t of todos) busMapa.set(t.bu, (busMapa.get(t.bu) ?? 0) + 1);
  const bus = [...busMapa.entries()]
    .map(([valor, total]) => ({ valor, total }))
    .sort((a, b) => (a.valor === "—" ? 1 : b.valor === "—" ? -1 : b.total - a.total));

  /** O filtro vale para tudo: itens comentados, contadores e lista completa. */
  const noRecorte = (b: string) => (bu ? b === bu : true);
  const todosFiltrados = todos.filter((t) => noRecorte(t.bu));
  const itensFiltrados = (gravada?.resultado.analise.itens ?? []).filter((i) =>
    noRecorte(contexto.get(`${i.codigo}|${i.filial}`)?.bu ?? "—")
  );

  // Contadores recalculados sobre o recorte, senão o cartão mostra 907 com a
  // seção listando 3.
  const totais = Object.fromEntries(
    ORDEM_SECOES.map((s) => [
      s,
      s === "aviso"
        ? (gravada?.resultado.totais.aviso ?? 0)
        : todosFiltrados.filter((t) => t.secao === s).length,
    ])
  ) as Record<Secao, number>;

  const porSecao = (itens: ItemAnalise[], secao: Secao) =>
    itens.filter((i) => i.secao === secao);

  const porCurva = new Map<string, ItemAnalise[]>();
  for (const item of itensFiltrados) {
    const c = contexto.get(`${item.codigo}|${item.filial}`)?.curva ?? "—";
    porCurva.set(c, [...(porCurva.get(c) ?? []), item]);
  }
  const ordemAbc = ["A", "B", "C"];
  const curvas = [...porCurva.keys()].sort(
    (a, b) =>
      (ordemAbc.indexOf(a) === -1 ? 99 : ordemAbc.indexOf(a)) -
      (ordemAbc.indexOf(b) === -1 ? 99 : ordemAbc.indexOf(b))
  );

  return (
    <DashboardShell user={{ name: session.user.name, email: session.user.email }}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-(--brand-petrol) dark:text-foreground">
              Cockpit
            </h1>
            <p className="text-muted-foreground">
              Riscos priorizados por IA sobre os números do dia.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {gravada ? <SeletorVista atual={vista} /> : null}
            <Badge variant="secondary" className="text-sm">
              {`Referência: ${dataBr(data)}`}
            </Badge>
            <BotaoGerar temAnalise={gravada !== null} />
          </div>
        </div>

        {gravada && bus.length > 1 ? (
          <Card>
            <CardContent className="pt-6">
              <FiltroBu bus={bus} atual={bu} vista={vista} />
            </CardContent>
          </Card>
        ) : null}

        {!gravada ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Sparkles className="size-8 text-(--brand-turquoise)" />
              <div>
                <p className="font-medium text-(--brand-petrol) dark:text-foreground">
                  Nenhuma análise para {dataBr(data)}
                </p>
                <p className="mt-1 max-w-lg text-sm text-muted-foreground">
                  A geração roda os motores de risco sobre todas as posições e envia as mais
                  críticas para o modelo priorizar. Leva 2 a 3 minutos e fica gravada — abrir
                  esta tela de novo não gera custo nem espera.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="size-4 text-(--brand-turquoise)" />
                  Briefing do dia
                </CardTitle>
                <CardDescription>
                  {`${gravada.resultado.totalPosicoes.toLocaleString("pt-BR")} posições avaliadas · ` +
                    `${gravada.resultado.analisadas.enviadas} das ${inteiro(gravada.resultado.analisadas.disponiveis)} em risco enviadas ao modelo · ` +
                    `gerada em ${gravada.criadoEm.toLocaleString("pt-BR")} · ${gravada.modelo}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed">{gravada.resultado.analise.briefing}</p>
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {ORDEM_SECOES.map((s) => {
                const e = ESTILO[s];
                return (
                  <div
                    key={s}
                    className={`rounded-lg border-l-4 bg-card p-3 ring-1 ring-foreground/5 ${e.borda}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground">{ROTULO_SECAO[s]}</p>
                        <p className="font-mono text-2xl font-semibold tabular-nums">
                          {inteiro(totais[s] ?? 0)}
                        </p>
                      </div>
                      <e.icone className={`size-5 shrink-0 ${e.cor}`} />
                    </div>
                  </div>
                );
              })}
            </div>

            {gravada.resultado.analise.temas.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Padrões</CardTitle>
                  <CardDescription>
                    O que se repete entre vários itens — em geral é aqui que está a causa.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {gravada.resultado.analise.temas.map((t, i) => (
                    <div key={i} className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-sm font-semibold text-(--brand-petrol) dark:text-foreground">
                        {t.titulo}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{t.resumo}</p>
                      {t.codigos.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {t.codigos.map((c) => (
                            <Link
                              key={c}
                              href={`/produto/${encodeURIComponent(c)}`}
                              className="rounded-md bg-background px-1.5 py-0.5 font-mono text-xs ring-1 ring-foreground/10 hover:ring-foreground/30"
                            >
                              {c}
                            </Link>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            {vista === "criticidade"
              ? ORDEM_SECOES.filter((s) => s !== "aviso").map((secao) => {
                  const itens = porSecao(itensFiltrados, secao);
                  const daSecao = todosFiltrados.filter((t) => t.secao === secao);
                  if (itens.length === 0 && daSecao.length === 0) return null;
                  const e = ESTILO[secao];
                  return (
                    <Card key={secao} className={`border-t-4 ${e.borda}`}>
                      <CardHeader>
                        <CardTitle className={`flex items-center gap-2 text-lg ${e.cor}`}>
                          <e.icone className="size-5" />
                          {ROTULO_SECAO[secao]}
                          <span className="font-mono text-2xl font-bold tabular-nums">
                            {inteiro(totais[secao] ?? 0)}
                          </span>
                        </CardTitle>
                        <CardDescription>
                          {itens.length > 0
                            ? `A IA destacou ${itens.length}; as demais estão na lista completa abaixo.`
                            : "Nenhuma destacada pela IA neste recorte — veja a lista completa."}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid gap-3">
                          {itens.map((item, i) => (
                            <ItemCard
                              key={`${item.codigo}-${item.filial}-${i}`}
                              item={item}
                              ctx={contexto.get(`${item.codigo}|${item.filial}`)}
                              borda={e.borda}
                            />
                          ))}
                        </div>
                        <ListaCompleta
                          itens={daSecao}
                          chave={secao}
                          rotulo={ROTULO_SECAO[secao]}
                          aberta={listaAberta === secao}
                          pagina={pagina}
                          busca={busca}
                          href={href}
                        />
                      </CardContent>
                    </Card>
                  );
                })
              : curvas.map((curva) => (
                  <Card key={curva} className="border-t-4 border-(--brand-turquoise)">
                    <CardHeader>
                      <CardTitle className="text-lg">
                        {curva === "—" ? "Sem curva" : `Curva ${curva}`}
                        <span className="ml-2 font-mono text-2xl font-bold tabular-nums">
                          {inteiro(todosFiltrados.filter((t) => t.curva === curva).length)}
                        </span>
                      </CardTitle>
                      <CardDescription>
                        {`A IA destacou ${porCurva.get(curva)!.length} nesta curva; as demais estão na lista completa ao fim.`}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      {ORDEM_SECOES.map((secao) => {
                        const daSecao = porCurva
                          .get(curva)!
                          .filter((i) => i.secao === secao);
                        if (daSecao.length === 0) return null;
                        const e = ESTILO[secao];

                        // Dentro da seção, um bloco por fornecedor: é assim que a
                        // conversa com o laboratório acontece.
                        const fornecedores = new Map<string, typeof daSecao>();
                        for (const i of daSecao) {
                          const f = contexto.get(`${i.codigo}|${i.filial}`)?.fornecedor ?? "—";
                          fornecedores.set(f, [...(fornecedores.get(f) ?? []), i]);
                        }

                        return (
                          <div key={secao} className="space-y-2">
                            <p
                              className={`flex items-center gap-1.5 border-b pb-1 text-sm font-semibold ${e.cor}`}
                            >
                              <e.icone className="size-4" />
                              {ROTULO_SECAO[secao]}
                              <span className="font-mono font-normal text-muted-foreground">
                                {daSecao.length}
                              </span>
                            </p>
                            {[...fornecedores.entries()]
                              .sort((a, b) => b[1].length - a[1].length)
                              .map(([fornecedor, itens]) => (
                                <div key={fornecedor} className="space-y-2 pl-1">
                                  <p className="flex items-center gap-1.5 text-sm font-medium">
                                    <Factory className="size-3.5 shrink-0 text-muted-foreground" />
                                    {fornecedor}
                                    <span className="font-mono text-xs text-muted-foreground">
                                      {itens.length}
                                    </span>
                                  </p>
                                  <div className="grid gap-2 pl-5">
                                    {itens.map((item, i) => (
                                      <ItemCard
                                        key={`${item.codigo}-${item.filial}-${i}`}
                                        item={item}
                                        ctx={contexto.get(`${item.codigo}|${item.filial}`)}
                                        borda={e.borda}
                                      />
                                    ))}
                                  </div>
                                </div>
                              ))}
                          </div>
                        );
                      })}

                      <ListaCompleta
                        itens={todosFiltrados.filter((t) => t.curva === curva)}
                        chave={`curva:${curva}`}
                        rotulo={curva === "—" ? "sem curva" : `curva ${curva}`}
                        aberta={listaAberta === `curva:${curva}`}
                        pagina={pagina}
                        busca={busca}
                        href={href}
                      />
                    </CardContent>
                  </Card>
                ))}

            <SecaoAvisos avisos={gravada.resultado.avisos} />
          </>
        )}
      </div>
    </DashboardShell>
  );
}

/**
 * Seção Avisos: o que não é item × CD.
 *
 * Aceleração de venda é item × cliente e lacuna de cadastro não tem posição —
 * nenhum dos dois cabe na lista de itens, e foi por isso que os avisos
 * apareceram zerados na primeira versão desta tela.
 */
function SecaoAvisos({ avisos }: { avisos?: Avisos }) {
  // Análises gravadas antes desta seção existir não têm o campo. Some em vez de
  // quebrar a tela; a próxima geração já vem completa.
  const anomalias = avisos?.vendas?.anomalias ?? [];
  const lacunas = avisos?.lacunas ?? [];
  if (anomalias.length === 0 && lacunas.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-muted-foreground">
          <Info className="size-5" />
          {ROTULO_SECAO.aviso}
        </CardTitle>
        <CardDescription>
          Contexto e qualidade de dado — não exigem ação imediata, mas explicam ou
          limitam o que as outras seções conseguem enxergar.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {anomalias.length > 0 ? (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 border-b pb-1 text-sm font-semibold">
              <TrendingUp className="size-4 text-(--brand-green)" />
              Aceleração de venda por cliente
              <span className="font-mono text-xs font-normal text-muted-foreground">
                {`mês ${avisos!.vendas.mesAnalisado} contra ${avisos!.vendas.baseline.join(", ")}`}
              </span>
            </p>
            <div className="grid gap-1.5">
              {anomalias.map((a, i) => (
                <div
                  key={`${a.codigo}-${a.cliente}-${i}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-muted/30 px-3 py-2 text-sm"
                >
                  <Link
                    href={`/produto/${encodeURIComponent(a.codigo)}`}
                    className="font-mono font-semibold text-(--brand-petrol) underline underline-offset-2 dark:text-(--brand-turquoise)"
                  >
                    {a.codigo}
                  </Link>
                  <span className="min-w-0 flex-1 truncate">{a.cliente}</span>
                  {a.grupo ? (
                    <Badge variant="secondary" className="text-xs">
                      {a.grupo}
                    </Badge>
                  ) : null}
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {`${num(a.mediana)}/mês → ${num(a.mesAtual)}`}
                  </span>
                  <Badge className="bg-(--brand-green)/15 font-mono text-(--brand-green)">
                    {`${a.fator.toFixed(1)}x`}
                  </Badge>
                  <span className="font-mono text-xs font-semibold tabular-nums">
                    {`+${num(a.excedente)} un`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {lacunas.length > 0 ? (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 border-b pb-1 text-sm font-semibold">
              <TriangleAlert className="size-4 text-amber-600" />
              Cadastros faltando
            </p>
            <div className="grid gap-1.5">
              {lacunas.map((l) => (
                <div
                  key={l.rotulo}
                  className="flex flex-wrap items-baseline gap-x-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"
                >
                  <span className="font-mono font-semibold tabular-nums">
                    {inteiro(l.quantidade)}
                  </span>
                  <span>{l.rotulo}</span>
                  <span className="text-xs text-muted-foreground">— {l.efeito}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Um item: o texto do modelo em cima, os números que o sustentam embaixo. */
function ItemCard({
  item,
  ctx,
  borda,
}: {
  item: ItemAnalise;
  ctx?: ContextoItem;
  borda: string;
}) {
  const { titulo, justificativa, acao, codigo, filial } = item;
  return (
    <div className={`rounded-lg border-l-4 bg-card p-3 ring-1 ring-foreground/5 ${borda}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link
          href={`/produto/${encodeURIComponent(codigo)}`}
          className="font-mono text-sm font-semibold text-(--brand-petrol) underline underline-offset-2 dark:text-(--brand-turquoise)"
        >
          {codigo}
        </Link>
        <Badge variant="secondary" className="font-mono">
          {`CD ${filial}`}
        </Badge>
        {ctx ? (
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {ctx.descricao ?? "—"} · {ctx.fornecedor}
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-sm font-medium">{titulo}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">{justificativa}</p>

      <p className="mt-2 flex items-start gap-1.5 text-sm">
        <ArrowRight className="mt-0.5 size-4 shrink-0 text-(--brand-green)" />
        <span>{acao}</span>
      </p>

      {/* Os números do modelo vieram daqui; ficam visíveis para conferência. */}
      {ctx ? (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t pt-2 text-[11px] text-muted-foreground">
          <span>{`Forecast ${num(ctx.forecast)} un`}</span>
          <span>{`Chão ${num(ctx.estoqueChao)} un`}</span>
          <span>{`${num(ctx.diasChao, 1)} dias`}</span>
          {ctx.dataRuptura ? <span>{`Rompe ${dataBr(ctx.dataRuptura)}`}</span> : null}
          <span className="font-medium">{`${num(ctx.diasDescobertos)} dias descobertos`}</span>
          {ctx.limiteCompra ? (
            <span className="inline-flex items-center gap-1">
              <ShoppingCart className="size-3" />
              {`Limite ${dataBr(ctx.limiteCompra)}`}
            </span>
          ) : null}
          {ctx.chegada ? (
            <span className="inline-flex items-center gap-1">
              {ctx.chegada.origem === "compra" ? (
                <ShoppingCart className="size-3" />
              ) : (
                <Truck className="size-3" />
              )}
              {`${num(ctx.chegada.quantidade)} un em ${dataBr(ctx.chegada.data)}`}
              {ctx.chegada.reprojetada ? " (reprojetada)" : ""}
            </span>
          ) : (
            <span>Nada a caminho</span>
          )}
          {ctx.transferencia ? (
            <span className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-300">
              <Truck className="size-3" />
              {`Sugerido: ${num(ctx.transferencia.quantidade)} un de ${ctx.transferencia.origem}`}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
