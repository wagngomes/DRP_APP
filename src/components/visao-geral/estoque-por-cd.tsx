"use client";

import { useState } from "react";

import type { TotaisCd } from "@/lib/visao-geral/consultas";
import { inteiro, moeda, moedaCurta, percentual } from "@/lib/visao-geral/formato";

/**
 * Magnitude comparada entre CDs: barras horizontais, uma cor só. A ordenação
 * decrescente já faz o trabalho de leitura, então não há necessidade de
 * escalar cor por valor — comprimento basta.
 */
export function EstoquePorCd({ dados }: { dados: TotaisCd[] }) {
  const [ativo, setAtivo] = useState<string | null>(null);

  const maximo = Math.max(...dados.map((d) => d.estoque), 1);
  const total = dados.reduce((soma, d) => soma + d.estoque, 0);

  return (
    <div className="space-y-1">
      {dados.map((cd) => {
        const largura = Math.max((cd.estoque / maximo) * 100, 0.5);
        const destacado = ativo === cd.filial;
        return (
          <div
            key={cd.filial}
            className="group relative grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 rounded-md px-1 py-1 transition-colors hover:bg-muted/60"
            onMouseEnter={() => setAtivo(cd.filial)}
            onMouseLeave={() => setAtivo(null)}
          >
            <span className="text-right font-mono text-xs text-muted-foreground">{cd.filial}</span>

            <div className="h-5">
              <div
                className="h-full rounded-r-[4px] transition-[filter]"
                style={{
                  width: `${largura}%`,
                  background: "var(--viz-barra)",
                  filter: destacado ? "brightness(1.12)" : undefined,
                }}
              />
            </div>

            <span className="w-28 text-right font-mono text-xs tabular-nums text-(--brand-petrol) dark:text-foreground">
              {moedaCurta(cd.estoque)}
            </span>

            {destacado ? (
              <div className="pointer-events-none absolute top-full left-16 z-20 mt-0.5 w-max rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                <p className="font-medium">CD {cd.filial}</p>
                <p className="text-muted-foreground">
                  Estoque {moeda(cd.estoque)} · {percentual(cd.estoque, total)} do total
                </p>
                <p className="text-muted-foreground">
                  Vendido {moedaCurta(cd.vendido)} · Compras {moedaCurta(cd.compras)} · Transf.{" "}
                  {moedaCurta(cd.transferencias)}
                </p>
                <p className="text-muted-foreground">{inteiro(cd.itens)} itens</p>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
