import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  Flag,
  Handshake,
  Info,
  Landmark,
  LineChart,
  PackageCheck,
  Route,
  Search,
  ShoppingCart,
  ScanLine,
  Snowflake,
  Target,
  Truck,
  TrendingUp,
  UserRoundSearch,
} from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { exigirSessao } from "@/lib/autorizacao";
import { CurvaAcumulada } from "@/components/aceleracao/curva-acumulada";
import type { ClienteFora, CurvaMes } from "@/lib/aceleracao/consultas";
import { BarrasRecebimento } from "@/components/raio-x/barras-recebimento";
import { carregarRotulosFiliais } from "@/lib/transferencias/consultas";
import {
  carregarAbertura,
  carregarCurvas,
  carregarMovimentoDoMes,
  carregarRaioX,
  listarMesesSop,
  type RaioXProduto,
  type RecebimentoDia,
  type SaldoAbertura,
} from "@/lib/sop/consultas";
import { Acerto, Kpi } from "@/components/raio-x/cartoes";
import { BarraComposicao, LinhaDivisao } from "@/components/raio-x/composicao";
import { mesBr, num, pct, TOM_FAIXA } from "@/components/raio-x/formato";
import { PoliticaDoCd } from "@/components/raio-x/politica-cd";
import { faixaAcuracidade } from "@/utils/acuracidade";
import { BadgeDias } from "@/components/produto/badge-dias";
import { diasDeEstoque } from "@/utils/dias-estoque";
import { dataBr } from "@/lib/visao-geral/formato";

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
function hrefAbrir(
  dados: RaioXProduto,
  abertaAtual: string | undefined,
  divisao: string,
): string {
  const p = new URLSearchParams({ codigo: dados.codigo, mes: dados.mes });
  if (abertaAtual !== divisao) p.set("abrir", divisao);
  return `/raio-x?${p.toString()}`;
}

