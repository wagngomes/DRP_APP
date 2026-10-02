import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
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
import { prisma } from "@/lib/prisma";
import {
  DESCRICAO_PAPEL,
  ROTULO_PAPEL,
  exigirAdmin,
  lerPapel,
  type Papel,
} from "@/lib/autorizacao";
import { dominiosPermitidos } from "@/utils/email-permitido";
import { carregarAcessos } from "@/lib/usuarios/acessos";
import { CartaoUsuario } from "@/components/usuarios/cartao-usuario";

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
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
  ]);

  // Os acessos vêm depois dos usuários porque dependem dos ids da página — e
  // numa consulta só para todos eles, não uma por cartão.
  const acessos = await carregarAcessos(usuarios.map((u) => u.id));

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
        {/* O aviso mora aqui porque esta é a tela de quem controla acesso, e
            porque log de contêiner ninguém lê por hábito. O cadastro ficou
            aberto semanas sem que houvesse onde perceber. */}
        {dominiosPermitidos().length === 0 ? (
          <div className="flex gap-3 rounded-lg border-2 border-destructive/40 bg-destructive/5 p-4">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-destructive">
                Cadastro aberto a qualquer e-mail
              </p>
              <p className="text-muted-foreground">
                Sem a lista de domínios, qualquer pessoa que alcance a tela de
                entrada cria conta e passa a ver estoque, vendas, fornecedores e
                clientes.
              </p>
              <p className="text-muted-foreground">
                Defina{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  EMAIL_DOMINIOS_PERMITIDOS
                </code>{" "}
                no <code className="font-mono text-xs">.env</code> do servidor e
                recrie o contêiner.
              </p>
            </div>
          </div>
        ) : null}

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
              <p className="mt-1 text-sm text-muted-foreground">
                {DESCRICAO_PAPEL[p]}
              </p>
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contas</CardTitle>
            <CardDescription>
              Conta nova entra como consulta. Promover é sempre um ato
              explícito.
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

            {/* Cartões, não linhas de tabela: cada conta abre e mostra o
                histórico de acesso, e isso não cabe numa coluna. O último
                acesso fica visível fechado, porque é o que se quer saber na
                maioria das vezes. */}
            <div className="grid gap-2">
              {usuarios.length === 0 ? (
                <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  {busca
                    ? `Nenhuma conta encontrada para "${busca}".`
                    : "Nenhuma conta cadastrada."}
                </p>
              ) : (
                usuarios.map((u) => (
                  <CartaoUsuario
                    key={u.id}
                    usuario={u}
                    papel={lerPapel(u.role)}
                    acessos={acessos.get(u.id) ?? []}
                    ehVoce={u.id === sessao.usuario.id}
                  />
                ))
              )}
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
