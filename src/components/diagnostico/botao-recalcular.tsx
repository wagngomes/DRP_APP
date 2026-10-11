"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { recalcularDiagnostico } from "@/app/actions/diagnostico-ruptura";

/**
 * Dispara a rodada do motor.
 *
 * Cliente porque precisa de estado de "rodando": a rodada leva uns doze
 * segundos contra o banco remoto, e um botão que não responde ao clique leva
 * a pessoa a clicar de novo — o que dispararia uma segunda rodada em cima da
 * primeira.
 *
 * O `useTransition` mantém a tela viva durante a ação e deixa o Next
 * revalidar a rota ao fim, sem recarga manual.
 */
export function BotaoRecalcular() {
  const [rodando, iniciar] = useTransition();
  const [ultima, setUltima] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {ultima ? (
        <span className="text-xs text-muted-foreground">{ultima}</span>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        disabled={rodando}
        onClick={() =>
          iniciar(async () => {
            const r = await recalcularDiagnostico();
            if (r.ok) {
              const seg = (r.duracaoMs / 1000).toFixed(1);
              setUltima(`${r.eventos} posições · ${seg}s`);
              toast.success(
                `Diagnóstico recalculado: ${r.eventos} posições em ruptura, ${r.causas} causas.`,
              );
            } else {
              toast.error(r.erro);
            }
          })
        }
      >
        <RefreshCw className={`size-4 ${rodando ? "animate-spin" : ""}`} />
        {rodando ? "Calculando..." : "Recalcular"}
      </Button>
    </div>
  );
}
