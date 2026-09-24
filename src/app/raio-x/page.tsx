import Link from "next/link";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  FileSignature,
  Handshake,
  Info,
  PackageCheck,
  Search,
  ScanLine,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { exigirSessao } from "@/lib/autorizacao";
import {
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
};

const primeiro = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

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

  const dados = codigo && mes ? await carregarRaioX(codigo, mes) : null;

  return (
    <DashboardShell
      user={{ name: sessao.usuario.name, email: sessao.usuario.email }}
      papel={sessao.usuario.papel}
    >
      <div className="space-y-5">
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
          <Painel dados={dados} />
        )}
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

function Painel({ dados }: { dados: RaioXProduto }) {
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
          destaque
        />
        {/* Os dois forecasts no mesmo card: são a mesma previsão antes e
            depois do ajuste do analista, e o que interessa é a diferença
            entre eles — separá-los em dois cards obrigaria a subtrair de
            cabeça. */}
        <Card>
          <CardContent className="pt-6">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <TrendingUp className="size-4" />
              Forecast
            </p>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span>
                <span className="font-mono text-3xl font-semibold text-(--brand-petrol) tabular-nums dark:text-foreground">
                  {num(dados.forecast.m0)}
                </span>
                <span className="ml-1 text-xs text-muted-foreground">M0</span>
              </span>
              <span>
                <span className="font-mono text-xl font-semibold tabular-nums">
                  {num(dados.forecast.m0Ajustado)}
                </span>
                <span className="ml-1 text-xs text-muted-foreground">ajustado</span>
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {dados.forecast.snapshot
                ? `${dados.forecast.filiais} filial(is) · carga de ${dados.forecast.snapshot.toLocaleDateString("pt-BR", { timeZone: "UTC" })}`
                : "sem forecast nesta competência"}
            </p>
            {/* O ajuste só aparece quando existe: repetir "sem ajuste" em todo
                item treinaria o olho a ignorar a linha. */}
            {Math.abs(dados.forecast.m0Ajustado - dados.forecast.m0) > 0.5 ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
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
              <LinhaDivisao key={d.divisao} divisao={d} total={dados.consensoTotal} />
            ))}
          </div>
        </CardContent>
      </Card>
      ) : null}

      {dados.contratos.grupos.length > 0 ? (
        <Card className="border-l-4 border-teal-500">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base">
              <FileSignature className="size-4 text-teal-600 dark:text-teal-400" />
              Contratos
              <span className="font-mono text-sm font-normal text-muted-foreground">
                {`${num(dados.contratos.total)} un contratadas`}
              </span>
              <Badge variant="secondary" className="gap-1 text-[11px]">
                <Users className="size-3" />
                {`${dados.contratos.clientes} cliente(s) em ${dados.contratos.grupos.length} grupo(s)`}
              </Badge>
              {/* A conferência que dá confiança no resto da tela: a base de
                  contratos tem que somar a divisão "Contratos" do S&OP. */}
              {Math.abs(dados.contratos.total - dados.consensoContratos) > 0.5 ? (
                <Badge className="bg-amber-500/10 text-[11px] text-amber-700 dark:text-amber-400">
                  {`difere do S&OP em ${num(Math.abs(dados.contratos.total - dados.consensoContratos))} un`}
                </Badge>
              ) : (
                <Badge className="bg-emerald-500/10 text-[11px] text-emerald-700 dark:text-emerald-400">
                  confere com o S&amp;OP
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="py-2 text-left font-medium">Grupo</th>
                    <th className="py-2 text-right font-medium">Clientes</th>
                    <th className="py-2 text-right font-medium">Contratado</th>
                    <th className="py-2 text-right font-medium">Vendido</th>
                    <th className="py-2 text-right font-medium">Fora do contrato</th>
                    <th className="py-2 text-right font-medium">Atingimento</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.contratos.grupos.map((g) => (
                    <LinhaGrupo key={g.grupo} grupo={g} />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Kpi({
  icone: Icone,
  rotulo,
  valor,
  apoio,
  destaque,
}: {
  icone: typeof Target;
  rotulo: string;
  valor: string;
  apoio: string;
  destaque?: boolean;
}) {
  return (
    <Card className={destaque ? "border-l-4 border-(--brand-turquoise)" : ""}>
      <CardContent className="pt-6">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Icone className="size-4" />
          {rotulo}
        </p>
        <p className="font-mono text-3xl font-semibold text-(--brand-petrol) tabular-nums dark:text-foreground">
          {valor}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{apoio}</p>
      </CardContent>
    </Card>
  );
}

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

function LinhaDivisao({ divisao: d, total }: { divisao: DivisaoSop; total: number }) {
  const cor = corDivisao(d.divisao);
  const parte = total > 0 ? d.consenso / total : 0;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-muted/20 px-3 py-2">
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
      <td className="py-2 text-right font-mono text-xs text-muted-foreground tabular-nums">
        {g.clientes}
      </td>
      <td className="py-2 text-right font-mono tabular-nums">{num(g.contratado)}</td>
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
