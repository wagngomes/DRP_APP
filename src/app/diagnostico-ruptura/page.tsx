import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  Filter,
  Search,
  Stethoscope,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { FiltroLista } from "@/components/ui/filtro-lista";
import {
  BarraCausas,
  tomDaEtapa,
} from "@/components/diagnostico/barra-causas";
import {
  carregarDetalhe,
  carregarDiagnostico,
} from "@/lib/diagnostico-ruptura/consultas";
import { exigirSessao } from "@/lib/autorizacao";

/**
 * Diagnóstico de ruptura: por que cada posição item × CD está sem estoque.
 *
 * Lê só as tabelas do motor, que já têm o resultado calculado — nenhuma conta
 * em tempo de request. O cálculo roda quando alguém clica em recalcular, não
 * no fim da importação: a carga diária continua com a duração de hoje, e uma
 * falha aqui nunca derruba o que está no ar.
 *
 * O que a tela mostra são as rupturas **de agora**, que é a pauta da reunião
 * semanal. Ruptura já resolvida não tem ação pendente.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Diagnóstico de ruptura · DRP_AI" };

type SearchParams = {
  produto?: string | string[];
  forn?: string | string[];
  causa?: string | string[];
  herdadas?: string | string[];
  pagina?: string | string[];
  abrir?: string | string[];
};

const primeiro = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

const num = (v: number) =>
  Math.round(v).toLocaleString("pt-BR");

const moeda = (v: number) =>
  v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });

const dataBr = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

/** Tom do selo de confiança. Baixa chama atenção; alta não precisa. */
const TOM_CONFIANCA: Record<string, string> = {
  alta: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  media: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  baixa: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
};

