"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { definirCoberturas } from "@/app/actions/parametros";
import { ehDiasValido, type Coberturas } from "@/lib/parametros";

const CAMPOS: { chave: keyof Coberturas; rotulo: string; ajuda: string }[] = [
  { chave: "critico", rotulo: "Crítico", ajuda: "abaixo disso entra na análise" },
  { chave: "gatilho", rotulo: "Gatilho", ajuda: "abaixo disso sugere transferência" },
  { chave: "alvo", rotulo: "Alvo", ajuda: "cobertura que a transferência alcança" },
];

/**
 * Faixas de cobertura em dias que definem o foco da análise de risco.
 *
 * Separadas dos prazos de projeção porque respondem a outra pergunta: aqueles
 * corrigem uma data que já venceu, estas dizem a partir de quanta cobertura o
 * negócio quer ser avisado e até onde quer repor.
 */
export function ParametrosCobertura({ atuais }: { atuais: Coberturas }) {
  const [valores, setValores] = useState<Record<keyof Coberturas, string>>({
    critico: String(atuais.critico),
    gatilho: String(atuais.gatilho),
    alvo: String(atuais.alvo),
  });
  const [salvando, iniciar] = useTransition();
  const router = useRouter();

  const numeros = {
    critico: Number(valores.critico),
    gatilho: Number(valores.gatilho),
    alvo: Number(valores.alvo),
  };
  const validos = CAMPOS.every((c) => ehDiasValido(valores[c.chave]));
  const ordemOk = numeros.gatilho <= numeros.alvo;
  const alterado = CAMPOS.some((c) => numeros[c.chave] !== atuais[c.chave]);

  function aplicar() {
    if (!validos || !ordemOk) return;
    iniciar(async () => {
      const r = await definirCoberturas(numeros);
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      toast.success("Faixas de cobertura atualizadas");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {CAMPOS.map((campo) => (
          <div key={campo.chave} className="space-y-1.5">
            <Label htmlFor={`cob-${campo.chave}`} className="text-xs text-muted-foreground">
              {campo.rotulo}
            </Label>
            <Input
              id={`cob-${campo.chave}`}
              type="number"
              min={0}
              max={365}
              value={valores[campo.chave]}
              onChange={(e) =>
                setValores((v) => ({ ...v, [campo.chave]: e.target.value }))
              }
              className="w-28"
              disabled={salvando}
              aria-invalid={!ehDiasValido(valores[campo.chave])}
            />
          </div>
        ))}
        <Button
          onClick={aplicar}
          disabled={salvando || !validos || !ordemOk || !alterado}
          className="bg-(--brand-turquoise) text-(--brand-petrol) hover:bg-(--brand-turquoise)/90"
        >
          {salvando ? <Loader2 className="size-4 animate-spin" /> : null}
          Aplicar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {CAMPOS.map((c) => `${c.rotulo}: ${c.ajuda}`).join(" · ")}. Em dias de cobertura,
        não em dias úteis.
      </p>
      {!validos ? (
        <p className="text-xs text-destructive">Informe números inteiros entre 0 e 365.</p>
      ) : !ordemOk ? (
        <p className="text-xs text-destructive">O gatilho não pode ser maior que o alvo.</p>
      ) : null}
    </div>
  );
}
