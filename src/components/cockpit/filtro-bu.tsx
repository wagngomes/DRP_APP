"use client";

import Link from "next/link";

/**
 * Chips de BU, no mesmo padrão de /fornecedores e /disponibilidade.
 *
 * Estado na URL, junto da vista, para o link carregar o recorte completo.
 */
export function FiltroBu({
  bus,
  atual,
  vista,
  analista,
}: {
  bus: { valor: string; total: number }[];
  atual?: string;
  vista: string;
  /** Preservado no link: trocar de BU não pode perder o analista escolhido. */
  analista?: string;
}) {
  if (bus.length <= 1) return null;

  const href = (bu?: string) => {
    const p = new URLSearchParams();
    if (vista === "curva") p.set("vista", vista);
    if (analista) p.set("analista", analista);
    if (bu) p.set("bu", bu);
    const qs = p.toString();
    return qs ? `/cockpit?${qs}` : "/cockpit";
  };

  const total = bus.reduce((a, b) => a + b.total, 0);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-sm font-medium text-muted-foreground">BU</span>
      <Chip href={href()} ativo={!atual} total={total}>
        Todas
      </Chip>
      {bus.map((b) => (
        <Chip key={b.valor} href={href(b.valor)} ativo={atual === b.valor} total={b.total}>
          {b.valor === "—" ? "Sem BU" : b.valor}
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  href,
  ativo,
  total,
  children,
}: {
  href: string;
  ativo: boolean;
  total: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        ativo
          ? "bg-(--brand-petrol) text-white dark:bg-(--brand-turquoise) dark:text-(--brand-petrol)"
          : "bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
      <span className={`ml-1.5 font-mono text-xs tabular-nums ${ativo ? "opacity-80" : "opacity-70"}`}>
        {total.toLocaleString("pt-BR")}
      </span>
    </Link>
  );
}
