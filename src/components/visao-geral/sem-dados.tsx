"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { definirDataReferencia } from "@/app/actions/data-referencia";
import { dataBr } from "@/lib/visao-geral/formato";

/**
 * A data de referência pode cair num dia sem carga do simulador. Em vez de
 * mostrar a tela zerada (que parece "sem estoque") ou trocar a data por baixo
 * dos panos (que faria você ler número de outro dia sem perceber), o estado
 * vazio é explícito e a troca é uma ação sua.
 */
export function SemDados({
  dataReferencia,
  datasDisponiveis,
}: {
  dataReferencia: string;
  datasDisponiveis: string[];
}) {
  const [trocando, iniciar] = useTransition();
  const router = useRouter();
  const maisRecente = datasDisponiveis[0];

  function irPara(data: string) {
    iniciar(async () => {
      const r = await definirDataReferencia(data);
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      toast.success(`Data de referência: ${dataBr(data)}`);
      router.refresh();
    });
  }

  return (
    <Card className="border-dashed">
      <CardHeader className="flex flex-row items-center gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
          <CalendarOff className="size-6" />
        </div>
        <div>
          <CardTitle>{`Sem dados do simulador em ${dataBr(dataReferencia)}`}</CardTitle>
          <CardDescription>
            {datasDisponiveis.length === 0
              ? "Nenhuma carga do simulador foi importada ainda."
              : `A base do simulador tem ${datasDisponiveis.length} carga(s), a mais recente em ${dataBr(maisRecente)}.`}
          </CardDescription>
        </div>
      </CardHeader>
      {datasDisponiveis.length > 0 ? (
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => irPara(maisRecente)}
            disabled={trocando}
            className="bg-(--brand-turquoise) text-(--brand-petrol) hover:bg-(--brand-turquoise)/90"
          >
            {trocando ? <Loader2 className="size-4 animate-spin" /> : null}
            {`Usar ${dataBr(maisRecente)}`}
          </Button>
          {datasDisponiveis.slice(1, 5).map((data) => (
            <Button key={data} variant="outline" size="sm" onClick={() => irPara(data)} disabled={trocando}>
              {dataBr(data)}
            </Button>
          ))}
        </CardContent>
      ) : null}
    </Card>
  );
}
