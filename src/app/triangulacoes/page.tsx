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
  carregarTriangulacoes,
  type LinhaTriangulacao,
  type PosicaoDestino,
  SEM_CD_FINAL,
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
  /** CD onde a rota termina — recorte, diferente de `cd`, que é o nível aberto. */
  destino?: string | string[];
  pag?: string | string[];
  /** Ramo aberto: produto, e CD dentro dele. */
  prod?: string | string[];
  cd?: string | string[];
};

/**
 * Produtos por página.
 *
 * O corte é no servidor e a expansão vai pela URL: só o ramo aberto é
 * renderizado. Mandar a hierarquia inteira ao navegador custaria 820 KB de
 * dado — e a versão plana desta tela já passou de 7 MB de HTML antes de ganhar
 * paginação.
 *
 * Os totais do topo continuam sendo os do recorte completo, não os da página.
 *
 * Subiu de 15 quando o produto virou o primeiro nível: são 363 produtos contra
 * 53 fornecedores, e 15 por página davam 25 páginas para percorrer. Fechado,
 * cada produto é uma linha só.
 */
const POR_PAGINA = 25;

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
  const destino = primeiro(params.destino);
  const pagPedida = Number(primeiro(params.pag) ?? 1) || 1;

  const dataReferencia = await lerDataReferencia();
  const parametros = await lerParametros();

  const [dados, rotulos] = await Promise.all([
    carregarTriangulacoes(dataReferencia, parametros, produto, fornecedor, destino),
    carregarRotulosFiliais(),
  ]);

  // A hierarquia é montada aqui, sobre o mesmo dado: produto -> CD ->
  // documento. Nenhuma consulta a mais.
  //
  // O fornecedor era o primeiro nível e saiu: com o filtro de laboratório logo
  // acima, ele obrigava a um clique a mais para chegar ao item — que é a
  // unidade sobre a qual se decide alguma coisa.
  const prodAberto = primeiro(params.prod);
  const cdAberto = primeiro(params.cd);

  // `dados.produtos` já vem ordenado pelo valor total em triangulação, do
  // maior para o menor.
  const paginas = Math.max(1, Math.ceil(dados.produtos.length / POR_PAGINA));
  const pagina = Math.min(Math.max(1, pagPedida), paginas);
  const visiveis = dados.produtos.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  /** Link preservando filtros, página e o ramo aberto. */
  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | undefined> = {
      produto,
      fornecedor,
      destino,
      pag: pagina > 1 ? String(pagina) : undefined,
      prod: prodAberto,
      cd: cdAberto,
      ...extra,
    };
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/triangulacoes?${qs}` : "/triangulacoes";
  };

  // Abrir um nível fecha o de baixo: ele pertence ao ramo anterior, e mantê-lo
  // aberto mostraria o CD de um produto dentro de outro.
  const hrefProduto = (c: string) =>
    href({ prod: prodAberto === c ? undefined : c, cd: undefined });
  const hrefCd = (f: string) => href({ cd: cdAberto === f ? undefined : f });

  /** Trocar de recorte reabre a lista do começo: o ramo aberto pode não existir nele. */
  const hrefRecorte = (extra: Record<string, string | undefined>) =>
    href({ ...extra, pag: undefined, prod: undefined, cd: undefined });

  const hrefDestino = (f: string) =>
    hrefRecorte({ destino: destino === f ? undefined : f });

  const hrefPagina = (n: number) =>
    href({ pag: n > 1 ? String(n) : undefined, prod: undefined, cd: undefined });

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
              {/* Os outros recortes viajam escondidos: um GET remonta a query
                  inteira, e sem isto filtrar por produto limparia CD e
                  laboratório sem o usuário pedir. */}
              {fornecedor ? (
                <input type="hidden" name="fornecedor" value={fornecedor} />
              ) : null}
              {destino ? <input type="hidden" name="destino" value={destino} /> : null}
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
                <Button variant="ghost" render={<Link href={hrefRecorte({ produto: undefined })} />}>
                  Limpar produto
                </Button>
              ) : null}
            </form>

            <FiltroFornecedor
              fornecedores={dados.fornecedores}
              atual={fornecedor}
              basePath="/triangulacoes"
              extras={{ produto, destino }}
            />

            {/* CD final: onde a rota termina, não a próxima parada. É a
                pergunta que a tela responde mal sem filtro — uma triangulação
                passa por três centros, e só o último é o destino de fato.

                São treze na base; chips cabem e mostram o volume de cada um
                sem abrir nada. A contagem é sempre da base inteira, para o
                seletor não se esvaziar ao ser usado. */}
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">CD final</p>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant={destino ? "outline" : "secondary"}
                  render={<Link href={hrefRecorte({ destino: undefined })} />}
                  className="h-7 text-xs"
                >
                  Todos
                </Button>
                {dados.cdsFinais.map((c) => (
                  <Button
                    key={c.filial}
                    size="sm"
                    variant={destino === c.filial ? "secondary" : "outline"}
                    render={<Link href={hrefDestino(c.filial)} />}
                    className="h-7 text-xs"
                  >
                    <Warehouse className="size-3" />
                    {c.filial === SEM_CD_FINAL ? "Sem rota" : rotulo(c.filial)}
                    <span className="font-mono text-muted-foreground">{inteiro(c.documentos)}</span>
                  </Button>
                ))}
              </div>
            </div>
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
              {destino
                ? `Nenhuma triangulação com destino final em ${destino === SEM_CD_FINAL ? "rota não resolvida" : rotulo(destino)} nesta data.`
                : "Nenhuma triangulação em aberto nesta data."}
            </CardContent>
          </Card>
        ) : (
          visiveis.map((p) => {
            const pAberto = prodAberto === p.codigo;
            const destinos = pAberto ? agruparPorDestino(p.linhas) : [];
            return (
              <Card key={p.codigo} className={pAberto ? "ring-1 ring-(--brand-turquoise)/40" : ""}>
                {/* Primeiro nível: o produto. O cabeçalho inteiro é o alvo do
                    clique — mira maior que um ícone de seta. */}
                <Link href={hrefProduto(p.codigo)} scroll={false} className="block">
                  <CardHeader className="transition-colors hover:bg-muted/40">
                    <CardTitle className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {pAberto ? (
                        <ChevronDown className="size-4 shrink-0 text-(--brand-turquoise)" />
                      ) : (
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="font-mono text-(--brand-petrol) dark:text-(--brand-turquoise)">
                        {p.codigo}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-normal">
                        {p.descricao ?? "—"}
                      </span>
                      {/* O fornecedor vira etiqueta: deixou de ser nível, mas
                          continua sendo o dado que diz com quem falar. */}
                      <span className="shrink-0 text-xs font-normal text-muted-foreground">
                        {p.fornecedor}
                      </span>
                      <span className="font-mono text-sm font-normal text-muted-foreground">
                        {num(p.quantidade) + " un"}
                      </span>
                      {p.valorTransferencia > 0 ? (
                        <Badge
                          className={"font-mono " + TOM.transferencia.fundo + " " + TOM.transferencia.texto}
                        >
                          {"Transf. " + moeda(p.valorTransferencia)}
                        </Badge>
                      ) : null}
                      {p.valorCompra > 0 ? (
                        <Badge className={"font-mono " + TOM.compra.fundo + " " + TOM.compra.texto}>
                          {"Compra " + moeda(p.valorCompra)}
                        </Badge>
                      ) : null}
                    </CardTitle>
                  </CardHeader>
                </Link>

                {pAberto ? (
                  <CardContent className="grid gap-2">
                    {destinos.map((d) => {
                      const cAberto = cdAberto === d.filial;
                      return (
                        <div key={d.filial} className="rounded-md border bg-muted/20">
                          {/* Segundo nível: o CD onde a rota termina. */}
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

                          {/* Terceiro nível: os documentos, com o percurso. */}
                          {cAberto ? (
                            <div className="grid gap-2 border-t bg-card p-2.5">
                              {/* A situação do item neste CD é o que diz se a
                                  triangulação é urgente: chegar 800 unidades
                                  num centro com estoque zerado é outra conversa
                                  que chegar num que já tem trinta dias. */}
                              <PosicaoNoDestino
                                posicao={p.destinos.find((x) => x.filial === d.filial)}
                              />
                              {d.linhas.map((l) => (
                                <Documento key={l.origem + "-" + l.id} linha={l} rotulo={rotulo} />
                              ))}
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
