import { ClipboardList, Filter } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { FiltroLista } from "@/components/ui/filtro-lista";
import { GradeMensal } from "@/components/comum/grade-mensal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  carregarColocacao,
  carregarProdutos,
  listarMeses,
  listarOpcoes,
} from "@/lib/colocacao/consultas";
import { exigirSessao } from "@/lib/autorizacao";

/**
 * Colocação de pedidos de compra, dia a dia.
 *
 * A ponta oposta da tela de recebimentos: lá é o que chegou, aqui é o que foi
 * pedido. A grade é literalmente o mesmo componente, para quem compara as duas
 * não precisar reaprender a leitura.
 *
 * A competência vem de `data_emissao` — quando o pedido foi colocado — e cada
 * pedido conta uma vez só, pelo valor da primeira vez que apareceu na base.
 * Sem isso, setembro mostraria R$ 1,7 bilhão no lugar de R$ 526 milhões: a base
 * é cumulativa, e o mesmo pedido reaparece a cada carga diária enquanto estiver
 * aberto.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Colocação de pedidos · DRP_AI" };

type SearchParams = {
  mes?: string | string[];
  forn?: string | string[];
  bu?: string | string[];
  produto?: string | string[];
};

const primeiro = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

function moeda(v: number): string {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function inteiro(v: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function rotuloMes(mes: string): string {
  const [ano, m] = mes.split("-");
  const nomes = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ];
  return `${nomes[Number(m) - 1]}/${ano}`;
}

function diasDoMes(mes: string): number {
  const [ano, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(ano, m, 0)).getUTCDate();
}

export default async function Colocacao({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sessao = await exigirSessao();
  const params = await searchParams;

  const meses = await listarMeses();
  const pedido = primeiro(params.mes);
  const mes = pedido && meses.includes(pedido) ? pedido : meses[0];

  const fornecedorAberto = primeiro(params.forn);
  const bu = primeiro(params.bu);
  const produto = primeiro(params.produto);
  const filtros = { bu, produto };

  const [linhas, produtos, opcoes] = await Promise.all([
    mes ? carregarColocacao(mes, filtros) : Promise.resolve([]),
    mes && fornecedorAberto
      ? carregarProdutos(mes, fornecedorAberto, filtros)
      : Promise.resolve([]),
    mes ? listarOpcoes(mes) : Promise.resolve({ fornecedores: [], bus: [] }),
  ]);

  const colunas = Array.from(
    { length: mes ? diasDoMes(mes) : 0 },
    (_, i) => i + 1,
  );

  // A escala de cor é a mesma para toda a grade: comparar células só faz sentido
  // se o tom significar a mesma coisa em qualquer linha.
  const maximo = Math.max(
    0,
    ...linhas.flatMap((l) => l.dias.map((d) => d.valor)),
  );
  const totalMes = linhas.reduce((a, l) => a + l.total, 0);
  const qtdMes = linhas.reduce((a, l) => a + l.quantidadeTotal, 0);
  const pedidosMes = linhas.reduce((a, l) => a + l.pedidos, 0);

  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | undefined> = {
      mes,
      forn: fornecedorAberto,
      bu,
      produto,
      ...extra,
    };
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/colocacao?${qs}` : "/colocacao";
  };

  // URLs montadas aqui: função não atravessa a fronteira servidor→cliente.
  const hrefPorFornecedor = Object.fromEntries(
    linhas.map((l) => [
      l.fornecedor,
      href({
        forn: fornecedorAberto === l.fornecedor ? undefined : l.fornecedor,
      }),
    ]),
  );

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
          {/* Sem `flex-wrap`: com R$ 526 milhões o bloco de totais quebrava
              para a linha de baixo, e a altura do cabeçalho mudava conforme o
              filtro. O título encolhe, os números não — eles têm largura
              própria e são o que a pessoa vem conferir. */}
          <div className="relative flex items-end justify-between gap-6">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-medium tracking-widest text-muted-foreground uppercase">
                <ClipboardList className="size-3.5" />
                Compras
              </p>
              <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-(--brand-petrol) dark:text-foreground">
                Colocação de pedidos
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Quando os pedidos foram colocados, pela data de emissão. Cada
                pedido conta uma vez, pelo valor com que foi colocado.
              </p>
            </div>

            {mes ? (
              // `shrink-0` e larguras mínimas: sem elas, trocar de filtro
              // mudava a largura de cada número e a linha inteira dançava.
              <div className="flex shrink-0 gap-6">
                <div className="min-w-44 text-right">
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">
                    Valor colocado
                  </p>
                  <p className="font-mono text-2xl font-bold text-(--brand-petrol) tabular-nums dark:text-(--brand-turquoise)">
                    {moeda(totalMes)}
                  </p>
                </div>
                <div className="min-w-20 text-right">
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">
                    Pedidos
                  </p>
                  <p className="font-mono text-2xl font-bold tabular-nums">
                    {inteiro(pedidosMes)}
                  </p>
                </div>
                <div className="min-w-28 text-right">
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">
                    Quantidade
                  </p>
                  <p className="font-mono text-2xl font-bold text-sky-600 tabular-nums dark:text-sky-400">
                    {inteiro(qtdMes)}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {meses.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <ClipboardList className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 font-medium text-(--brand-petrol) dark:text-foreground">
                Nenhum pedido na base
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Importe a tabela de pedidos de compra para esta tela ganhar
                conteúdo.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="grid gap-3 pt-6">
                <FiltroLista
                  rotulo="Mês"
                  atual={mes}
                  hrefTodos={href({ mes: meses[0], forn: undefined })}
                  opcoes={meses.map((m) => ({
                    valor: m,
                    rotulo: rotuloMes(m),
                    href: href({ mes: m, forn: undefined }),
                  }))}
                />

                {opcoes.bus.length > 1 ? (
                  <FiltroLista
                    rotulo="BU"
                    atual={bu}
                    hrefTodos={href({ bu: undefined, forn: undefined })}
                    opcoes={opcoes.bus.map((b) => ({
                      valor: b,
                      rotulo: b,
                      href: href({ bu: b, forn: undefined }),
                    }))}
                  />
                ) : null}

                {/* Fornecedor e produto em campo de busca, não em lista: são 106
                    laboratórios e milhares de itens, e uma lista desse tamanho
                    rola mais do que ajuda. */}
                <form
                  action="/colocacao"
                  className="flex flex-wrap items-end gap-2"
                >
                  {mes ? <input type="hidden" name="mes" value={mes} /> : null}
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
                    <Filter className="size-4" />
                    Aplicar
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {`${linhas.length} fornecedor(es) em ${rotuloMes(mes)}`}
                </CardTitle>
                <CardDescription>
                  Clique num fornecedor para abrir os produtos; passe o mouse
                  num número para ver a abertura. O tom de fundo é proporcional
                  à maior colocação da tela.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <GradeMensal
                  linhas={linhas.map((l) => ({
                    chave: l.fornecedor,
                    rotulo: l.fornecedor,
                    dias: l.dias,
                    total: l.total,
                    quantidadeTotal: l.quantidadeTotal,
                    apoio: `${l.pedidos} ped · ${l.produtos} itens`,
                  }))}
                  produtos={produtos.map((p) => ({
                    chave: p.codigo,
                    rotulo: p.codigo,
                    descricao: p.descricao,
                    dias: p.dias,
                    total: p.total,
                    quantidadeTotal: p.quantidadeTotal,
                  }))}
                  colunas={colunas}
                  mes={mes}
                  maximo={maximo}
                  fornecedorAberto={fornecedorAberto}
                  href={hrefPorFornecedor}
                  rodapeDica={{
                    icone: "pedido",
                    texto: bu ? `Somente ${bu}` : "Todas as BUs",
                  }}
                />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
