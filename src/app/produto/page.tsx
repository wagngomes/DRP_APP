import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

import { auth } from "@/lib/auth";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BuscaProduto } from "@/components/produto/busca-produto";
import { buscarProdutos, listarProdutosComDados } from "@/lib/produto/consultas";
import { lerDataReferencia } from "@/lib/data-referencia.server";
import { dataBr, moedaCurta } from "@/lib/visao-geral/formato";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string | string[] };

export default async function BuscaProdutoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const { q } = await searchParams;
  const termo = (Array.isArray(q) ? q[0] : q)?.trim() || undefined;
  const dataReferencia = await lerDataReferencia();

  // Sem busca a tela lista os produtos com posição na data, para nunca abrir
  // vazia — a versão anterior exigia buscar antes de mostrar qualquer coisa.
  // Shape comum entre busca e listagem: só a listagem traz filiais/estoque.
  const resultados: {
    codigo: string;
    descricao: string | null;
    marca: string | null;
    filiais?: number;
    estoque?: number;
  }[] = termo
    ? await buscarProdutos(termo)
    : await listarProdutosComDados(dataReferencia);
  const listagemPadrao = !termo;

  return (
    <DashboardShell user={{ name: session.user.name, email: session.user.email }}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-(--brand-petrol) dark:text-foreground">
            Produto
          </h1>
          <p className="text-muted-foreground">
            Posição completa do item: plano, pedidos, recebimentos e estoque por CD.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <BuscaProduto termoAtual={termo} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{listagemPadrao ? "Produtos com posição" : "Resultados"}</CardTitle>
            <CardDescription>
              {listagemPadrao
                ? `Os ${resultados.length} produtos com maior estoque em ${dataBr(dataReferencia)}. Busque acima para encontrar outro.`
                : resultados.length === 0
                  ? `Nenhum produto encontrado para "${termo}".`
                  : `${resultados.length} produto(s) para "${termo}". Clique para abrir.`}
            </CardDescription>
          </CardHeader>
          {resultados.length > 0 ? (
            <CardContent>
              <div className="max-h-[32rem] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Marca</TableHead>
                      {listagemPadrao ? (
                        <>
                          <TableHead className="text-right">Filiais</TableHead>
                          <TableHead className="text-right">Estoque</TableHead>
                        </>
                      ) : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resultados.map((p) => (
                      <TableRow key={p.codigo}>
                        <TableCell className="font-mono">
                          <Link
                            href={`/produto/${encodeURIComponent(p.codigo)}`}
                            className="text-(--brand-petrol) underline underline-offset-2 dark:text-(--brand-turquoise)"
                          >
                            {p.codigo}
                          </Link>
                        </TableCell>
                        <TableCell>{p.descricao ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{p.marca ?? "—"}</TableCell>
                        {listagemPadrao ? (
                          <>
                            <TableCell className="text-right font-mono tabular-nums">
                              {p.filiais ?? "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums">
                              {p.estoque === undefined ? "—" : moedaCurta(p.estoque)}
                            </TableCell>
                          </>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          ) : null}
        </Card>

      </div>
    </DashboardShell>
  );
}
