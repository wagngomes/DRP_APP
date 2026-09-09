"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { gerarAnaliseCockpit } from "@/app/actions/analise";

/**
 * Dispara a análise.
 *
 * A geração leva 2 a 3 minutos — roda os motores sobre 5.777 posições e depois
 * espera o modelo escrever. Um spinner mudo por esse tempo parece travamento,
 * então o botão conta o tempo decorrido e diz em que etapa está.
 */
export function BotaoGerar({ temAnalise }: { temAnalise: boolean }) {
  const [rodando, iniciar] = useTransition();
  const [segundos, setSegundos] = useState(0);
  const router = useRouter();

  function gerar() {
    setSegundos(0);
    const relogio = setInterval(() => setSegundos((s) => s + 1), 1000);

    iniciar(async () => {
      try {
        const r = await gerarAnaliseCockpit();
        if (!r.ok) {
          toast.error(r.erro, { duration: 10000 });
          return;
        }
        toast.success(`Análise gerada com ${r.itens} itens`);
        router.refresh();
      } finally {
        clearInterval(relogio);
      }
    });
  }

  const etapa = segundos < 15 ? "Calculando riscos…" : "Analisando…";

  return (
    <div className="flex items-center gap-3">
      {rodando ? (
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {`${etapa} ${segundos}s`}
        </span>
      ) : null}
      <Button
        onClick={gerar}
        disabled={rodando}
        className="bg-(--brand-turquoise) text-(--brand-petrol) hover:bg-(--brand-turquoise)/90"
      >
        {rodando ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Sparkles className="size-4" />
        )}
        {temAnalise ? "Regerar análise" : "Gerar análise"}
      </Button>
    </div>
  );
}
