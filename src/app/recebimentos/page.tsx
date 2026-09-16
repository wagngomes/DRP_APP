import { PackageCheck } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FiltroLista } from "@/components/ui/filtro-lista";
import { exigirSessao } from "@/lib/autorizacao";
import { GradeRecebimentos } from "@/components/recebimentos/grade";
import { carregarRotulosFiliais } from "@/lib/transferencias/consultas";
import {
  carregarProdutos,
  listarCds,
  carregarRecebimentos,
  diasDoMes,
  listarMeses,
} from "@/lib/recebimentos/consultas";

export const dynamic = "force-dynamic";

type SearchParams = {
  mes?: string | string[];
  forn?: string | string[];
  cd?: string | string[];
};

const primeiro = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

function inteiro(v: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function rotuloMes(mes: string): string {
  const [ano, m] = mes.split("-");
  const nomes = [
    "jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez",
  ];
  return `${nomes[Number(m) - 1]}/${ano}`;
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
  const cd = primeiro(params.cd);

  const [linhas, produtos, cds, rotulosFiliais] = await Promise.all([
    mes ? carregarRecebimentos(mes, cd) : Promise.resolve([]),
    mes && fornecedorAberto
      ? carregarProdutos(mes, fornecedorAberto, cd)
      : Promise.resolve([]),
    mes ? listarCds(mes) : Promise.resolve([]),
    carregarRotulosFiliais(),
  ]);

  const dias = mes ? diasDoMes(mes) : 0;
  const colunas = Array.from({ length: dias }, (_, i) => i + 1);

  // A escala de cor é a mesma para toda a grade: comparar células só faz
  // sentido se o tom significar a mesma coisa em qualquer linha.
  const maximo = Math.max(0, ...linhas.flatMap((l) => l.dias.map((d) => d.valor)));
  const totalMes = linhas.reduce((a, l) => a + l.total, 0);
  const qtdMes = linhas.reduce((a, l) => a + l.quantidadeTotal, 0);

  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | undefined> = {
      mes,
      forn: fornecedorAberto,
      cd,
      ...extra,
    };
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/recebimentos?${qs}` : "/recebimentos";
  };

  // URLs montadas aqui: função não atravessa a fronteira servidor→cliente, e
  // já foi por esquecer disso que uma tela quebrou em produção.
  const hrefPorFornecedor = Object.fromEntries(
    linhas.map((l) => [
      l.fornecedor,
      href({ forn: fornecedorAberto === l.fornecedor ? undefined : l.fornecedor }),
    ])
  );

  return (
    <DashboardShell
      user={{ name: sessao.usuario.name, email: sessao.usuario.email }}
      papel={sessao.usuario.papel}
    >
      <div className="space-y-5">
        {/* Cabeçalho sobre uma malha sutil: dá profundidade sem competir com a
            grade de números, que é onde a atenção precisa ficar. A malha vive
            numa camada própria, com máscara que a dissolve nas bordas — sem
            isso ela corta em linha reta e parece defeito de renderização. */}
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
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-medium tracking-widest text-muted-foreground uppercase">
                <PackageCheck className="size-3.5" />
                Recebimentos
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-(--brand-petrol) dark:text-foreground">
                {mes ? rotuloMes(mes) : "—"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Quanto entrou de cada fornecedor, dia a dia.
              </p>
            </div>
            {mes ? (
              <div className="flex gap-6">
                <div>
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">
                    Valor no mês
                  </p>
                  <p className="font-mono text-2xl font-bold tabular-nums text-(--brand-petrol) dark:text-(--brand-turquoise)">
                    {moeda(totalMes)}
                  </p>
                </div>
                <div>
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">
                    Quantidade
                  </p>
                  <p className="font-mono text-2xl font-bold tabular-nums text-sky-600 dark:text-sky-400">
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
                {cds.length > 1 ? (
                  <FiltroLista
                    rotulo="CD"
                    atual={cd}
                    hrefTodos={href({ cd: undefined, forn: undefined })}
                    opcoes={cds.map((c) => ({
                      valor: c,
                      rotulo: rotulosFiliais.get(c) ?? c,
                      href: href({ cd: c, forn: undefined }),
                    }))}
                  />
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {`${linhas.length} fornecedor(es) em ${rotuloMes(mes)}`}
                </CardTitle>
                <CardDescription>
                  {cd
                    ? `Somente o CD ${rotulosFiliais.get(cd) ?? cd}. `
                    : ""}
                  Clique num fornecedor para abrir os produtos; passe o mouse
                  num número para ver a abertura por CD. O tom de fundo é
                  proporcional ao maior recebimento da tela.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <GradeRecebimentos
                  linhas={linhas}
                  produtos={produtos}
                  colunas={colunas}
                  mes={mes}
                  maximo={maximo}
                  fornecedorAberto={fornecedorAberto}
                  href={hrefPorFornecedor}
                  cdAtivo={cd ? (rotulosFiliais.get(cd) ?? cd) : undefined}
                />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
