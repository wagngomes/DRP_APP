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
  Menu,
  Sparkles,
  UploadCloud,
  Users,
  X,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { LogoDrp } from "@/components/layout/logo-drp";
import { IconeLinkedin } from "@/components/layout/icone-linkedin";
import { authClient } from "@/lib/auth-client";

type DashboardUser = {
  name: string;
  email: string;
};

/**
 * `admin: true` esconde o item de quem é apenas consulta.
 *
 * Só a gestão de usuários carrega a marca. Cockpit e Cenários são telas de
 * análise: quem é consulta lê tudo, e o que fica bloqueado são as ações —
 * gerar análise, rodar cenário, importar. Esconder a tela inteira esconderia
 * também o resultado, que é o que as pessoas precisam ver.
 *
 * Esconder não é proteger: a proteção de verdade está em `exigirAdmin()`, no
 * servidor, e continua valendo para quem digitar a URL na mão. Isto é cortesia
 * de interface — não oferecer a porta que vai bater na cara de quem abrir.
 */
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
  { label: "Usuários", icon: Users, href: "/usuarios", admin: true },
  { label: "Configurações", icon: Settings, href: null },
];

export function DashboardShell({
  user,
  papel,
  children,
}: {
  user: DashboardUser;
  /**
   * Papel de quem está na tela.
   *
   * Obrigatório, sem valor padrão. Com padrão `"user"` a propriedade era fácil
   * de esquecer, e o sintoma não parecia um bug de código: o item "Usuários"
   * aparecia numa tela e sumia na seguinte, o que qualquer pessoa leria como
   * problema de sessão. Nove telas estavam assim.
   *
   * Exigindo, o TypeScript acusa a tela nova que esquecer — o erro vira falha
   * de compilação em vez de comportamento errático em produção.
   */
  papel: "admin" | "user";
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  /**
   * Gaveta do celular, separada de `collapsed` de propósito.
   *
   * São duas perguntas diferentes: `collapsed` é "o menu está estreito?", que
   * só existe no desktop; `aberto` é "a gaveta está por cima do conteúdo?", que
   * só existe no celular. Um estado só para as duas faria recolher no desktop
   * abrir a gaveta ao girar o telefone.
   */
  const [aberto, setAberto] = useState(false);
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

  // Fecha a gaveta ao trocar de tela. Sem isto, tocar num item do menu leva à
  // página nova com a gaveta ainda por cima dela.
  useEffect(() => {
    setAberto(false);
  }, [pathname]);

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
      {/* Fundo escuro atrás da gaveta, só no celular. Também serve de área de
          toque para fechar, que é o gesto que as pessoas tentam primeiro. */}
      {aberto ? (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setAberto(false)}
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
        />
      ) : null}

      {/* A barra ocupa a altura toda da janela: header e footer vivem dentro da
          área de conteúdo, à direita dela, e não passam por cima.
          
          No celular ela sai do fluxo e vira gaveta sobre o conteúdo: 256px
          fixos numa tela de 375px deixariam 119px para o sistema. A partir de
          `md` tudo volta ao que era — as classes com prefixo desfazem as de
          celular, e o desktop não muda em nada. */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[transform,width] duration-200 md:sticky md:top-0 md:z-auto md:translate-x-0 ${
          aberto ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "md:w-18" : "md:w-64"}`}
      >
        <div className="flex h-16 items-center justify-end px-4">
          {/* No celular o botão fecha a gaveta; no desktop, estreita o menu. */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setAberto(false)}
            title="Fechar menu"
            className="text-sidebar-foreground hover:bg-white/10 hover:text-sidebar-foreground md:hidden"
          >
            <X className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed((prev) => !prev)}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
            className="hidden text-sidebar-foreground hover:bg-white/10 hover:text-sidebar-foreground md:inline-flex"
          >
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </Button>
        </div>

        <Separator className="bg-sidebar-border" />

        {/* Rola só o menu, caso um dia os itens não caibam na altura da janela. */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV_ITEMS.filter((item) => !item.admin || papel === "admin").map((item) => (
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
              {/* `collapsed` é estado de desktop: na gaveta do celular o rótulo
                  aparece sempre, senão sobrariam doze ícones sem legenda. */}
              <span className={collapsed ? "md:hidden" : ""}>{item.label}</span>
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
          <div className="flex min-w-0 items-center gap-2">
            {/* Só no celular: no desktop a barra está sempre visível. */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setAberto(true)}
              title="Abrir menu"
              aria-label="Abrir menu"
              className="-ml-2 md:hidden"
            >
              <Menu className="size-5" />
            </Button>
            <LogoDrp />
          </div>

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

        {/* Margem menor no celular: 24px de cada lado consomem 13% da largura
            de uma tela de 375px. No desktop nada muda. */}
        <main className="min-w-0 flex-1 overflow-x-hidden p-4 md:p-8">{children}</main>

        <footer className="shrink-0 border-t bg-background px-6 py-3 text-center text-xs text-muted-foreground">
          <p>Desenvolvido por Wagner Gomes</p>
          <a
            href="https://www.linkedin.com/in/wagner-gomes-8b30a086/"
            target="_blank"
            // `noreferrer` junto com `noopener`: o primeiro impede que a página
            // aberta alcance esta pela referência `window.opener`; o segundo
            // evita mandar o endereço interno do sistema no cabeçalho de origem.
            rel="noopener noreferrer"
            aria-label="Perfil de Wagner Gomes no LinkedIn"
            className="mt-1.5 inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:text-(--brand-petrol) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--brand-turquoise) dark:hover:text-(--brand-turquoise)"
          >
            <IconeLinkedin className="size-4" />
          </a>
        </footer>
      </div>
    </div>
  );
}
