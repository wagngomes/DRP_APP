import Link from "next/link";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  ChevronDown,
  ChevronRight,
  Handshake,
  Info,
  LineChart,
  PackageCheck,
  Search,
  ScanLine,
  Target,
  TrendingUp,
  UserRoundSearch,
  Users,
} from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { exigirSessao } from "@/lib/autorizacao";
import { CurvaAcumulada } from "@/components/aceleracao/curva-acumulada";
import type { ClienteFora, CurvaMes } from "@/lib/aceleracao/consultas";
import {
  carregarCurvas,
  carregarRaioX,
  listarMesesSop,
  type DivisaoSop,
  type GrupoContrato,
  type Medida,
  type RaioXProduto,
} from "@/lib/sop/consultas";
import { faixaAcuracidade } from "@/utils/acuracidade";

export const dynamic = "force-dynamic";

type SearchParams = {
  codigo?: string | string[];
  mes?: string | string[];
  /** Divisão aberta dentro da composição do consenso. */
  abrir?: string | string[];
};

const primeiro = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

/** Abre ou fecha uma divisão da composição, preservando produto e competência. */
function hrefAbrir(dados: RaioXProduto, abertaAtual: string | undefined, divisao: string): string {
  const p = new URLSearchParams({ codigo: dados.codigo, mes: dados.mes });
  if (abertaAtual !== divisao) p.set("abrir", divisao);
  return `/raio-x?${p.toString()}`;
}

/**
 * Cores das divisões do consenso.
 *
 * Só "Contratos" e "Spot" ganham cor própria: são as duas que a venda consegue
 * reconhecer, e portanto as únicas que a tela consegue medir. As demais ficam
 * em cinza, o que já diz que delas não há realizado.
 */
const COR_DIVISAO: Record<string, { barra: string; texto: string; fundo: string }> = {
  contratos: {
    barra: "bg-teal-500",
    texto: "text-teal-700 dark:text-teal-300",
    fundo: "bg-teal-500/10",
  },
  spot: {
    barra: "bg-amber-500",
    texto: "text-amber-700 dark:text-amber-400",
    fundo: "bg-amber-500/10",
  },
};

const NEUTRO = {
  barra: "bg-slate-400",
  texto: "text-muted-foreground",
  fundo: "bg-muted",
};

const corDivisao = (nome: string) => COR_DIVISAO[nome.toLowerCase()] ?? NEUTRO;

function num(v: number): string {
  return Math.round(v).toLocaleString("pt-BR");
}

function pct(v: number | null, casas = 1): string {
  return v === null ? "—" : `${(v * 100).toFixed(casas)}%`;
}

function mesBr(iso: string): string {
  const [ano, mes] = iso.split("-");
  const nomes = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  return `${nomes[Number(mes) - 1]} de ${ano}`;
}

/** Verde, âmbar ou vermelho pela régua de acuracidade — nunca por número solto na tela. */
const TOM_FAIXA = {
  boa: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  razoavel: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  ruim: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
  sem: "bg-muted text-muted-foreground",
} as const;

