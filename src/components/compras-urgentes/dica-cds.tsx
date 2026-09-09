"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

/** Uma linha do detalhamento, já formatada no servidor. */
export type CdTexto = {
  filial: string;
  estoqueChao: string;
  transferencias: string;
  compras: string;
  forecast: string;
  dias: string;
};

/** Os três grupos de uma linha, na ordem em que aparecem na tabela. */
export type GruposCd = {
  rompidos: CdTexto[];
  ate10: CdTexto[];
  de10a20: CdTexto[];
};

const GRUPOS = [
  { chave: "rompidos", titulo: "CDs sem estoque", cor: "text-red-700 dark:text-red-400" },
  { chave: "ate10", titulo: "CDs com 0 a 10 dias", cor: "text-amber-700 dark:text-amber-400" },
  { chave: "de10a20", titulo: "CDs com 10 a 20 dias", cor: "text-sky-700 dark:text-sky-300" },
] as const;

/**
 * As três contagens de CD da linha, com detalhe ao passar o mouse.
 *
 * Um único componente client para as três células, e não um por célula: cada
 * fronteira servidor→cliente serializa props próprias, e três por linha
 * triplicavam o peso da página sem nenhum ganho.
 *
 * O tooltip vai para `document.body` via portal — dentro da célula, o
 * `overflow` da tabela recortaria a caixa.
 */
export function CelulasCds({ grupos }: { grupos: GruposCd }) {
  const [ativo, setAtivo] = useState<{ i: number; x: number; y: number } | null>(null);

  const viraEsquerda =
    ativo !== null && typeof window !== "undefined" && ativo.x + 420 > window.innerWidth;
  const lista = ativo !== null ? grupos[GRUPOS[ativo.i].chave] : [];

  return (
    <>
      {GRUPOS.map((g, i) => {
        const cds = grupos[g.chave];
        return (
          <td key={g.chave} className="p-2 text-center align-middle">
            {cds.length === 0 ? (
              <span className="font-mono text-muted-foreground/40 tabular-nums">0</span>
            ) : (
              <span
                onMouseMove={(e) => setAtivo({ i, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setAtivo(null)}
                className={`cursor-help font-mono font-semibold tabular-nums underline decoration-dotted underline-offset-4 ${g.cor}`}
              >
                {cds.length}
              </span>
            )}
          </td>
        );
      })}

      {ativo !== null && lista.length > 0
        ? createPortal(
            <div
              className="pointer-events-none fixed z-50 w-max rounded-md border bg-popover px-3 py-2 shadow-md"
              style={{
                left: ativo.x + (viraEsquerda ? -12 : 12),
                top: ativo.y + 12,
                transform: viraEsquerda ? "translateX(-100%)" : undefined,
              }}
            >
              <p className="mb-1.5 text-xs font-semibold">{GRUPOS[ativo.i].titulo}</p>
              <table className="text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="pr-3 text-left font-medium">CD</th>
                    <th className="pr-3 text-right font-medium">Chão</th>
                    <th className="pr-3 text-right font-medium">Transf.</th>
                    <th className="pr-3 text-right font-medium">Compras</th>
                    <th className="pr-3 text-right font-medium">Forecast</th>
                    <th className="text-right font-medium">Dias</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {lista.map((c) => (
                    <tr key={c.filial}>
                      <td className="pr-3 font-sans font-medium">{c.filial}</td>
                      <td className="pr-3 text-right">{c.estoqueChao}</td>
                      <td className="pr-3 text-right text-teal-700 dark:text-teal-300">
                        {c.transferencias}
                      </td>
                      <td className="pr-3 text-right text-amber-700 dark:text-amber-400">
                        {c.compras}
                      </td>
                      <td className="pr-3 text-right">{c.forecast}</td>
                      <td className="text-right font-semibold">{c.dias}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
