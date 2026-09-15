import Link from "next/link";
import { ChevronDown, ChevronRight, PackageCheck } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FiltroLista } from "@/components/ui/filtro-lista";
import { exigirSessao } from "@/lib/autorizacao";
import {
  carregarProdutos,
  carregarRecebimentos,
  diasDoMes,
  listarMeses,
  type CelulaDia,
} from "@/lib/recebimentos/consultas";

export const dynamic = "force-dynamic";

type SearchParams = {
  mes?: string | string[];
  forn?: string | string[];
};

const primeiro = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

/**
 * Valor abreviado.
 *
 * Um mês passa de um bilhão de reais, e com 31 colunas não há largura para o
 * número cheio. O valor exato fica no `title` de cada célula — a abreviação é
 * para ler o padrão, não para conferir contabilidade.
 */
function curto(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} mi`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)} mil`;
  return v.toFixed(0);
}

function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function inteiro(v: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function rotuloMes(mes: string): string {
  const [ano, m] = mes.split("-");
  const nomes = [
    "jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez",
  ];
  return `${nomes[Number(m) - 1]}/${ano}`;
}

/**
 * Intensidade de fundo da célula, proporcional ao maior valor da tela.
 *
 * É o que faz o padrão saltar sem precisar ler número por número: concentração
 * num dia, semana parada, entrega fracionada. A escala é relativa ao maior
 * valor porque o absoluto varia demais entre laboratórios — comparar um
 * fornecedor de bilhões com um de milhares numa escala fixa deixaria o segundo
 * invisível.
 *
 * Raiz quadrada, e não linear: sem ela o maior valor domina e todo o resto
 * vira o mesmo tom quase branco.
 */
function intensidade(valor: number, maximo: number): number {
  if (valor <= 0 || maximo <= 0) return 0;
  return Math.min(1, Math.sqrt(valor / maximo));
}

export default async function Recebimentos({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sessao = await exigirSessao();
  const params = await searchParams;

  const meses = await listarMeses();
  const mes = primeiro(params.mes) && meses.includes(primeiro(params.mes)!)
    ? primeiro(params.mes)!
    : meses[0];

  const fornecedorAberto = primeiro(params.forn);

  const [linhas, produtos] = await Promise.all([
    mes ? carregarRecebimentos(mes) : Promise.resolve([]),
    mes && fornecedorAberto
      ? carregarProdutos(mes, fornecedorAberto)
      : Promise.resolve([]),
  ]);

  const dias = mes ? diasDoMes(mes) : 0;
  const colunas = Array.from({ length: dias }, (_, i) => i + 1);

  // A escala de cor é a mesma para toda a grade: comparar células só faz
  // sentido se o tom significar a mesma coisa em qualquer linha.
  const maximo = Math.max(0, ...linhas.flatMap((l) => l.dias.map((d) => d.valor)));
  const totalMes = linhas.reduce((a, l) => a + l.total, 0);

  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | undefined> = { mes, forn: fornecedorAberto, ...extra };
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/recebimentos?${qs}` : "/recebimentos";
  };

  const celulas = (lista: CelulaDia[]) => new Map(lista.map((d) => [d.dia, d]));

  return (
    <DashboardShell
      user={{ name: sessao.usuario.name, email: sessao.usuario.email }}
      papel={sessao.usuario.papel}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-(--brand-petrol) dark:text-foreground">
              Recebimentos
            </h1>
            <p className="text-muted-foreground">
              Quanto entrou de cada fornecedor, dia a dia.
            </p>
          </div>
          {mes ? (
            <Badge variant="secondary" className="text-sm">
              {`${moeda(totalMes)} em ${rotuloMes(mes)}`}
            </Badge>
          ) : null}
        </div>

        {meses.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <PackageCheck className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 font-medium text-(--brand-petrol) dark:text-foreground">
                Nenhum recebimento na base
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Importe a tabela de recebimento para esta tela ganhar conteúdo.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="pt-6">
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {`${linhas.length} fornecedor(es) em ${rotuloMes(mes)}`}
                </CardTitle>
                <CardDescription>
                  Clique num fornecedor para abrir os produtos. O tom de fundo é
                  proporcional ao maior recebimento do mês.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* A grade não cabe em tela nenhuma: 31 dias mais fornecedor e
                    total. A rolagem horizontal é inevitável, mas a coluna do
                    fornecedor fica fixa — sem isso, rolar até o dia 25 faz
                    perder a referência de qual linha se está lendo. */}
                <div className="overflow-x-auto">
                  <table className="w-full border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr>
                        <th className="sticky left-0 z-20 min-w-52 border-b bg-background p-2 text-left font-medium">
                          Fornecedor
                        </th>
                        {colunas.map((d) => (
                          <th
                            key={d}
                            className="min-w-14 border-b bg-background p-1 text-center font-mono text-xs font-medium text-muted-foreground tabular-nums"
                          >
                            {d}
                          </th>
                        ))}
                        <th className="min-w-24 border-b border-l bg-background p-2 text-right font-medium">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.map((l) => {
                        const aberto = fornecedorAberto === l.fornecedor;
                        const mapa = celulas(l.dias);
                        return [
                          <tr key={l.fornecedor} className={aberto ? "bg-muted/50" : ""}>
                            <td className="sticky left-0 z-10 border-b bg-background p-0">
                              <Link
                                href={href({ forn: aberto ? undefined : l.fornecedor })}
                                scroll={false}
                                className={`flex items-center gap-1.5 p-2 font-medium hover:bg-muted ${
                                  aberto ? "bg-muted" : ""
                                }`}
                              >
                                {aberto ? (
                                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                                )}
                                <span className="truncate">{l.fornecedor}</span>
                              </Link>
                            </td>
                            {colunas.map((d) => {
                              const c = mapa.get(d);
                              return (
                                <td
                                  key={d}
                                  title={
                                    c
                                      ? `${l.fornecedor} · dia ${d}\n${moeda(c.valor)}\n${inteiro(c.quantidade)} un`
                                      : undefined
                                  }
                                  className="border-b p-1 text-center font-mono text-[11px] tabular-nums"
                                  style={
                                    c
                                      ? {
                                          background: `color-mix(in srgb, var(--brand-turquoise) ${
                                            intensidade(c.valor, maximo) * 70
                                          }%, transparent)`,
                                        }
                                      : undefined
                                  }
                                >
                                  {c ? curto(c.valor) : ""}
                                </td>
                              );
                            })}
                            <td className="border-b border-l p-2 text-right font-mono text-xs font-semibold tabular-nums">
                              {curto(l.total)}
                            </td>
                          </tr>,

                          /* Segundo nível: os produtos, na mesma grade de dias —
                             manter a leitura na mesma direção é o que permite
                             seguir a coluna de um dia do total até o item. */
                          ...(aberto
                            ? produtos.map((p) => {
                                const mp = celulas(p.dias);
                                return (
                                  <tr key={`${l.fornecedor}-${p.codigo}`} className="bg-muted/25">
                                    <td className="sticky left-0 z-10 border-b bg-muted/60 p-2 pl-7">
                                      <Link
                                        href={`/produto/${encodeURIComponent(p.codigo)}`}
                                        className="font-mono text-xs font-semibold text-(--brand-petrol) underline underline-offset-2 dark:text-(--brand-turquoise)"
                                      >
                                        {p.codigo}
                                      </Link>
                                      <span className="ml-2 text-xs text-muted-foreground">
                                        {p.descricao ?? "—"}
                                      </span>
                                    </td>
                                    {colunas.map((d) => {
                                      const c = mp.get(d);
                                      return (
                                        <td
                                          key={d}
                                          title={
                                            c
                                              ? `${p.codigo} · dia ${d}\n${moeda(c.valor)}\n${inteiro(c.quantidade)} un`
                                              : undefined
                                          }
                                          className="border-b p-1 text-center font-mono text-[10px] tabular-nums"
                                        >
                                          {c ? (
                                            <>
                                              <span className="block">{curto(c.valor)}</span>
                                              <span className="block text-muted-foreground">
                                                {inteiro(c.quantidade)}
                                              </span>
                                            </>
                                          ) : (
                                            ""
                                          )}
                                        </td>
                                      );
                                    })}
                                    <td className="border-b border-l p-2 text-right font-mono text-[10px] tabular-nums">
                                      <span className="block font-semibold">{curto(p.total)}</span>
                                      <span className="block text-muted-foreground">
                                        {inteiro(p.quantidadeTotal)}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })
                            : []),
                        ];
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
