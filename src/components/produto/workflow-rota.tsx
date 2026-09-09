import { MoveRight } from "lucide-react";

import type { Etapa } from "@/utils/projecao-transferencias";

/**
 * Percurso de uma reposição como uma linha de paradas, cada uma com a data
 * prevista de chegada. A última parada é o destino final e recebe o destaque da
 * cor da origem (âmbar para compras, turquesa para transferências).
 *
 * Compartilhado pelas telas de produto e de fornecedores para que o mesmo
 * percurso seja lido do mesmo jeito nos dois lugares.
 */
export function WorkflowRota({
  etapas,
  rotulo,
  tom,
  inicio,
}: {
  etapas: Etapa[];
  /** Código da filial -> sigla exibida. */
  rotulo: (codigo: string | null) => string;
  tom: "compra" | "transferencia";
  /** Texto sob a primeira parada: "saída" ou a data pedra. */
  inicio: string;
}) {
  if (etapas.length === 0) return null;

  const destaque = tom === "compra" ? "bg-amber-500/20" : "bg-teal-500/20";

  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
      <li className="rounded-md bg-muted px-2 py-1">
        <span className="font-mono text-sm font-bold">{rotulo(etapas[0].de)}</span>
        <span className="ml-1.5 font-mono text-xs tabular-nums text-muted-foreground">
          {inicio}
        </span>
      </li>
      {etapas.map((e, i) => (
        <li key={`${e.de}-${e.para}-${i}`} className="flex items-center gap-1.5">
          <MoveRight className="size-4 shrink-0 text-muted-foreground" />
          <span
            className={`rounded-md px-2 py-1 ${
              i === etapas.length - 1 ? destaque : "bg-muted"
            }`}
          >
            <span className="font-mono text-sm font-bold">{rotulo(e.para)}</span>
            <span className="ml-1.5 font-mono text-xs tabular-nums text-muted-foreground">
              {e.chegadaPrevista ? dataBr(e.chegadaPrevista) : "sem SLA"}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function dataBr(d: Date | string): string {
  const data = typeof d === "string" ? new Date(d) : d;
  return data.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}
