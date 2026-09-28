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
  extras,
}: {
  fornecedores: string[];
  atual?: string;
  /** Página que recebe o filtro — o mesmo controle serve a mais de uma tela. */
  basePath?: string;
  /**
   * Outros recortes da página, preservados ao aplicar ou limpar este.
   *
   * Sem isto, escolher um laboratório jogava fora o filtro de CD da tela de
   * triangulações — a URL era remontada do zero.
   */
  extras?: Record<string, string | undefined>;
}) {
  const [valor, setValor] = useState(atual ?? "");
  const [aplicando, iniciar] = useTransition();
  const router = useRouter();

  function aplicar(proximo: string) {
    iniciar(() => {
      const p = new URLSearchParams();
      if (proximo) p.set("fornecedor", proximo);
      for (const [k, v] of Object.entries(extras ?? {})) if (v) p.set(k, v);
      const qs = p.toString();
      const url = qs ? `${basePath}?${qs}` : basePath;
      // Só o push. As páginas que usam este filtro são `force-dynamic`, então
      // navegar para uma URL nova já refaz a consulta no servidor — o
      // `router.refresh()` que havia aqui disparava uma segunda busca e um
      // segundo troca-conteúdo, o que numa tela de 1,6s por consulta aparecia
      // como a página saltando duas vezes.
      router.push(url, { scroll: false });
    });
  }

  const conhecido = !valor || fornecedores.includes(valor);

  return (
    // `relative` porque o aviso é posicionado fora do fluxo: no fluxo, ele
    // crescia o bloco em 20px no instante em que o nome digitado deixava de ser
    // conhecido, empurrando a tela inteira enquanto se digita.
    <div className="relative flex w-full flex-wrap items-end gap-2 sm:w-auto">
      <div className="w-full space-y-1.5 sm:w-auto">
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
            // Largura fixa só a partir de `sm`: 16rem num celular de 375px
            // estoura a linha e empurra o botão para fora da tela.
            className="w-full pl-8 sm:w-64"
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
        {/* O lugar do ícone existe sempre: trocar entre nada e um spinner muda
            a largura do botão, e ele pula no clique — justo quando o olho está
            nele. */}
        <span className="inline-flex size-4 items-center justify-center">
          {aplicando ? <Loader2 className="size-4 animate-spin" /> : null}
        </span>
        Filtrar
      </Button>

      {/* "Limpar" fica no layout mesmo sem filtro aplicado, apenas invisível:
          aparecendo e sumindo, ele reposicionava tudo à direita a cada filtro. */}
      <Button
        variant="ghost"
        onClick={() => {
          setValor("");
          aplicar("");
        }}
        disabled={aplicando || !atual}
        className={atual ? "" : "invisible"}
        aria-hidden={!atual}
        tabIndex={atual ? undefined : -1}
      >
        <X className="size-4" />
        Limpar
      </Button>

      {!conhecido ? (
        <p className="absolute top-full left-0 mt-0.5 text-xs text-destructive">
          Laboratório não encontrado na base desta data.
        </p>
      ) : null}
    </div>
  );
}
