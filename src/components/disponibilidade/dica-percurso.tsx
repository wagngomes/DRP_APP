"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { MoveRight } from "lucide-react";

/** Uma parada do percurso, já formatada no servidor. */
export type EtapaTexto = { de: string; para: string; data: string };

export type RemessaTexto = {
  documento: string;
  quantidade: string;
  /** Data de digitação: `data_emissao` da NF ou do pedido. */
  emissao: string | null;
  origem: "compra" | "transferencia";
  /** Rótulo da primeira parada: "saída" ou a data pedra. */
  inicio: string;
  etapas: EtapaTexto[];
  /** Preenchido quando não há rota: entrada direta no CD, nesta data. */
  entradaDireta: string | null;
  reprojetada: boolean;
};

/**
 * Quantidade a caminho, com o percurso completo ao passar o mouse.
 *
 * O percurso ocupava duas colunas da tabela e a deixava larga demais para o
 * espaço ao lado do gráfico. Como tooltip, a informação continua a um gesto de
 * distância sem custar largura.
 *
 * Renderizado em `document.body` via portal e posicionado pelo cursor: dentro da
 * célula, o `overflow-auto` da tabela recortaria a caixa — foi exatamente o que
 * aconteceu com o tooltip do gráfico antes de virar portal.
 */
export function DicaPercurso({
  total,
  remessas,
  cor,
}: {
  total: string;
  remessas: RemessaTexto[];
  cor: string;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  if (remessas.length === 0) {
    return <span className="text-muted-foreground/40">—</span>;
  }

  const viraEsquerda =
    pos !== null && typeof window !== "undefined" && pos.x + 380 > window.innerWidth;

  return (
    <>
      <span
        onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setPos(null)}
        className="inline-flex cursor-help flex-col items-end"
      >
        <span
          className={`font-mono font-semibold tabular-nums underline decoration-dotted underline-offset-4 ${cor}`}
        >
          {total}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {remessas.length === 1 ? "1 remessa" : `${remessas.length} remessas`}
        </span>
      </span>

      {pos
        ? createPortal(
            <div
              className="pointer-events-none fixed z-50 w-max max-w-96 rounded-md border bg-popover px-3 py-2 text-left shadow-md"
              style={{
                left: pos.x + (viraEsquerda ? -12 : 12),
                top: pos.y + 12,
                transform: viraEsquerda ? "translateX(-100%)" : undefined,
              }}
            >
              <div className="flex flex-col gap-2">
                {remessas.map((r, i) => (
                  <div key={`${r.documento}-${i}`} className="flex flex-col gap-1">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {`${r.origem === "compra" ? "Pedido" : "NF"} ${r.documento} · ${r.quantidade} un`}
                      {r.emissao
                        ? ` · ${r.origem === "compra" ? "digitado" : "digitada"} em ${r.emissao}`
                        : ""}
                      {r.reprojetada ? " · reprojetada" : ""}
                    </span>
                    {r.entradaDireta ? (
                      <span className="text-xs">{`entrada direta em ${r.entradaDireta}`}</span>
                    ) : (
                      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                        <li className="rounded bg-muted px-1.5 py-0.5">
                          <span className="font-mono text-xs font-bold">{r.etapas[0]?.de}</span>
                          <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                            {r.inicio}
                          </span>
                        </li>
                        {r.etapas.map((e, j) => (
                          <li key={`${e.de}-${e.para}-${j}`} className="flex items-center gap-1">
                            <MoveRight className="size-3 shrink-0 text-muted-foreground" />
                            <span
                              className={`rounded px-1.5 py-0.5 ${
                                j === r.etapas.length - 1
                                  ? r.origem === "compra"
                                    ? "bg-amber-500/20"
                                    : "bg-teal-500/20"
                                  : "bg-muted"
                              }`}
                            >
                              <span className="font-mono text-xs font-bold">{e.para}</span>
                              <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                                {e.data}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
