import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, ShieldCheck, Users } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SeletorPapel } from "@/components/usuarios/seletor-papel";
import { prisma } from "@/lib/prisma";
import {
  DESCRICAO_PAPEL,
  ROTULO_PAPEL,
  exigirAdmin,
  lerPapel,
  type Papel,
} from "@/lib/autorizacao";

export const dynamic = "force-dynamic";

const POR_PAGINA = 20;

type SearchParams = {
  pag?: string | string[];
  q?: string | string[];
};

const primeiro = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

export default async function Usuarios({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // A própria tela de gestão de acesso é o primeiro lugar que precisa dela.
  const sessao = await exigirAdmin();
  const params = await searchParams;

  const busca = primeiro(params.q) ?? "";
  const pagina = Math.max(1, Number(primeiro(params.pag) ?? 1) || 1);

  const where = busca
    ? {
        OR: [
          { name: { contains: busca, mode: "insensitive" as const } },
          { email: { contains: busca, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [total, admins, usuarios] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.count({ where: { role: "admin" } }),
    prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
  ]);

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const href = (p: number) => {
    const q = new URLSearchParams();
    if (busca) q.set("q", busca);
    if (p > 1) q.set("pag", String(p));
    const s = q.toString();
    return s ? `/usuarios?${s}` : "/usuarios";
  };

  return (
    <DashboardShell
      user={{ name: sessao.usuario.name, email: sessao.usuario.email }}
      papel={sessao.usuario.papel}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-(--brand-petrol) dark:text-foreground">
              Usuários
            </h1>
            <p className="text-muted-foreground">
              Quem tem acesso ao sistema e o que cada um pode fazer.
            </p>
          </div>
          <Badge variant="secondary" className="text-sm">
            {`${total} ${total === 1 ? "conta" : "contas"} · ${admins} adm.`}
          </Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {(["admin", "user"] as Papel[]).map((p) => (
            <div key={p} className="rounded-lg border bg-card p-4">
              <p className="flex items-center gap-2 font-medium text-(--brand-petrol) dark:text-foreground">
                {p === "admin" ? (
                  <ShieldCheck className="size-4" />
                ) : (
                  <Users className="size-4" />
                )}
                {ROTULO_PAPEL[p]}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{DESCRICAO_PAPEL[p]}</p>
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contas</CardTitle>
            <CardDescription>
              Conta nova entra como consulta. Promover é sempre um ato explícito.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <form method="GET" className="flex max-w-md gap-2">
              <Input
                name="q"
                defaultValue={busca}
                placeholder="Buscar por nome ou e-mail"
                aria-label="Buscar conta"
              />
              <Button type="submit" variant="outline">
                <Search className="size-4" />
                Buscar
              </Button>
            </form>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Desde</TableHead>
                    <TableHead>Papel</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usuarios.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        {busca
                          ? `Nenhuma conta encontrada para "${busca}".`
                          : "Nenhuma conta cadastrada."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    usuarios.map((u) => {
                      const ehVoce = u.id === sessao.usuario.id;
                      return (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">
                            {u.name}
                            {ehVoce ? (
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                você
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{u.email}</TableCell>
                          <TableCell className="font-mono text-sm tabular-nums text-muted-foreground">
                            {u.createdAt.toLocaleDateString("pt-BR")}
                          </TableCell>
                          <TableCell>
                            <SeletorPapel
                              id={u.id}
                              papel={lerPapel(u.role)}
                              ehVoce={ehVoce}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {paginas > 1 ? (
              <div className="flex items-center justify-end gap-2">
                <span className="text-sm text-muted-foreground">
                  {`Página ${pagina} de ${paginas}`}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagina <= 1}
                  render={<Link href={href(pagina - 1)} scroll={false} />}
                >
                  <ChevronLeft className="size-4" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagina >= paginas}
                  render={<Link href={href(pagina + 1)} scroll={false} />}
                >
                  Próxima
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