export default async function RaioX({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sessao = await exigirSessao();
  const params = await searchParams;

  const meses = await listarMesesSop();
  const mes = primeiro(params.mes) ?? meses[0];
  const codigo = primeiro(params.codigo);

  const abrir = primeiro(params.abrir);
  const [dados, curva, abertura, entradas, rotulos] = await Promise.all([
    codigo && mes ? carregarRaioX(codigo, mes) : Promise.resolve(null),
    codigo && mes ? carregarCurvas(codigo, mes) : Promise.resolve(null),
    codigo && mes ? carregarAbertura(codigo, mes) : Promise.resolve(null),
    codigo && mes ? carregarMovimentoDoMes(codigo, mes) : Promise.resolve(null),
    carregarRotulosFiliais(),
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
            backgroundImage:
              "radial-gradient(var(--brand-turquoise) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            maskImage: "linear-gradient(to bottom, black, transparent)",
          }}
        />
        <div className="relative space-y-5">
          {/* Malha das telas de análise: dá profundidade ao cabeçalho sem
            competir com os números, e é CSS puro. */}
          <div className="relative overflow-hidden rounded-xl border bg-card p-4">
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
            <div className="relative">
              {/* Duas colunas: à esquerda a identificação com o filtro abaixo
                dela; à direita o abastecimento, ocupando a altura das duas. */}
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs font-medium tracking-widest text-muted-foreground uppercase">
                      <ScanLine className="size-3.5" />
                      Raio-X do produto
                    </p>
                    <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-(--brand-petrol) dark:text-foreground">
                      {dados
                        ? (dados.descricao ?? dados.codigo)
                        : "Composição da demanda"}
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {dados
                        ? `${dados.codigo}${dados.fornecedor ? ` · ${dados.fornecedor}` : ""} · ${mesBr(dados.mes)}`
                        : "De onde vem o consenso, quem está por trás dele e o que de fato aconteceu."}
                    </p>

                    {/* Ficha do item: o que não muda com o mês e condiciona tudo o
                  que muda. Refrigeração decide como transferir, tributação
                  decide de onde comprar, curva decide quanta atenção o item
                  merece — as três mudam a leitura dos números abaixo. */}
                    {dados ? (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {dados.usaRefrigeracao ===
                        null ? null : dados.usaRefrigeracao ? (
                          <Badge className="gap-1 bg-sky-500/10 text-sky-700 dark:text-sky-400">
                            <Snowflake className="size-3" />
                            Refrigerado
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="gap-1 text-muted-foreground"
                          >
                            <Snowflake className="size-3" />
                            Sem refrigeração
                          </Badge>
                        )}
                        {dados.curva ? (
                          <Badge variant="secondary" className="font-mono">
                            {`Curva ${dados.curva}`}
                          </Badge>
                        ) : null}
                        {dados.tributacao ? (
                          <Badge
                            variant="outline"
                            className="gap-1 font-normal"
                          >
                            <Landmark className="size-3 shrink-0" />
                            {dados.tributacao}
                          </Badge>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {/* GET simples: o recorte vira URL e o link é compartilhável. */}
                  <form
                    action="/raio-x"
                    className="flex flex-wrap items-end gap-2"
                  >
                    <div className="space-y-1.5">
                      <label
                        htmlFor="codigo"
                        className="text-xs text-muted-foreground"
                      >
                        Produto
                      </label>
                      <div className="relative">
                        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="codigo"
                          name="codigo"
                          defaultValue={codigo ?? ""}
                          placeholder="Código"
                          className="h-9 w-44 pl-8"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label
                        htmlFor="mes"
                        className="text-xs text-muted-foreground"
                      >
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

                {/* Política e rota por CD, encostadas à direita do cabeçalho.
                
                Aqui e não em card próprio: é contexto para ler o resto, não
                assunto — em card grande competia com os números do mês. Uma
                linha por CD, porque as duas variam entre centros e a média
                entre elas não é a política de ninguém. */}
                {dados && dados.politicas.length > 0 ? (
                  // Painel próprio, de tom diferente do cabeçalho: separa a ficha
                  // de abastecimento da identificação do item sem precisar de um
                  // card à parte, que era o que ocupava tela demais.
                  <div className="shrink-0 rounded-lg border bg-background/70 p-3 dark:bg-background/40">
                    <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      <Route className="size-3" />
                      Abastecimento
                      <span className="ml-1 font-normal normal-case">
                        política / plano
                      </span>
                    </p>
                    <div className="grid gap-1">
                      {dados.politicas.map((p) => (
                        <PoliticaDoCd
                          key={p.filial}
                          politica={p}
                          rotulos={Object.fromEntries(rotulos)}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {meses.length === 0 ? (
            <Vazio texto="Nenhuma competência de S&OP importada. Carregue a base SOP em Importar CSV." />
          ) : !codigo ? (
            <Vazio texto="Informe o código de um produto para ver a composição da demanda dele." />
          ) : !dados ? (
            <Vazio texto={`Produto ${codigo} não encontrado no cadastro.`} />
          ) : (
            <Painel
              dados={dados}
              curva={curva}
              abrir={abrir}
              abertura={abertura}
              entradas={entradas}
              rotulos={Object.fromEntries(rotulos)}
            />
          )}
        </div>
      </div>
    </DashboardShell>
  );
}

function Vazio({ texto }: { texto: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-14 text-center text-muted-foreground">
        {texto}
      </CardContent>
    </Card>
  );
}

function Painel({
  dados,
  curva,
  abrir,
  abertura,
  entradas,
  rotulos,
}: {
  dados: RaioXProduto;
  curva: {
    curvas: CurvaMes[];
    diaCorte: number;
    clientes: ClienteFora[];
  } | null;
  abrir?: string;
  abertura: SaldoAbertura | null;
  entradas: RecebimentoDia[] | null;
  rotulos: Record<string, string>;
}) {
  const { acerto } = dados;

  // Ter S&OP e ter movimento são coisas separadas, e a primeira versão desta
  // tela tratava as duas como uma só: sem consenso, ela escondia tudo — venda,
  // forecast e recebimento incluídos, mesmo existindo. Um item que só entra no
  // S&OP em setembro tem agosto inteiro de história para mostrar.
  const temConsenso = dados.divisoes.length > 0;
  const temMovimento =
    dados.vendas.total !== 0 ||
    dados.forecast.filiais > 0 ||
    dados.recebido.notas > 0;

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
      {/* A abertura vem antes: é o ponto de partida do mês, e lida depois dos
          números do fechamento vira curiosidade em vez de contexto. */}
      {abertura && abertura.data ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              <Flag className="size-4" />
              Abertura do mês
            </h2>
            <p className="text-xs text-muted-foreground">
              {`carga de ${dataBr(abertura.data)}`}
              {/* Palpite e escolha não são a mesma coisa, e confundi-los faz
                  alguém defender um número que ninguém decidiu. */}
              {abertura.origem === "primeira-do-mes" ? (
                <span className="ml-1 text-amber-700 dark:text-amber-400">
                  (primeira do mês, não marcada — marque na tela de importação)
                </span>
              ) : null}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              icone={Boxes}
              rotulo="Estoque chão"
              valor={num(abertura.estoque)}
              apoio={`${abertura.filiais} filial(is)`}
            />
            <Kpi
              icone={Truck}
              tom="turquesa"
              rotulo="Transferências em aberto"
              valor={num(abertura.transferencias)}
              apoio="a caminho entre CDs"
            />
            <Kpi
              icone={ShoppingCart}
              tom="ambar"
              rotulo="Pedidos de compra em aberto"
              valor={num(abertura.compras)}
              apoio="colocados e não recebidos"
            />
            {/* Estoque total = chão + o que está a caminho, sobre o consumo
                diário do forecast do mês. Mesma fórmula e mesmas cores da tela
                de Disponibilidade, pela mesma função — duas contas do mesmo
                número acabariam divergindo. */}
            <Card className="relative overflow-hidden border-t-4 border-t-slate-400">
              <CardContent className="relative pt-6">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Dias de estoque total
                </p>
                <div className="mt-2">
                  <BadgeDias
                    dias={diasDeEstoque(
                      abertura.estoque +
                        abertura.transferencias +
                        abertura.compras,
                      dados.forecast.m0,
                    )}
                    rotulo="Cobertura"
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {`${num(abertura.estoque + abertura.transferencias + abertura.compras)} un sobre forecast de ${num(dados.forecast.m0)}`}
                </p>
              </CardContent>
            </Card>
          </div>
        </section>
      ) : null}

      <h2 className="flex items-center gap-1.5 pt-1 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        <Target className="size-4" />
        Consenso e realizado
      </h2>

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
          <Acerto
            rotulo="Forecast ajustado × vendido"
            medida={acerto.forecastAjustado}
          />
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">
              Erro da composição (WMAPE)
            </p>
            <p
              className={`mt-1 inline-flex rounded-md px-2 py-0.5 font-mono text-2xl font-semibold tabular-nums ${
                TOM_FAIXA[
                  faixaAcuracidade(
                    acerto.composicao === null ? null : 1 - acerto.composicao,
                  )
                ]
              }`}
            >
              {pct(acerto.composicao)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Quanto o rateio entre Contratos e Spot errou, ponderado pelo
              volume.
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
            <BarraComposicao
              divisoes={dados.divisoes}
              total={dados.consensoTotal}
            />
            <div className="grid gap-2">
              {dados.divisoes.map((d) => (
                <LinhaDivisao
                  key={d.divisao}
                  divisao={d}
                  total={dados.consensoTotal}
                  contratos={
                    d.divisao.toLowerCase() === "contratos"
                      ? dados.contratos
                      : null
                  }
                  aberta={abrir === d.divisao}
                  href={hrefAbrir(dados, abrir, d.divisao)}
                  consensoContratos={dados.consensoContratos}
                />
              ))}

              {/* Fecha a lista somando tudo, no mesmo desenho das linhas acima
                  para a soma ser lida na mesma coluna de cada parcela. O
                  realizado do total inclui o Spot, que não tem linha própria
                  entre as divisões apuráveis — sem isso o total não fecharia
                  com o card de vendido lá em cima. */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border-2 border-(--brand-petrol)/30 bg-(--brand-petrol)/5 px-3 py-2.5 dark:border-(--brand-turquoise)/30 dark:bg-(--brand-turquoise)/5">
                <span className="size-4 shrink-0" />
                <span className="size-2.5 shrink-0 rounded-full bg-(--brand-petrol) dark:bg-(--brand-turquoise)" />
                <span className="min-w-0 flex-1 text-sm font-semibold">
                  Total do mês
                </span>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  100%
                </span>
                <span className="font-mono text-base font-bold text-(--brand-petrol) tabular-nums dark:text-(--brand-turquoise)">
                  {num(dados.consensoTotal)}
                </span>
                <span className="w-28 text-right font-mono text-base font-bold tabular-nums">
                  {`→ ${num(dados.vendas.total)}`}
                </span>
                <span
                  className={`w-20 rounded-md px-1.5 py-0.5 text-right font-mono text-xs font-semibold tabular-nums ${
                    TOM_FAIXA[
                      faixaAcuracidade(
                        acerto.consenso.erro === null
                          ? null
                          : 1 - acerto.consenso.erro,
                      )
                    ]
                  }`}
                >
                  {acerto.consenso.erro === null
                    ? "—"
                    : `erro ${pct(acerto.consenso.erro, 0)}`}
                </span>
              </div>
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
                    <li
                      key={c.cnpj}
                      className="rounded-md border bg-muted/20 px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className="min-w-0 flex-1 truncate text-sm"
                          title={c.cliente}
                        >
                          {c.cliente}
                        </span>
                        <Badge className="shrink-0 bg-rose-500/10 font-mono text-[11px] text-rose-700 dark:text-rose-400">
                          {`${c.fator.toFixed(1)}×`}
                        </Badge>
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        {c.grupo ? (
                          <span className="truncate">{c.grupo}</span>
                        ) : null}
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

      {/* As entradas ficam abaixo da venda: a curva diz quanto saiu, as barras
          dizem quando repôs. Juntas mostram se a reposição acompanhou o ritmo
          ou chegou em dois blocos no meio do mês. */}
      {entradas && entradas.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PackageCheck className="size-4 text-(--brand-turquoise)" />
              Entradas e vendas, dia a dia
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarrasRecebimento dias={entradas} rotulos={rotulos} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
