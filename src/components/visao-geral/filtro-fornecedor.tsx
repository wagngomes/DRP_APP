"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Filtro de laboratório (coluna `fornecedor` do simulador).
 *
 * São 353 valores — muitos para um select e poucos para justificar busca no
 * servidor. Um `datalist` nativo dá autocompletar sobre a lista inteira sem
 * dependência nova, e o valor vai para a URL para que as consultas (que rodam
 * no servidor) enxerguem o filtro e o link fique compartilhável.
 */
export function FiltroFornecedor({
  fornecedores,
  atual,
  basePath = "/visao-geral",
}: {
  fornecedores: string[];
  atual?: string;
  /** Página que recebe o filtro — o mesmo controle serve a mais de uma tela. */
  basePath?: string;
}) {
  const [valor, setValor] = useState(atual ?? "");
  const [aplicando, iniciar] = useTransition();
  const router = useRouter();

  function aplicar(proximo: string) {
    iniciar(() => {
      const url = proximo ? `${basePath}?fornecedor=${encodeURIComponent(proximo)}` : basePath;
      router.push(url, { scroll: false });
      router.refresh();
    });
  }

  const conhecido = !valor || fornecedores.includes(valor);

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1.5">
        <Label htmlFor="filtro-lab" className="text-xs text-muted-foreground">
          Laboratório
        </Label>
        <div className="relative">
          <FlaskConical className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="filtro-lab"
            list="lista-fornecedores"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && conhecido) aplicar(valor);
            }}
            placeholder="Todos os laboratórios"
            className="w-64 pl-8"
            disabled={aplicando}
            aria-invalid={!conhecido}
          />
          <datalist id="lista-fornecedores">
            {fornecedores.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </div>
      </div>

      <Button
        onClick={() => aplicar(valor)}
        disabled={aplicando || !conhecido || valor === (atual ?? "")}
        className="bg-(--brand-turquoise) text-(--brand-petrol) hover:bg-(--brand-turquoise)/90"
      >
        {aplicando ? <Loader2 className="size-4 animate-spin" /> : null}
        Filtrar
      </Button>

      {atual ? (
        <Button
          variant="ghost"
          onClick={() => {
            setValor("");
            aplicar("");
          }}
          disabled={aplicando}
        >
          <X className="size-4" />
          Limpar
        </Button>
      ) : null}

      {!conhecido ? (
        <p className="w-full text-xs text-destructive">
          Laboratório não encontrado na base desta data.
        </p>
      ) : null}
    </div>
  );
}
