"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { definirDataReferencia } from "@/app/actions/data-referencia";

function formatarBr(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function DataReferenciaPicker({ valorAtual }: { valorAtual: string }) {
  const [valor, setValor] = useState(valorAtual);
  const [salvando, iniciarTransicao] = useTransition();
  const [pendente, setPendente] = useState(false);
  const router = useRouter();

  const alterado = valor !== valorAtual;

  function aplicar() {
    setPendente(true);
    iniciarTransicao(async () => {
      const resultado = await definirDataReferencia(valor);
      setPendente(false);
      if (!resultado.ok) {
        toast.error(resultado.erro);
        return;
      }
      toast.success(`Data de referência: ${formatarBr(valor)}`);
      // Recarrega os server components para que as consultas já usem a data nova.
      router.refresh();
    });
  }

  const ocupado = salvando || pendente;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="data-referencia" className="text-xs text-muted-foreground">
          Dia de referência
        </Label>
        <div className="relative">
          <CalendarDays className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="data-referencia"
            type="date"
            value={valor}
            onChange={(event) => setValor(event.target.value)}
            className="w-48 pl-8"
            disabled={ocupado}
          />
        </div>
      </div>
      <Button
        onClick={aplicar}
        disabled={!alterado || ocupado}
        className="bg-(--brand-turquoise) text-(--brand-petrol) hover:bg-(--brand-turquoise)/90"
      >
        {ocupado ? <Loader2 className="size-4 animate-spin" /> : null}
        Aplicar
      </Button>
      {alterado && !ocupado ? (
        <Button variant="ghost" size="sm" onClick={() => setValor(valorAtual)}>
          Cancelar
        </Button>
      ) : null}
    </div>
  );
}
