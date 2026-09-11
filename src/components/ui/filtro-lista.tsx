import Link from "next/link";

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

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-sm font-medium text-muted-foreground">{rotulo}</span>
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
    </div>
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
