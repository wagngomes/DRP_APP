"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Factory,
  Flame,
  FlaskConical,
  Gauge,
  Package,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Settings,
  ShoppingCart,
  Shuffle,
  Sparkles,
  UploadCloud,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { LogoDrp } from "@/components/layout/logo-drp";
import { authClient } from "@/lib/auth-client";

type DashboardUser = {
  name: string;
  email: string;
};

const NAV_ITEMS = [
  { label: "Painel", icon: LayoutDashboard, href: "/" },
  { label: "Cockpit", icon: Sparkles, href: "/cockpit" },
  { label: "Visão geral", icon: BarChart3, href: "/visao-geral" },
  { label: "Disponibilidade", icon: Gauge, href: "/disponibilidade" },
  { label: "Produto", icon: Package, href: "/produto" },
  { label: "Fornecedores", icon: Factory, href: "/fornecedores" },
  { label: "Triangulações", icon: Shuffle, href: "/triangulacoes" },
  { label: "Compras urgentes", icon: ShoppingCart, href: "/compras-urgentes" },
  { label: "Aceleração", icon: Flame, href: "/aceleracao" },
  { label: "Cenários", icon: FlaskConical, href: "/cenarios" },
  { label: "Importar CSV", icon: UploadCloud, href: "/uploads" },
  { label: "Configurações", icon: Settings, href: null },
];

export function DashboardShell({
  user,
  children,
}: {
  user: DashboardUser;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [rolou, setRolou] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Quem rola é o documento (a barra lateral é sticky, não um painel próprio),
  // então o estado do header vem do scroll da janela.
  useEffect(() => {
    const aoRolar = () => setRolou(window.scrollY > 0);
    aoRolar();
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, []);

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen w-full bg-secondary/40">
      {/* A barra ocupa a altura toda da janela: header e footer vivem dentro da
          área de conteúdo, à direita dela, e não passam por cima. */}
      <aside
        className={`sticky top-0 flex h-screen shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 ${
          collapsed ? "w-18" : "w-64"
        }`}
      >
        <div className="flex h-16 items-center justify-end px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed((prev) => !prev)}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
            className="text-sidebar-foreground hover:bg-white/10 hover:text-sidebar-foreground"
          >
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </Button>
        </div>

        <Separator className="bg-sidebar-border" />

        {/* Rola só o menu, caso um dia os itens não caibam na altura da janela. */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={!item.href}
              onClick={() => item.href && router.push(item.href)}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                item.href && pathname === item.href
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-white/10 hover:text-sidebar-foreground"
              }`}
            >
              <item.icon className="size-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

      </aside>

      {/* Coluna de conteúdo: header e footer só existem aqui dentro. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Vidro fosco: translúcido com desfoque do que passa por baixo. Parado
            no topo, o efeito não aparece (não há nada atrás); ao rolar, o
            conteúdo desliza sob ele. A borda e a sombra entram só depois do
            primeiro pixel de rolagem, para o header não parecer "colado" à
            página quando ela está no início. */}
        <header
          className={`sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-4 bg-background/70 px-6 backdrop-blur-md transition-shadow duration-200 ${
            rolou ? "border-b shadow-sm" : ""
          }`}
        >
          <LogoDrp />

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <Avatar className="size-9 shrink-0">
                <AvatarFallback className="bg-(--brand-turquoise) text-(--brand-petrol) text-xs font-semibold">
                  {initials || "U"}
                </AvatarFallback>
              </Avatar>
              {/* Em tela estreita fica só o avatar; o nome roubaria a largura. */}
              <div className="hidden min-w-0 sm:block">
                <p className="truncate text-sm leading-tight font-medium">{user.name}</p>
                <p className="truncate text-xs leading-tight text-muted-foreground">
                  {user.email}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden p-6 md:p-8">{children}</main>

        <footer className="shrink-0 border-t bg-background px-6 py-3 text-center text-xs text-muted-foreground">
          Desenvolvido por Wagner Gomes
        </footer>
      </div>
    </div>
  );
}