export default async function RaioX({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sessao = await exigirSessao();
  const params = await searchParams;

  const meses = await listarMesesSop();
  const mes = primeiro(params.mes) ?? meses[0];
  const codigo = primeiro(params.codigo);

  const abrir = primeiro(params.abrir);
  const [dados, curva] = await Promise.all([
    codigo && mes ? carregarRaioX(codigo, mes) : Promise.resolve(null),
    codigo && mes ? carregarCurvas(codigo, mes) : Promise.resolve(null),
  ]);

  return (
    <DashboardShell
      user={{ name: sessao.usuario.name, email: sessao.usuario.email }}
      papel={sessao.usuario.papel}
    >
      {/* Malha de pontos atrás da página inteira, não só do cabeçalho: dá a
          textura de painel sem disputar com os números, e é um único
          `radial-gradient` — nenhuma imagem, nenhum peso. A máscara a apaga na
          parte de baixo, senão ela compete com as tabelas. */}
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-[0.55] dark:opacity-30"
          style={{
            backgroundImage: "radial-gradient(var(--brand-turquoise) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            maskImage: "linear-gradient(to bottom, black, transparent)",
          }}
        />
      <div className="relative space-y-5">
        {/* Malha das telas de análise: dá profundidade ao cabeçalho sem
            competir com os números, e é CSS puro. */}
        <div className="relative overflow-hidden rounded-xl border bg-card p-6">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.07] dark:opacity-[0.12]"
            style={{
              backgroundImage:
                "linear-gradient(to right, var(--brand-petrol) 1px, transparent 1px)," +
                "linear-gradient(to bottom, var(--brand-petrol) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
              maskImage: "radial-gradient(ellipse 80% 120% at 30% 0%, black, transparent)",
            }}
          />
          <div className="relative space-y-4">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-medium tracking-widest text-muted-foreground uppercase">
                <ScanLine className="size-3.5" />
                Raio-X do produto
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-(--brand-petrol) dark:text-foreground">
                {dados ? (dados.descricao ?? dados.codigo) : "Composição da demanda"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {dados
                  ? `${dados.codigo}${dados.fornecedor ? ` · ${dados.fornecedor}` : ""} · ${mesBr(dados.mes)}`
                  : "De onde vem o consenso, quem está por trás dele e o que de fato aconteceu."}
              </p>
            </div>

            {/* GET simples: o recorte vira URL e o link é compartilhável. */}
            <form action="/raio-x" className="flex flex-wrap items-end gap-2">
              <div className="space-y-1.5">
                <label htmlFor="codigo" className="text-xs text-muted-foreground">
                  Código do produto
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="codigo"
                    name="codigo"
                    defaultValue={codigo ?? ""}
                    placeholder="Ex.: 203087"
                    className="w-52 pl-8"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="mes" className="text-xs text-muted-foreground">
                  Competência
                </label>
                <select
                  id="mes"
                  name="mes"
                  defaultValue={mes}
                  className="h-9 rounded-md border bg-transparent px-3 text-sm"
                >
                  {meses.map((m) => (
                    <option key={m} value={m}>
                      {mesBr(m)}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="submit"
                className="bg-(--brand-turquoise) text-(--brand-petrol) hover:bg-(--brand-turquoise)/90"
              >
                Analisar
              </Button>
            </form>
          </div>
        </div>

        {meses.length === 0 ? (
          <Vazio texto="Nenhuma competência de S&OP importada. Carregue a base SOP em Importar CSV." />
        ) : !codigo ? (
          <Vazio texto="Informe o código de um produto para ver a composição da demanda dele." />
        ) : !dados ? (
          <Vazio texto={`Produto ${codigo} não encontrado no cadastro.`} />
        ) : (
          <Painel dados={dados} curva={curva} abrir={abrir} />
        )}
      </div>
      </div>
    </DashboardShell>
  );
}

function Vazio({ texto }: { texto: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-14 text-center text-muted-foreground">{texto}</CardContent>
    </Card>
  );
}

function Painel({
  dados,
  curva,
  abrir,
}: {
  dados: RaioXProduto;
  curva: { curvas: CurvaMes[]; diaCorte: number; clientes: ClienteFora[] } | null;
  abrir?: string;
}) {
  const { acerto } = dados;

  // Ter S&OP e ter movimento são coisas separadas, e a primeira versão desta
  // tela tratava as duas como uma só: sem consenso, ela escondia tudo — venda,
  // forecast e recebimento incluídos, mesmo existindo. Um item que só entra no
  // S&OP em setembro tem agosto inteiro de história para mostrar.
  const temConsenso = dados.divisoes.length > 0;
  const temMovimento =
    dados.vendas.total !== 0 || dados.forecast.filiais > 0 || dados.recebido.notas > 0;

  if (!temConsenso && !temMovimento) {
    return (
      <Vazio
        texto={`Nenhum registro de ${dados.codigo} em ${mesBr(dados.mes)}: sem S&OP, sem venda, sem forecast e sem recebimento.`}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Falta de consenso é informação, não ausência de tela. Dito aqui, no
          topo, para ninguém ler os cards achando que o S&OP previu zero. */}
      {!temConsenso ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm dark:bg-amber-950/20">
          <Info className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-amber-800 dark:text-amber-300">
            {`Este produto não tem consenso de S&OP em ${mesBr(dados.mes)} — o que aparece abaixo é o que de fato aconteceu, sem previsão para comparar.`}
          </p>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icone={Target}
          rotulo="Consenso S&OP"
          valor={num(dados.consensoTotal)}
          apoio={`${dados.divisoes.length} divisão(ões)`}
        />
        <Kpi
          icone={Handshake}
          rotulo="Vendido no mês"
          valor={num(dados.vendas.total)}
          apoio={
            `${num(dados.vendas.comContrato)} com contrato · ${num(dados.vendas.spot)} spot` +
            (dados.vendas.spotDeGrupoContratado > 0
              ? ` (${num(dados.vendas.spotDeGrupoContratado)} de grupo contratado)`
              : "")
          }
          tom="turquesa"
        />
        {/* Os dois forecasts num card só, partido ao meio por uma linha
            pontilhada: são a mesma previsão antes e depois do ajuste, e o que
            interessa é a diferença entre elas. Em cards separados o leitor
            teria de subtrair de cabeça; empilhados sem divisória, leria os dois
            números como um só. O M0 fica maior porque é o oficial — o ajustado
            é leitura de apoio. */}
        <Card className="relative overflow-hidden border-t-4 border-t-amber-500">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-16 -right-16 size-40 rounded-full bg-amber-500/15 blur-2xl"
          />
          <CardContent className="relative pt-6">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Forecast
              </p>
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400">
                <TrendingUp className="size-4.5" />
              </span>
            </div>

            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="font-mono text-4xl font-semibold tracking-tight text-amber-700 tabular-nums dark:text-amber-400">
                {num(dados.forecast.m0)}
              </span>
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                M0
              </span>
            </div>

            <div className="my-2 border-t border-dashed" />

            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-2xl font-semibold text-sky-700 tabular-nums dark:text-sky-400">
                {num(dados.forecast.m0Ajustado)}
              </span>
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                ajustado
              </span>
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              {dados.forecast.snapshot
                ? `${dados.forecast.filiais} filial(is) · carga de ${dados.forecast.snapshot.toLocaleDateString("pt-BR", { timeZone: "UTC" })}`
                : "sem forecast nesta competência"}
            </p>
            {/* O ajuste só aparece quando existe: repetir "sem ajuste" em todo
                item treinaria o olho a ignorar a linha. */}
            {Math.abs(dados.forecast.m0Ajustado - dados.forecast.m0) > 0.5 ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-sky-700 dark:text-sky-400">
                {dados.forecast.m0Ajustado > dados.forecast.m0 ? (
                  <ArrowUpRight className="size-3" />
                ) : (
                  <ArrowDownRight className="size-3" />
                )}
                {`ajuste de ${num(Math.abs(dados.forecast.m0Ajustado - dados.forecast.m0))} un`}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Kpi
          icone={PackageCheck}
          tom="violeta"
          rotulo="Recebido"
          valor={num(dados.recebido.quantidade)}
          apoio={`${dados.recebido.notas} nota(s) de entrada`}
        />
      </div>

      {/* Acuracidade em destaque: o total pode acertar em cheio enquanto a
          composição erra feio, e é essa diferença que a tela existe para
          mostrar. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="size-4 text-(--brand-turquoise)" />
            Acerto da previsão
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Sem linha de S&OP, "0% de acerto" seria uma acusação falsa: não
              houve previsão errada, houve ausência de previsão. */}
          <Acerto
            rotulo="Consenso × vendido"
            medida={acerto.consenso}
            ausente={!temConsenso ? "sem consenso no mês" : undefined}
          />
          <Acerto rotulo="Forecast M0 × vendido" medida={acerto.forecastM0} />
          <Acerto rotulo="Forecast ajustado × vendido" medida={acerto.forecastAjustado} />
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Erro da composição (WMAPE)</p>
            <p
              className={`mt-1 inline-flex rounded-md px-2 py-0.5 font-mono text-2xl font-semibold tabular-nums ${
                TOM_FAIXA[faixaAcuracidade(acerto.composicao === null ? null : 1 - acerto.composicao)]
              }`}
            >
              {pct(acerto.composicao)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Quanto o rateio entre Contratos e Spot errou, ponderado pelo volume.
            </p>
          </div>
        </CardContent>
      </Card>

      {temConsenso ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Boxes className="size-4 text-(--brand-turquoise)" />
              Composição do consenso
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <BarraComposicao divisoes={dados.divisoes} total={dados.consensoTotal} />
            <div className="grid gap-2">
              {dados.divisoes.map((d) => (
                <LinhaDivisao
                  key={d.divisao}
                  divisao={d}
                  total={dados.consensoTotal}
                  contratos={d.divisao.toLowerCase() === "contratos" ? dados.contratos : null}
                  aberta={abrir === d.divisao}
                  href={hrefAbrir(dados, abrir, d.divisao)}
                  consensoContratos={dados.consensoContratos}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* A curva fica depois da composição: primeiro de onde a demanda deveria
          vir, depois como ela de fato chegou ao longo do mês. */}
      {curva && curva.curvas.length > 0 ? (
        <div className="grid gap-5 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <LineChart className="size-4 text-(--brand-turquoise)" />
                Venda acumulada no mês
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CurvaAcumulada
                curvas={curva.curvas}
                mesCorrente={dados.mes.slice(0, 7)}
                diaCorte={curva.diaCorte}
                grid
              />
            </CardContent>
          </Card>

          {/* Ao lado da curva, não abaixo: a curva mostra *que* o mês descolou,
              a lista mostra *quem* descolou. Separadas por uma rolagem, a
              segunda pergunta raramente chega a ser feita.

              Mesma regra da tela de aceleração, pela mesma função: cada cliente
              comparado consigo mesmo, mediana dos meses anteriores no mesmo
              recorte de dias. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserRoundSearch className="size-4 text-(--brand-turquoise)" />
                Comprando fora do padrão
              </CardTitle>
            </CardHeader>
            <CardContent>
              {curva.clientes.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum cliente comprou acima do próprio padrão neste mês.
                </p>
              ) : (
                <ul className="grid gap-2">
                  {curva.clientes.slice(0, 8).map((c) => (
                    <li key={c.cnpj} className="rounded-md border bg-muted/20 px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm" title={c.cliente}>
                          {c.cliente}
                        </span>
                        <Badge className="shrink-0 bg-rose-500/10 font-mono text-[11px] text-rose-700 dark:text-rose-400">
                          {`${c.fator.toFixed(1)}×`}
                        </Badge>
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        {c.grupo ? <span className="truncate">{c.grupo}</span> : null}
                        <span className="font-mono tabular-nums">
                          {`${num(c.atual)} un · padrão ${num(c.mediana)}`}
                        </span>
                        <span className="font-mono font-semibold text-rose-700 tabular-nums dark:text-rose-400">
                          {`+${num(c.excedente)}`}
                        </span>
                      </p>
                    </li>
                  ))}
                  {curva.clientes.length > 8 ? (
                    <li className="pt-1 text-center text-xs text-muted-foreground">
                      {`e mais ${curva.clientes.length - 8} cliente(s)`}
                    </li>
                  ) : null}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

    </div>
  );
}

/**
 * Cartão de número grande.
 *
 * O ícone vai num disco tinto em vez de solto ao lado do rótulo: dá peso visual
 * ao cartão sem aumentar a fonte, que é o que faria quatro cartões brigarem
 * entre si. O brilho no canto é um `radial-gradient` — zero peso.
 */
function Kpi({
  icone: Icone,
  rotulo,
  valor,
  apoio,
  tom = "petrol",
}: {
  icone: typeof Target;
  rotulo: string;
  valor: string;
  apoio: string;
  tom?: keyof typeof TOM_KPI;
}) {
  const t = TOM_KPI[tom];
  return (
    <Card className={`relative overflow-hidden ${t.borda}`}>
      <div
        aria-hidden
        className={`pointer-events-none absolute -top-16 -right-16 size-40 rounded-full blur-2xl ${t.brilho}`}
      />
      <CardContent className="relative pt-6">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {rotulo}
          </p>
          <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${t.disco}`}>
            <Icone className="size-4.5" />
          </span>
        </div>
        <p className="mt-2 font-mono text-4xl font-semibold tracking-tight text-(--brand-petrol) tabular-nums dark:text-foreground">
          {valor}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{apoio}</p>
      </CardContent>
    </Card>
  );
}

const TOM_KPI = {
  petrol: {
    borda: "border-t-4 border-t-(--brand-petrol) dark:border-t-(--brand-turquoise)",
    disco: "bg-(--brand-petrol)/10 text-(--brand-petrol) dark:bg-(--brand-turquoise)/15 dark:text-(--brand-turquoise)",
    brilho: "bg-(--brand-petrol)/10 dark:bg-(--brand-turquoise)/10",
  },
  turquesa: {
    borda: "border-t-4 border-t-(--brand-turquoise)",
    disco: "bg-(--brand-turquoise)/20 text-teal-700 dark:text-(--brand-turquoise)",
    brilho: "bg-(--brand-turquoise)/20",
  },
  ambar: {
    borda: "border-t-4 border-t-amber-500",
    disco: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    brilho: "bg-amber-500/15",
  },
  violeta: {
    borda: "border-t-4 border-t-violet-500",
    disco: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
    brilho: "bg-violet-500/15",
  },
} as const;

function Acerto({
  rotulo,
  medida,
  ausente,
}: {
  rotulo: string;
  medida: Medida;
  /** Texto a exibir quando não há previsão — diferente de previsão errada. */
  ausente?: string;
}) {
  if (ausente) {
    return (
      <div className="rounded-lg border border-dashed p-3">
        <p className="text-xs text-muted-foreground">{rotulo}</p>
        <p className="mt-1 font-mono text-2xl font-semibold text-muted-foreground tabular-nums">—</p>
        <p className="mt-1 text-xs text-muted-foreground">{ausente}</p>
      </div>
    );
  }
  const faixa = faixaAcuracidade(medida.acuracidade);
  const sobra = medida.vies !== null && medida.vies > 0;
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p
        className={`mt-1 inline-flex rounded-md px-2 py-0.5 font-mono text-2xl font-semibold tabular-nums ${TOM_FAIXA[faixa]}`}
      >
        {pct(medida.acuracidade)}
      </p>
      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        {medida.vies === null ? (
          "sem realizado para comparar"
        ) : (
          <>
            {sobra ? (
              <ArrowUpRight className="size-3 text-amber-600" />
            ) : (
              <ArrowDownRight className="size-3 text-sky-600" />
            )}
            {`previu ${sobra ? "a mais" : "a menos"}: ${pct(Math.abs(medida.vies))}`}
          </>
        )}
      </p>
    </div>
  );
}

/** A composição inteira numa barra: a proporção antes de qualquer número. */
function BarraComposicao({ divisoes, total }: { divisoes: DivisaoSop[]; total: number }) {
  if (total <= 0) return null;
  return (
    <div className="flex h-3 overflow-hidden rounded-full bg-muted">
      {divisoes
        .filter((d) => d.consenso > 0)
        .map((d) => (
          <div
            key={d.divisao}
            className={corDivisao(d.divisao).barra}
            style={{ width: `${(d.consenso / total) * 100}%` }}
            title={`${d.divisao}: ${num(d.consenso)}`}
          />
        ))}
    </div>
  );
}

function LinhaDivisao({
  divisao: d,
  total,
  contratos,
  aberta,
  href,
  consensoContratos,
}: {
  divisao: DivisaoSop;
  total: number;
  /** Detalhe a abrir sob a linha; só "Contratos" tem um. */
  contratos: RaioXProduto["contratos"] | null;
  aberta: boolean;
  href: string;
  consensoContratos: number;
}) {
  const cor = corDivisao(d.divisao);
  const parte = total > 0 ? d.consenso / total : 0;
  const podeAbrir = contratos !== null && contratos.grupos.length > 0;
  const confere = Math.abs(contratos ? contratos.total - consensoContratos : 0) < 0.5;

  const linha = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
      {podeAbrir ? (
        aberta ? (
          <ChevronDown className="size-4 shrink-0 text-(--brand-turquoise)" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        )
      ) : (
        <span className="size-4 shrink-0" />
      )}
      <span className={`size-2.5 shrink-0 rounded-full ${cor.barra}`} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.divisao}</span>
      <span className="font-mono text-xs text-muted-foreground tabular-nums">{pct(parte, 0)}</span>
      <span className={`font-mono text-sm font-semibold tabular-nums ${cor.texto}`}>
        {num(d.consenso)}
      </span>
      {/* Realizado ausente não é zero: a venda não carrega a marca da divisão,
          então não há como apurar. Dizer "0" seria afirmar que não vendeu. */}
      {d.realizado === null ? (
        <span className="w-28 text-right text-xs text-muted-foreground">sem apuração</span>
      ) : (
        <span className="w-28 text-right font-mono text-sm tabular-nums">
          {`→ ${num(d.realizado)}`}
        </span>
      )}
      <span
        className={`w-20 rounded-md px-1.5 py-0.5 text-right font-mono text-xs tabular-nums ${
          TOM_FAIXA[faixaAcuracidade(d.erro === null ? null : 1 - d.erro)]
        }`}
      >
        {d.erro === null ? "—" : `erro ${pct(d.erro, 0)}`}
      </span>
    </div>
  );

  return (
    <div className={`rounded-md border bg-muted/20 ${aberta ? "ring-1 ring-(--brand-turquoise)/40" : ""}`}>
      {podeAbrir ? (
        <Link href={href} scroll={false} className="block transition-colors hover:bg-muted/40">
          {linha}
        </Link>
      ) : (
        linha
      )}

      {/* O detalhe dos contratos vive aqui, sob a divisão que ele explica.
          Solto no fim da página, obrigava a ligar duas coisas distantes: o
          número de cima e a lista de baixo. */}
      {aberta && contratos ? (
        <div className="border-t bg-card px-3 py-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary" className="gap-1">
              <Users className="size-3" />
              {`${contratos.clientes} cliente(s) em ${contratos.grupos.length} grupo(s)`}
            </Badge>
            {confere ? (
              <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                confere com o S&amp;OP
              </Badge>
            ) : (
              <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400">
                {`difere do S&OP em ${num(Math.abs(contratos.total - consensoContratos))} un`}
              </Badge>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-2 text-left font-medium">Grupo</th>
                  <th className="py-2 text-left font-medium">Representante</th>
                  <th className="py-2 text-right font-medium">Clientes</th>
                  <th className="py-2 text-right font-medium">Qtd inicial</th>
                  <th className="py-2 text-right font-medium">Qtd final</th>
                  <th className="py-2 text-right font-medium">Vendido</th>
                  <th className="py-2 text-right font-medium">Fora do contrato</th>
                  <th className="py-2 text-right font-medium">Atingimento</th>
                </tr>
              </thead>
              <tbody>
                {contratos.grupos.map((g) => (
                  <LinhaGrupo key={g.grupo} grupo={g} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LinhaGrupo({ grupo: g }: { grupo: GrupoContrato }) {
  const atingimento = g.contratado > 0 ? g.vendido / g.contratado : null;
  return (
    <tr className="border-b last:border-0 hover:bg-muted/40">
      <td className="py-2">
        <div className="flex items-center gap-2">
          <Link
            href={`/produto?q=${encodeURIComponent(g.grupo)}`}
            className="truncate font-medium"
            title={g.grupo}
          >
            {g.grupo}
          </Link>
          {/* Quem veio do arquivo e não do cadastro merece marca: é grupo que
              ninguém cadastrou, e a soma dele não conversa com as outras telas. */}
          {g.origem === "arquivo" ? (
            <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
              fora do cadastro
            </Badge>
          ) : null}
        </div>
      </td>
      <td className="py-2 text-xs text-muted-foreground">
        {/* Um representante em 177 dos 186 grupos. Quando há mais, dizer
            quantos é mais honesto que escolher um e omitir o resto. */}
        {g.representante ??
          (g.representantes > 1 ? `${g.representantes} representantes` : "—")}
      </td>
      <td className="py-2 text-right font-mono text-xs text-muted-foreground tabular-nums">
        {g.clientes}
      </td>
      <td className="py-2 text-right font-mono text-muted-foreground tabular-nums">
        {num(g.quantidadeInicial)}
      </td>
      <td className="py-2 text-right font-mono font-semibold tabular-nums">
        {num(g.contratado)}
      </td>
      <td className="py-2 text-right font-mono tabular-nums">{num(g.vendido)}</td>
      {/* Compra de outro CNPJ do mesmo grupo. Não entra no atingimento — o
          contrato é com o CNPJ — mas dizer que o grupo comprou por fora é
          informação comercial, e escondê-la no Spot faria o Spot parecer
          demanda nova. */}
      <td className="py-2 text-right font-mono text-xs tabular-nums text-muted-foreground">
        {g.vendidoForaDoContrato > 0 ? num(g.vendidoForaDoContrato) : "—"}
      </td>
      <td className="py-2 text-right">
        <span
          className={`inline-block rounded-md px-1.5 py-0.5 font-mono text-xs tabular-nums ${
            atingimento === null
              ? TOM_FAIXA.sem
              : atingimento >= 0.9
                ? TOM_FAIXA.boa
                : atingimento >= 0.6
                  ? TOM_FAIXA.razoavel
                  : TOM_FAIXA.ruim
          }`}
        >
          {pct(atingimento, 0)}
        </span>
      </td>
    </tr>
  );
}
