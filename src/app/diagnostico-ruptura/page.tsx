import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeftRight,
  BellRing,
  CalendarClock,
  CircleHelp,
  GitBranch,
  Search,
  Stethoscope,
  ZapOff,
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
import { FiltroFornecedor } from "@/components/visao-geral/filtro-fornecedor";
import { tomDaEtapa } from "@/components/diagnostico/tons-etapa";
import { GraficoSerra } from "@/components/diagnostico/grafico-serra";
import { PercursoTransferencia } from "@/components/diagnostico/percurso-transferencia";
import {
  ProvaDaCausa,
  SeloArvore,
  TrilhaArvore,
} from "@/components/diagnostico/trilha-arvore";
import { BotaoRecalcular } from "@/components/diagnostico/botao-recalcular";
import {
  carregarDetalhe,
  carregarDiagnostico,
} from "@/lib/diagnostico-ruptura/consultas";
import { carregarSerie } from "@/lib/diagnostico-ruptura/serie.server";
import { carregarPercursos } from "@/lib/diagnostico-ruptura/percurso.server";
import { lerDataReferencia } from "@/lib/data-referencia.server";
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
  fornecedor?: string | string[];
  bu?: string | string[];
  causa?: string | string[];
  herdadas?: string | string[];
  incompletas?: string | string[];
  balanceamento?: string | string[];
  aviso?: string | string[];
  pagina?: string | string[];
  abrir?: string | string[];
};

const primeiro = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

const num = (v: number) => Math.round(v).toLocaleString("pt-BR");

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

