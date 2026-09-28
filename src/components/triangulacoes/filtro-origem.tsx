import Link from "next/link";
import { Layers, ShoppingCart, Truck } from "lucide-react";

import type { FiltroOrigem } from "@/lib/triangulacoes/trechos";

/**
 * Recorte por origem do documento.
 *
 * Links e não botões: o recorte vira URL, o link é compartilhável e o histórico
 * do navegador funciona — o mesmo padrão dos outros filtros desta base. Por isso
 * também não precisa de `"use client"`.
 *
 * As cores são as mesmas que a tela usa nos números: teal para transferência
 * rodando, âmbar para compra a chegar.
 */

const OPCOES: {
  id: FiltroOrigem;
  rotulo: string;
  icone: typeof Layers;
  ativo: string;
}[] = [
  {
    id: "tudo",
    rotulo: "Tudo",
    icone: Layers,
    ativo:
      "bg-(--brand-petrol) text-white dark:bg-(--brand-turquoise) dark:text-(--brand-petrol)",
  },
  {
    id: "transferencia",
    rotulo: "Transferências",
    icone: Truck,
    ativo: "bg-teal-600 text-white dark:bg-teal-500",
  },
  {
    id: "compra",
    rotulo: "Compras",
    icone: ShoppingCart,
    ativo: "bg-amber-500 text-white",
  },
];

export function FiltroOrigemDocumento({
  atual,
  basePath,
  /** Outros recortes da tela, preservados ao trocar este. */
  extras,
}: {
  atual: FiltroOrigem;
  basePath: string;
  extras?: Record<string, string | undefined>;
}) {
  const href = (origem: FiltroOrigem) => {
    const q = new URLSearchParams();
    for (const [chave, valor] of Object.entries(extras ?? {})) {
      if (valor) q.set(chave, valor);
    }
    // "tudo" é o padrão e sai da URL: link limpo para o caso mais comum.
    if (origem !== "tudo") q.set("origem", origem);
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  return (
    <div className="inline-flex rounded-md border p-0.5">
      {OPCOES.map((o) => {
        const selecionado = o.id === atual;
        return (
          <Link
            key={o.id}
            href={href(o.id)}
            scroll={false}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
              selecionado ? o.ativo : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <o.icone className="size-3.5" />
            {o.rotulo}
          </Link>
        );
      })}
    </div>
  );
}
