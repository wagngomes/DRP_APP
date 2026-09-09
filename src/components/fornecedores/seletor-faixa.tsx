import Link from "next/link";

import { FAIXAS, type FaixaId } from "@/utils/dias-estoque";

/**
 * Escolhe qual faixa de cobertura a tela analisa.
 *
 * As faixas e as cores são as mesmas da Disponibilidade (`FAIXAS` e as
 * variáveis `--faixa-*`), então "vermelho" significa a mesma coisa nas duas
 * telas — que é o ponto de reusar a régua em vez de recriá-la aqui.
 *
 * Estado na URL: o recorte cabe num link.
 */
export function SeletorFaixa({ atual }: { atual: FaixaId }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-sm font-medium text-muted-foreground">Faixa</span>
      {FAIXAS.map((f) => {
        const ativo = f.id === atual;
        return (
          <Link
            key={f.id}
            href={f.id === "zero" ? "/fornecedores" : `/fornecedores?faixa=${f.id}`}
            /* Sem isto o App Router rola para o topo a cada troca de faixa —
               o "salto" que o usuário sente ao comparar cores. */
            scroll={false}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              ativo
                ? "bg-(--brand-petrol) text-white dark:bg-(--brand-turquoise) dark:text-(--brand-petrol)"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <span
              className="size-3 shrink-0 rounded-[2px] ring-1 ring-foreground/20"
              style={{ background: `var(--faixa-${f.id})` }}
            />
            {f.rotulo}
          </Link>
        );
      })}
    </div>
  );
}
