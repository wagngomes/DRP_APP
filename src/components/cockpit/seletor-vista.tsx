"use client";

import Link from "next/link";

export type Vista = "criticidade" | "curva";

/**
 * Alterna entre as duas leituras da mesma análise.
 *
 * Por criticidade responde "o que faço agora"; por curva responde "como está a
 * carteira de cada fornecedor". Nenhuma substitui a outra, então o estado vive na
 * URL — dá para mandar o link já na visão certa.
 */
export function SeletorVista({ atual }: { atual: Vista }) {
  const opcoes: { valor: Vista; rotulo: string }[] = [
    { valor: "criticidade", rotulo: "Por criticidade" },
    { valor: "curva", rotulo: "Por curva" },
  ];

  return (
    <div className="flex items-center gap-1.5 rounded-md bg-muted p-1">
      {opcoes.map((o) => {
        const ativo = atual === o.valor;
        return (
          <Link
            key={o.valor}
            href={o.valor === "criticidade" ? "/cockpit" : `/cockpit?vista=${o.valor}`}
            scroll={false}
            className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
              ativo
                ? "bg-background text-(--brand-petrol) shadow-sm dark:text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.rotulo}
          </Link>
        );
      })}
    </div>
  );
}
