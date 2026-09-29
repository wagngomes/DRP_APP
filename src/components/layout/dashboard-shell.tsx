"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Factory,
  Flame,
  FlaskConical,
  Gauge,
  Package,
  ScanLine,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Settings,
  Settings2,
  ShoppingCart,
  Shuffle,
  Menu,
  PackageCheck,
  Sparkles,
  UploadCloud,
  Network,
  Terminal,
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
/**
 * Alterna o menu recolhido.
 *
 * O estado vive no atributo `data-menu` do `<html>` e num cookie, não no React.
 * O motivo é o piscar: o servidor renderiza antes de qualquer estado de
 * cliente existir, então uma preferência guardada no navegador chegava sempre
 * tarde — a barra vinha aberta no HTML e fechava depois de hidratar. Com o
 * cookie, o servidor já manda o atributo certo e o CSS pinta a largura certa
 * no primeiro quadro.
 *
 * `max-age` de um ano e `samesite=lax`: é preferência de interface, não sessão.
 */
function alternarMenu(): void {
  const raiz = document.documentElement;
  const recolhido = raiz.dataset.menu !== "recolhido";

  if (recolhido) raiz.dataset.menu = "recolhido";
  else delete raiz.dataset.menu;

  document.cookie = `drp-menu=${recolhido ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
}

type ItemNav = {
  label: string;
  icon: LucideIcon;
  href: string | null;
  admin?: boolean;
};

type GrupoNav = {
  label: string;
  icon: LucideIcon;
  /** Itens que aparecem ao abrir o grupo. */
  itens: ItemNav[];
};

type EntradaNav = ItemNav | GrupoNav;

function ehGrupo(e: EntradaNav): e is GrupoNav {
  return "itens" in e;
}

/**
 * O menu, em dois níveis.
 *
 * Dezessete itens soltos numa coluna é lista, não navegação: ninguém acha nada
 * sem ler todos. Os três grupos juntam telas que se respondem — a
 * disponibilidade e o que fazer com ela, a triangulação e o rastreio dela, a
 * administração — e o resto continua solto porque cada uma dessas é um assunto
 * por si.
 *
 * `admin: true` continua **por item**, e não por grupo. Cenários e Importar CSV
 * moram em Administração por organização, mas quem é consulta sempre pôde
 * usá-los: agrupar não é o momento de tirar acesso de ninguém. Um grupo cujos
 * itens sumiram todos não é desenhado.
 */
const NAV: EntradaNav[] = [
  { label: "Painel", icon: LayoutDashboard, href: "/" },
  { label: "Cockpit", icon: Sparkles, href: "/cockpit" },
  { label: "Visão geral", icon: BarChart3, href: "/visao-geral" },
  {
    label: "Disponibilidade",
    icon: Gauge,
    itens: [
      { label: "Disponibilidade", icon: Gauge, href: "/disponibilidade" },
      { label: "Aceleração", icon: Flame, href: "/aceleracao" },
      {
        label: "Compras urgentes",
        icon: ShoppingCart,
        href: "/compras-urgentes",
      },
    ],
  },
  {
    label: "Triangulações",
    icon: Shuffle,
    itens: [
      { label: "Triangulações", icon: Shuffle, href: "/triangulacoes" },
      { label: "Tracking", icon: Network, href: "/triangulacoes/gerencial" },
      { label: "Recebimentos", icon: PackageCheck, href: "/recebimentos" },
    ],
  },
  { label: "Produto", icon: Package, href: "/produto" },
  { label: "Raio-X", icon: ScanLine, href: "/raio-x" },
  { label: "Fornecedores", icon: Factory, href: "/fornecedores" },
  {
    label: "Administração",
    icon: Settings2,
    itens: [
      { label: "Usuários", icon: Users, href: "/usuarios", admin: true },
      { label: "Console SQL", icon: Terminal, href: "/console", admin: true },
      { label: "Importar CSV", icon: UploadCloud, href: "/uploads" },
      { label: "Cenários", icon: FlaskConical, href: "/cenarios" },
    ],
  },
  { label: "Configurações", icon: Settings, href: null },
];

/** Todos os destinos, do mais específico ao mais genérico. */
const DESTINOS = NAV.flatMap((e) => (ehGrupo(e) ? e.itens : [e]))
  .map((i) => i.href)
  .filter((h): h is string => h !== null)
  .sort((a, b) => b.length - a.length);

/**
 * Qual item do menu corresponde à tela aberta.
 *
 * Do mais longo para o mais curto porque `/triangulacoes` é prefixo de
 * `/triangulacoes/gerencial`: por ordem de declaração, estar no Tracking
 * acenderia Triangulações. O prefixo continua valendo — `/produto/203087` tem
 * de acender `/produto` —, só que o destino mais específico ganha.
 */
export function destinoAtivo(pathname: string): string | null {
  return (
    DESTINOS.find(
      (h) => pathname === h || (h !== "/" && pathname.startsWith(`${h}/`)),
    ) ?? null
  );
}

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
  /**
   * Gaveta do celular, separada do menu recolhido de propósito.
   *
   * São duas perguntas diferentes: recolhido é "o menu está estreito?", que só
   * existe no desktop e vive em CSS; `aberto` é "a gaveta está por cima do
   * conteúdo?", que só existe no celular e precisa de estado. Um estado só para
   * as duas faria recolher no desktop abrir a gaveta ao girar o telefone.
   */
  const [aberto, setAberto] = useState(false);
  /**
   * Grupos que a pessoa abriu ou fechou à mão.
   *
   * Só o que foi decidido explicitamente entra aqui; o resto é derivado da tela
   * aberta na hora de desenhar. Guardar o estado de todos obrigaria a
   * sincronizá-lo a cada navegação, que é exatamente o efeito que faria a lista
   * pular depois de pintada.
   */
  const [manuais, setManuais] = useState<Record<string, boolean>>({});
  const [rolou, setRolou] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  /** Destino do menu que corresponde à tela aberta. */
  const ativo = destinoAtivo(pathname);

  const irPara = (href: string) => router.push(href);

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
        className={`menu-lateral fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[transform,width] duration-200 md:sticky md:top-0 md:z-auto md:w-64 md:translate-x-0 ${
          aberto ? "translate-x-0" : "-translate-x-full"
        }`}
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
            onClick={alternarMenu}
            title="Recolher ou expandir o menu"
            className="hidden text-sidebar-foreground hover:bg-white/10 hover:text-sidebar-foreground md:inline-flex"
          >
            {/* As duas setas ficam no HTML e o CSS mostra a certa. Escolher no
                React faria a seta piscar pelo mesmo motivo que a largura
                piscava: o servidor não sabe a preferência. */}
            <ChevronLeft className="menu-seta-recolher size-4" />
            <ChevronRight className="menu-seta-expandir size-4" />
          </Button>
        </div>

        <Separator className="bg-sidebar-border" />

        {/* Rola só o menu, caso um dia os itens não caibam na altura da janela. */}
        {/* Rola só o menu, caso um dia os itens não caibam na altura da janela. */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map((entrada) => {
            if (!ehGrupo(entrada)) {
              return (
                <ItemMenu
                  key={entrada.label}
                  item={entrada}
                  ativo={ativo === entrada.href}
                  aoIr={irPara}
                />
              );
            }

            const visiveis = entrada.itens.filter(
              (i) => !i.admin || papel === "admin",
            );
            // Grupo que perdeu todos os itens por permissão não vira cabeçalho
            // vazio: some inteiro.
            if (visiveis.length === 0) return null;

            const contemAtivo = visiveis.some((i) => i.href === ativo);
            // O manual manda; sem manual, vale conter a tela aberta.
            //
            // Derivado, e não guardado num efeito: assim o grupo da página que
            // acabou de abrir já nasce aberto, sem um segundo render que faria a
            // lista pular depois de pintada.
            const aberto = manuais[entrada.label] ?? contemAtivo;

            return (
              <div key={entrada.label}>
                <button
                  type="button"
                  onClick={() =>
                    setManuais((m) => ({ ...m, [entrada.label]: !aberto }))
                  }
                  aria-expanded={aberto}
                  className={`menu-grupo-titulo flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    contemAtivo && !aberto
                      ? "bg-white/5 text-sidebar-foreground"
                      : "text-sidebar-foreground/80 hover:bg-white/10 hover:text-sidebar-foreground"
                  }`}
                >
                  <entrada.icon className="size-4 shrink-0" />
                  <span className="menu-rotulo flex-1 text-left">
                    {entrada.label}
                  </span>
                  {/* A seta acompanha o rótulo: no menu recolhido não há espaço
                      para ela, e sozinha não diria nada. */}
                  <ChevronDown
                    className={`menu-rotulo size-3.5 shrink-0 transition-transform ${
                      aberto ? "" : "-rotate-90"
                    }`}
                  />
                </button>

                {/* Sempre no HTML, escondido pelo atributo `hidden`.
                    
                    Renderizar condicionalmente impediria o que vem a seguir: com
                    o menu recolhido não há espaço para hierarquia, e o CSS volta
                    a mostrar todos os filhos como ícones soltos. Se eles nem
                    estivessem no HTML, recolher o menu esconderia nove das
                    dezessete telas atrás de três ícones sem legenda. */}
                <div
                  hidden={!aberto}
                  className="menu-filhos mt-0.5 space-y-0.5 border-l border-sidebar-border pl-2"
                >
                  {visiveis.map((i) => (
                    <ItemMenu
                      key={i.label}
                      item={i}
                      ativo={ativo === i.href}
                      aoIr={irPara}
                      filho
                    />
                  ))}
                </div>
              </div>
            );
          })}
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
                <p className="truncate text-sm leading-tight font-medium">
                  {user.name}
                </p>
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
        <main className="min-w-0 flex-1 overflow-x-hidden p-4 md:p-8">
          {children}
        </main>

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

/**
 * Uma linha do menu, nos dois níveis.
 *
 * `filho` muda só o peso da fonte e o tamanho do ícone: o recuo vem da guia do
 * grupo, e repeti-lo aqui deslocaria o ícone no menu recolhido, onde a guia não
 * existe.
 */
function ItemMenu({
  item,
  ativo,
  aoIr,
  filho,
}: {
  item: ItemNav;
  ativo: boolean;
  aoIr: (href: string) => void;
  filho?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={!item.href}
      onClick={() => item.href && aoIr(item.href)}
      aria-current={ativo ? "page" : undefined}
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        filho ? "font-normal" : "font-medium"
      } ${
        ativo
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-white/10 hover:text-sidebar-foreground"
      }`}
    >
      <item.icon className={`shrink-0 ${filho ? "size-3.5" : "size-4"}`} />
      {/* O rótulo some só no desktop recolhido: na gaveta do celular aparece
          sempre, senão sobrariam dezessete ícones sem legenda. */}
      <span className="menu-rotulo">{item.label}</span>
    </button>
  );
}
