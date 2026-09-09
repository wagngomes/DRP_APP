"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Busca por código exato ou trecho da descrição; o termo vai para a URL. */
export function BuscaProduto({ termoAtual }: { termoAtual?: string }) {
  const [termo, setTermo] = useState(termoAtual ?? "");
  const [buscando, iniciar] = useTransition();
  const router = useRouter();

  function buscar() {
    const t = termo.trim();
    if (!t) return;
    iniciar(() => {
      router.push(`/produto?q=${encodeURIComponent(t)}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") buscar();
          }}
          placeholder="Código exato ou parte da descrição"
          className="w-80 pl-8"
          disabled={buscando}
          aria-label="Buscar produto"
        />
      </div>
      <Button
        onClick={buscar}
        disabled={buscando || !termo.trim()}
        className="bg-(--brand-turquoise) text-(--brand-petrol) hover:bg-(--brand-turquoise)/90"
      >
        {buscando ? <Loader2 className="size-4 animate-spin" /> : null}
        Buscar
      </Button>
    </div>
  );
}
