import Link from "next/link";
import { ChevronDown } from "lucide-react";

/**
 * Filtro de lista fechada em forma de chips.
 *
 * Componente de servidor: não tem estado nem evento, só links. A primeira
 * versão era `"use client"` e recebia `href` e `rotularOpcao` como funções —
 * que não atravessam a fronteira servidor→cliente e quebravam em runtime, sem
 * o typecheck acusar nada. Aqui as opções chegam prontas, cada uma com seu
 * texto e sua URL, e o problema deixa de existir por construção.
 *
 * Quem monta as URLs é a página, que é quem conhece os outros filtros ativos e
 * precisa preservá-los.
 *
 * No celular vira acordeão. Doze analistas com nome e sobrenome quebram em
 * cinco linhas numa tela de 375px, e a pessoa abre o sistema num paredão de
 * nomes antes de chegar ao conteúdo. Fechado, o acordeão ocupa uma linha e já
 * diz o que está selecionado; aberto, mostra a mesma grade do desktop.
 *
 * Feito com `<details>`, que abre e fecha sem JavaScript — o componente
 * continua sendo de servidor, e o acordeão funciona antes de qualquer script
 * carregar.
 */
export type OpcaoFiltro = {
  valor: string;
  rotulo: string;
  href: string;
  /** Quantas posições a opção traz; omitido quando não faz sentido contar. */
  total?: number;
};

export function FiltroLista({
  rotulo,
  opcoes,
  atual,
  hrefTodos,
}: {
  rotulo: string;
  opcoes: OpcaoFiltro[];
  atual?: string;
  hrefTodos: string;
}) {
  if (opcoes.length <= 1) return null;

  const selecionada = atual ? opcoes.find((o) => o.valor === atual) : undefined;
  const resumo = selecionada?.rotulo ?? "Todos";

  const chips = (
    <>
      <Chip href={hrefTodos} ativo={!atual}>
        Todos
      </Chip>
      {opcoes.map((o) => (
        <Chip key={o.valor} href={o.href} ativo={atual === o.valor}>
          {o.rotulo}
          {o.total !== undefined ? (
            <span className="ml-1.5 font-mono text-xs opacity-70 tabular-nums">{o.total}</span>
          ) : null}
        </Chip>
      ))}
    </>
  );

  return (
    <>
      {/* Celular: acordeão. Fechado mostra só o filtro em uso. */}
      <details className="group md:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
          <span className="shrink-0 font-medium text-muted-foreground">{rotulo}</span>
          <span className="min-w-0 flex-1 truncate font-medium text-(--brand-petrol) dark:text-(--brand-turquoise)">
            {resumo}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="flex flex-wrap gap-1.5 pt-2">{chips}</div>
      </details>

      {/* Desktop: como sempre foi. */}
      <div className="hidden flex-wrap items-center gap-1.5 md:flex">
        <span className="mr-1 text-sm font-medium text-muted-foreground">{rotulo}</span>
        {chips}
      </div>
    </>
  );
}

function Chip({
  href,
  ativo,
  children,
}: {
  href: string;
  ativo: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      // Trocar filtro não deve saltar a página de volta ao topo.
      scroll={false}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        ativo
          ? "bg-(--brand-petrol) text-white dark:bg-(--brand-turquoise) dark:text-(--brand-petrol)"
          : "bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