export default async function DiagnosticoRuptura({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sessao = await exigirSessao();
  const params = await searchParams;

  const produto = primeiro(params.produto);
  const fornecedor = primeiro(params.forn);
  const causa = primeiro(params.causa);
  const herdadas = primeiro(params.herdadas) === "1";
  const pagina = Number(primeiro(params.pagina) ?? 1) || 1;
  const abrir = Number(primeiro(params.abrir) ?? 0) || null;

  const [dados, detalhe] = await Promise.all([
    carregarDiagnostico({ produto, fornecedor, causa, herdadas, pagina }),
    abrir ? carregarDetalhe(abrir) : Promise.resolve(null),
  ]);

  // URLs montadas aqui: função não atravessa a fronteira servidor→cliente.
  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | undefined> = {
      produto,
      forn: fornecedor,
      causa,
      herdadas: herdadas ? "1" : undefined,
      pagina: pagina > 1 ? String(pagina) : undefined,
      abrir: abrir ? String(abrir) : undefined,
      ...extra,
    };
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/diagnostico-ruptura?${qs}` : "/diagnostico-ruptura";
  };

  const vazio = dados.calculadoEm === null;

  return (
    <DashboardShell
      user={{ name: sessao.usuario.name, email: sessao.usuario.email }}
      papel={sessao.usuario.papel}
    >
      <div className="space-y-5">
        <div className="relative overflow-hidden rounded-xl border bg-card p-6">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.07] dark:opacity-[0.12]"
            style={{
              backgroundImage:
                "linear-gradient(to right, var(--brand-petrol) 1px, transparent 1px)," +
                "linear-gradient(to bottom, var(--brand-petrol) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
              maskImage:
                "radial-gradient(ellipse 80% 120% at 30% 0%, black, transparent)",
            }}
          />
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-medium tracking-widest text-muted-foreground uppercase">
                <Stethoscope className="size-3.5" />
                Causa raiz
              </p>
              <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-(--brand-petrol) dark:text-foreground">
                Diagnóstico de ruptura
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Por que cada posição está sem estoque, com a prova de cada
                causa. Só o que está rompido na data de referência.
              </p>
            </div>

            {!vazio ? (
              <div className="flex shrink-0 flex-wrap gap-6">
                <div className="min-w-24 text-right">
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">
                    Posições
                  </p>
                  <p className="font-mono text-2xl font-bold text-(--brand-petrol) tabular-nums dark:text-(--brand-turquoise)">
                    {num(dados.resumo.eventos)}
                  </p>
                </div>
                <div className="min-w-24 text-right">
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">
                    Dias sem estoque
                  </p>
                  <p className="font-mono text-2xl font-bold tabular-nums">
                    {num(dados.resumo.dias)}
                  </p>
                </div>
                <div className="min-w-32 text-right">
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">
                    Valor a custo
                  </p>
                  <p className="font-mono text-2xl font-bold text-rose-600 tabular-nums dark:text-rose-400">
                    {moeda(dados.resumo.valorPerdido)}
                  </p>
                </div>
                <div className="min-w-28 text-right">
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">
                    Herdadas
                  </p>
                  <p className="font-mono text-2xl font-bold tabular-nums">
                    {num(dados.resumo.herdadas)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    já contratadas na abertura
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {vazio ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Stethoscope className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 font-medium text-(--brand-petrol) dark:text-foreground">
                O motor ainda não rodou
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                O diagnóstico é calculado sob demanda, para a importação diária
                continuar com a duração de sempre. Peça a um administrador para
                recalcular.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="grid gap-3 pt-6">
                {/* Chips por causa: o número antecipa o resultado do clique,
                    porque é contado sem o próprio filtro de causa aplicado. */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <Link
                    href={href({ causa: undefined, pagina: undefined })}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      causa
                        ? "hover:bg-muted"
                        : "border-(--brand-petrol) bg-(--brand-petrol) text-white dark:border-(--brand-turquoise) dark:bg-(--brand-turquoise) dark:text-slate-900"
                    }`}
                  >
                    {`Todas · ${num(dados.resumo.eventos)}`}
                  </Link>
                  {dados.contagens.map((c) => {
                    const ativa = causa === c.slug;
                    return (
                      <Link
                        key={c.slug}
                        href={href({
                          causa: ativa ? undefined : c.slug,
                          pagina: undefined,
                        })}
                        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                          ativa
                            ? "border-foreground/40 bg-muted font-medium"
                            : "hover:bg-muted"
                        }`}
                      >
                        <span
                          className={`size-2 shrink-0 rounded-full ${tomDaEtapa(c.etapa).barra}`}
                        />
                        {c.rotulo}
                        <span className="font-mono tabular-nums opacity-60">
                          {num(c.eventos)}
                        </span>
                      </Link>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-end gap-2">
                  <form
                    action="/diagnostico-ruptura"
                    className="flex flex-wrap items-end gap-2"
                  >
                    {fornecedor ? (
                      <input type="hidden" name="forn" value={fornecedor} />
                    ) : null}
                    {causa ? (
                      <input type="hidden" name="causa" value={causa} />
                    ) : null}
                    <div className="w-full space-y-1.5 sm:w-auto">
                      <label
                        htmlFor="produto"
                        className="text-xs text-muted-foreground"
                      >
                        Produto
                      </label>
                      <Input
                        id="produto"
                        name="produto"
                        defaultValue={produto ?? ""}
                        placeholder="Código ou descrição"
                        className="h-9 w-full sm:w-56"
                      />
                    </div>
                    <Button type="submit" variant="outline">
                      <Search className="size-4" />
                      Buscar
                    </Button>
                  </form>

                  <Link
                    href={href({
                      herdadas: herdadas ? undefined : "1",
                      pagina: undefined,
                    })}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors ${
                      herdadas
                        ? "border-(--brand-petrol) bg-(--brand-petrol)/10 font-medium text-(--brand-petrol) dark:border-(--brand-turquoise) dark:text-(--brand-turquoise)"
                        : "hover:bg-muted"
                    }`}
                  >
                    <CalendarClock className="size-4" />
                    Só herdadas da abertura
                  </Link>
                </div>

                <FiltroLista
                  rotulo="Fornecedor"
                  atual={fornecedor}
                  hrefTodos={href({ forn: undefined, pagina: undefined })}
                  opcoes={dados.fornecedores.map((f) => ({
                    valor: f,
                    rotulo: f,
                    href: href({ forn: f, pagina: undefined }),
                  }))}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {`${num(dados.total)} posição(ões) em ruptura`}
                </CardTitle>
                <CardDescription>
                  Ordenado por dias sem estoque. Clique numa linha para ver a
                  prova de cada causa.
                  {dados.resumo.comAviso > 0 ? (
                    <>
                      {" "}
                      <span className="text-amber-700 dark:text-amber-400">
                        {`${num(dados.resumo.comAviso)} com o balanço divergindo do estoque real — diagnóstico menos confiável nelas.`}
                      </span>
                    </>
                  ) : null}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {dados.linhas.map((l) => {
                  const aberta = abrir === l.id;
                  return (
                    <Link
                      key={l.id}
                      href={href({ abrir: aberta ? undefined : String(l.id) })}
                      className={`grid grid-cols-1 items-center gap-x-4 gap-y-2 rounded-md border p-3 transition-colors hover:bg-muted/40 sm:grid-cols-[minmax(0,14rem)_4rem_5rem_7rem_minmax(0,1fr)] ${
                        aberta ? "border-foreground/30 bg-muted/50" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <span className="block truncate font-mono text-sm font-medium">
                          {l.codigo}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {l.descricao ?? "—"}
                        </span>
                      </div>
                      <span className="font-mono text-sm tabular-nums">
                        {l.filial}
                      </span>
                      <span className="font-mono text-sm font-semibold tabular-nums">
                        {`${l.dias}d`}
                      </span>
                      <span className="font-mono text-sm text-rose-600 tabular-nums dark:text-rose-400">
                        {moeda(l.valorPerdido)}
                      </span>
                      <div className="min-w-0">
                        <BarraCausas causas={l.causas} />
                      </div>
                    </Link>
                  );
                })}

                {dados.linhas.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Nenhuma ruptura neste recorte.
                  </p>
                ) : null}
              </CardContent>
            </Card>

            {dados.paginas > 1 ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {`Página ${dados.pagina} de ${dados.paginas}`}
                </span>
                <div className="flex gap-2">
                  {dados.pagina > 1 ? (
                    <Link
                      href={href({ pagina: String(dados.pagina - 1) })}
                      className="rounded-md border px-3 py-1.5 hover:bg-muted"
                    >
                      Anterior
                    </Link>
                  ) : null}
                  {dados.pagina < dados.paginas ? (
                    <Link
                      href={href({ pagina: String(dados.pagina + 1) })}
                      className="rounded-md border px-3 py-1.5 hover:bg-muted"
                    >
                      Próxima
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}

            {detalhe ? (
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-base">
                        {`${detalhe.codigo} · CD ${detalhe.filial}`}
                      </CardTitle>
                      <CardDescription>
                        {[
                          detalhe.descricao,
                          detalhe.fornecedor,
                          `rompido desde ${dataBr(detalhe.inicio)}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge className={TOM_CONFIANCA[detalhe.confianca]}>
                        {`confiança ${detalhe.confianca}`}
                      </Badge>
                      {detalhe.avisoReplay ? (
                        <Badge className="gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="size-3" />
                          balanço não fecha
                        </Badge>
                      ) : null}
                      {detalhe.herdada ? (
                        <Badge variant="secondary">herdada da abertura</Badge>
                      ) : null}
                      <Link
                        href={`/raio-x?codigo=${encodeURIComponent(detalhe.codigo)}`}
                        className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
                      >
                        Abrir no Raio-X
                      </Link>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* O teste de cada etapa. Causa levou dias; observação é a
                      regra que falhou sem ter causado a ruptura — aparece
                      porque é um erro real, e sem dias porque não foi ela. */}
                  {detalhe.causas.map((c) => {
                    const prova = detalhe.evidencias.find(
                      (e) => e.slug === c.slug,
                    )?.dados as Record<string, unknown> | undefined;
                    const valores = prova?.valores as
                      | Record<string, unknown>
                      | undefined;
                    return (
                      <div
                        key={c.slug}
                        className="rounded-md border bg-muted/20 p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`size-2.5 shrink-0 rounded-full ${tomDaEtapa(c.etapa).barra}`}
                          />
                          <span className="text-sm font-medium">
                            {c.rotulo}
                          </span>
                          {c.papel === "causa" ? (
                            <span className="font-mono text-sm font-semibold tabular-nums">
                              {`${c.dias.toFixed(1)} dias · ${Math.round(c.percentual)}%`}
                            </span>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-muted-foreground"
                            >
                              falhou, mas não causou a ruptura
                            </Badge>
                          )}
                          <span className="ml-auto text-xs text-muted-foreground">
                            {c.dono}
                          </span>
                        </div>
                        {valores ? (
                          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                            {Object.entries(valores).map(([k, v]) => (
                              <div key={k} className="min-w-0">
                                <dt className="truncate text-muted-foreground">
                                  {k.replaceAll("_", " ")}
                                </dt>
                                <dd className="truncate font-mono tabular-nums">
                                  {typeof v === "number"
                                    ? num(v)
                                    : String(v ?? "—")}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        ) : null}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ) : null}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