/** Primeiro dia do mês anterior ao da data. */
const mesAnteriorDe = (iso: string) => {
  const [ano, mes] = iso.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 2, 1)).toISOString().slice(0, 10);
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
  const fornecedor = primeiro(params.fornecedor);
  const bu = primeiro(params.bu);
  const causa = primeiro(params.causa);
  const herdadas = primeiro(params.herdadas) === "1";
  const incompletas = primeiro(params.incompletas) === "1";
  const balanceamento = primeiro(params.balanceamento) === "1";
  const avisoParam = primeiro(params.aviso);
  const aviso =
    avisoParam === "com" || avisoParam === "sem" ? avisoParam : undefined;
  const pagina = Number(primeiro(params.pagina) ?? 1) || 1;
  const abrir = Number(primeiro(params.abrir) ?? 0) || null;
  const ehAdmin = sessao.usuario.papel === "admin";

  const [dados, detalhe] = await Promise.all([
    carregarDiagnostico({
      produto,
      fornecedor,
      bu,
      causa,
      herdadas,
      incompletas,
      balanceamento,
      aviso,
      pagina,
    }),
    abrir ? carregarDetalhe(abrir) : Promise.resolve(null),
  ]);

  // A série só é consultada quando alguém abre uma linha, e é recortada a uma
  // posição: quatro consultas por índice, de milissegundos. A janela é maior
  // que a do diagnóstico de propósito — o dente de serra só conta a história
  // com os ciclos anteriores à ruptura dentro do quadro.
  // A série só é consultada quando alguém abre uma linha, e é recortada a uma
  // posição. A janela é a do sistema — mês anterior fechado mais o corrente —,
  // e não a da ruptura: o mês é a unidade em que esta operação pensa, e o
  // gráfico precisa mostrar o ciclo inteiro, não só o pedaço que rompeu.
  const referencia = await lerDataReferencia();
  const [serie, percursos] = detalhe
    ? await Promise.all([
        carregarSerie(detalhe.codigo, detalhe.filial, referencia),
        // Mesma janela do gráfico: o percurso de uma triangulação atravessa o
        // mês, e cortar em trinta dias esconderia a perna que começou antes.
        carregarPercursos(
          detalhe.codigo,
          detalhe.filial,
          mesAnteriorDe(referencia),
          referencia,
          referencia,
        ),
      ])
    : [null, []];

  // URLs montadas aqui: função não atravessa a fronteira servidor→cliente.
  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | undefined> = {
      produto,
      fornecedor,
      bu,
      causa,
      herdadas: herdadas ? "1" : undefined,
      incompletas: incompletas ? "1" : undefined,
      balanceamento: balanceamento ? "1" : undefined,
      aviso,
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
              {/* Quando a rodada foi calculada, ao lado do botão: sem isso
                  ninguém sabe se está olhando o retrato de hoje ou o da
                  semana passada. */}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {ehAdmin ? <BotaoRecalcular /> : null}
                <span className="text-xs text-muted-foreground">
                  {dados.calculadoEm
                    ? `calculado em ${dados.calculadoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
                    : "nunca calculado"}
                </span>
              </div>
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
                continuar com a duração de sempre.
                {ehAdmin
                  ? " Clique em recalcular — leva alguns segundos."
                  : " Peça a um administrador para recalcular."}
              </p>
              {ehAdmin ? (
                <div className="mt-4 flex justify-center">
                  <BotaoRecalcular />
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="grid gap-3 pt-6">
                {/* BU no mesmo padrão de /cockpit e /disponibilidade: pílulas
                    sólidas, com a contagem do recorte. Aqui com "Todas",
                    porque ruptura se olha pela rede inteira antes de recortar
                    — nas outras telas a BU é obrigatória porque o número que
                    elas mostram só faz sentido dentro de uma. */}
                {dados.bus.length > 1 ? (
                  <div className="flex flex-wrap items-center gap-1.5 border-b pb-2.5">
                    <span className="mr-1 text-sm font-medium text-muted-foreground">
                      BU
                    </span>
                    <Link
                      href={href({ bu: undefined, pagina: undefined })}
                      scroll={false}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        bu
                          ? "bg-muted text-muted-foreground hover:text-foreground"
                          : "bg-(--brand-petrol) text-white dark:bg-(--brand-turquoise) dark:text-(--brand-petrol)"
                      }`}
                    >
                      Todas
                      <span className="ml-1.5 font-mono text-xs tabular-nums opacity-80">
                        {num(dados.resumo.eventos)}
                      </span>
                    </Link>
                    {dados.bus.map((b) => {
                      const ativo = bu === b.valor;
                      return (
                        <Link
                          key={b.valor}
                          href={href({
                            bu: ativo ? undefined : b.valor,
                            pagina: undefined,
                          })}
                          scroll={false}
                          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                            ativo
                              ? "bg-(--brand-petrol) text-white dark:bg-(--brand-turquoise) dark:text-(--brand-petrol)"
                              : "bg-muted text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {b.valor === "—" ? "Sem BU" : b.valor}
                          <span
                            className={`ml-1.5 font-mono text-xs tabular-nums ${ativo ? "opacity-80" : "opacity-70"}`}
                          >
                            {num(b.eventos)}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}

                {/* Uma fileira, uma régua. A árvore devolve uma causa por
                    posição, então a soma dos chips é o total de posições — o
                    que a versão de duas réguas não conseguia prometer. */}
                <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  <GitBranch className="size-3" />
                  Causa, pela árvore de decisão
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Link
                    href={href({ causa: undefined, pagina: undefined })}
                    scroll={false}
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
                        scroll={false}
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

                {/* Onde a árvore ficou sem dado. É lista de tarefa de dados,
                    não de diagnóstico: cada nó diz qual carga repor primeiro.
                    Em setembro, 196 dos 458 eventos travaram em A2 porque a
                    carga de plano_compra de agosto perdeu os códigos num
                    reimport de Produtos. */}
                {dados.lacunas.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-dashed bg-muted/20 px-3 py-2 text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                      <CircleHelp className="size-3.5" />
                      Perguntas sem dado
                    </span>
                    {dados.lacunas.map((l) => (
                      <span key={l.no} className="text-muted-foreground">
                        <span className="font-mono">{l.no}</span>
                        <span className="font-mono font-medium tabular-nums">
                          {` ${num(l.eventos)}`}
                        </span>
                      </span>
                    ))}
                    <Link
                      href={href({
                        incompletas: incompletas ? undefined : "1",
                        pagina: undefined,
                      })}
                      scroll={false}
                      className={`ml-auto rounded border px-2 py-0.5 transition-colors ${
                        incompletas
                          ? "border-(--brand-petrol) bg-(--brand-petrol)/10 font-medium text-(--brand-petrol) dark:border-(--brand-turquoise) dark:text-(--brand-turquoise)"
                          : "hover:bg-muted"
                      }`}
                    >
                      {incompletas ? "ver todas" : "ver só estas"}
                    </Link>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-end gap-2">
                  <form
                    action="/diagnostico-ruptura"
                    className="flex flex-wrap items-end gap-2"
                  >
                    {fornecedor ? (
                      <input
                        type="hidden"
                        name="fornecedor"
                        value={fornecedor}
                      />
                    ) : null}
                    {causa ? (
                      <input type="hidden" name="causa" value={causa} />
                    ) : null}
                    {bu ? <input type="hidden" name="bu" value={bu} /> : null}
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
                    scroll={false}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors ${
                      herdadas
                        ? "border-(--brand-petrol) bg-(--brand-petrol)/10 font-medium text-(--brand-petrol) dark:border-(--brand-turquoise) dark:text-(--brand-turquoise)"
                        : "hover:bg-muted"
                    }`}
                  >
                    <CalendarClock className="size-4" />
                    Só herdadas da abertura
                  </Link>

                  {/* Cabia transferência: modificador, não causa — por isso
                      não disputa com os chips de cima. Vale em cima de
                      qualquer veredito, porque ruptura por pedido tardio
                      continua sendo pedido tardio ainda que uma transferência
                      a tivesse salvo. */}
                  {dados.resumo.comBalanceamento > 0 ? (
                    <Link
                      href={href({
                        balanceamento: balanceamento ? undefined : "1",
                        pagina: undefined,
                      })}
                      scroll={false}
                      className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors ${
                        balanceamento
                          ? "border-sky-500 bg-sky-500/10 font-medium text-sky-700 dark:text-sky-400"
                          : "hover:bg-muted"
                      }`}
                    >
                      <ArrowLeftRight className="size-4" />
                      Cabia transferência
                      <span className="font-mono text-xs tabular-nums opacity-70">
                        {num(dados.resumo.comBalanceamento)}
                      </span>
                    </Link>
                  ) : null}

                  {/* Avisou e ninguém agiu, contra caiu de uma vez. A primeira
                      é falha de execução, a segunda de planejamento — e o
                      veredito da árvore é o mesmo nas duas, porque o aviso não
                      muda o que falhou, muda se dava para reagir. */}
                  {dados.resumo.comAviso_ > 0 ? (
                    <Link
                      href={href({
                        aviso: aviso === "com" ? undefined : "com",
                        pagina: undefined,
                      })}
                      scroll={false}
                      className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors ${
                        aviso === "com"
                          ? "border-amber-500 bg-amber-500/10 font-medium text-amber-700 dark:text-amber-400"
                          : "hover:bg-muted"
                      }`}
                    >
                      <BellRing className="size-4" />
                      Avisou e ninguém agiu
                      <span className="font-mono text-xs tabular-nums opacity-70">
                        {num(dados.resumo.comAviso_)}
                      </span>
                    </Link>
                  ) : null}

                  {dados.resumo.semAviso > 0 ? (
                    <Link
                      href={href({
                        aviso: aviso === "sem" ? undefined : "sem",
                        pagina: undefined,
                      })}
                      scroll={false}
                      className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors ${
                        aviso === "sem"
                          ? "border-slate-500 bg-slate-500/10 font-medium text-slate-700 dark:text-slate-300"
                          : "hover:bg-muted"
                      }`}
                    >
                      <ZapOff className="size-4" />
                      Caiu de uma vez
                      <span className="font-mono text-xs tabular-nums opacity-70">
                        {num(dados.resumo.semAviso)}
                      </span>
                    </Link>
                  ) : null}
                </div>

                {/* Lista suspensa, como nas demais telas: são centenas de
                    fornecedores, e em chips a tela virava um paredão de nomes
                    antes de chegar ao conteúdo. */}
                <FiltroFornecedor
                  fornecedores={dados.fornecedores}
                  atual={fornecedor}
                  basePath="/diagnostico-ruptura"
                  extras={{
                    produto,
                    bu,
                    causa,
                    herdadas: herdadas ? "1" : undefined,
                    incompletas: incompletas ? "1" : undefined,
                    balanceamento: balanceamento ? "1" : undefined,
                    aviso,
                  }}
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
                      scroll={false}
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
                      <div className="min-w-0 space-y-0.5">
                        <SeloArvore arvore={l.arvore} />
                        {/* A frase da prova já na linha: quem varre a lista
                            entende o caso sem abrir o detalhe. Duas linhas no
                            máximo, senão a tabela deixa de ser tabela. */}
                        {l.resumo ? (
                          <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                            {l.resumo}
                          </p>
                        ) : null}
                        {l.diasAviso !== null && l.diasAviso > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                            <BellRing className="size-3" />
                            {`${l.diasAviso}d abaixo do Gatilho antes de zerar`}
                          </span>
                        ) : null}
                        {l.balanceamento ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-sky-700 dark:text-sky-400">
                            <ArrowLeftRight className="size-3" />
                            cabia transferência
                          </span>
                        ) : null}
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
                      scroll={false}
                      className="rounded-md border px-3 py-1.5 hover:bg-muted"
                    >
                      Anterior
                    </Link>
                  ) : null}
                  {dados.pagina < dados.paginas ? (
                    <Link
                      href={href({ pagina: String(dados.pagina + 1) })}
                      scroll={false}
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
                <CardContent className="space-y-4">
                  {/* O gráfico primeiro: a história inteira num olhar — o
                      estoque caindo, as entradas que o levantaram e as faixas
                      em que a prateleira ficou vazia. */}
                  {serie ? (
                    <GraficoSerra
                      serie={serie}
                      inicioDaRuptura={detalhe.inicio}
                    />
                  ) : null}

                  {/* A prova primeiro: a frase e os números que a decidiram,
                      mais a prescrição quando havia estoque na rede. É o que
                      vai para a ata. */}
                  <ProvaDaCausa evidencia={detalhe.evidencia} />

                  {/* Onde a mercadoria passou e quanto demorou em cada trecho.
                      É o que o veredito "triangulação lenta" deixa em aberto. */}
                  <PercursoTransferencia percursos={percursos} />

                  {/* E o percurso, para quem discorda da frase: a pessoa segue
                      as perguntas na ordem e confere o veredito sozinha. */}
                  <TrilhaArvore
                    arvore={detalhe.arvore}
                    trilha={detalhe.trilha}
                  />
                </CardContent>
              </Card>
            ) : null}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
