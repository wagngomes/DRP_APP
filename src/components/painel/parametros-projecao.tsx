"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { definirParametros } from "@/app/actions/parametros";
import { ehDiasValido, type Parametros } from "@/lib/parametros";

/**
 * Prazos aplicados quando a chegada prevista já venceu — um para transferências
 * e outro para pedidos de compra, porque as causas do atraso são diferentes.
 */
export function ParametrosProjecao({
  atuais,
  podeEditar,
}: {
  atuais: Parametros;
  /**
   * Quem é apenas consulta vê a tela e os valores, mas não altera.
   *
   * Desabilitar em vez de esconder: o parâmetro faz parte da leitura — saber
   * que a análise usa 20 dias de horizonte crítico muda como se interpreta o
   * número na tela. Esconder deixaria a pessoa sem entender de onde sai o
   * resultado.
   */
  podeEditar: boolean;
}) {
  const [transf, setTransf] = useState(String(atuais.diasTransferencias));
  const [pedidos, setPedidos] = useState(String(atuais.diasPedidos));
  const [salvando, iniciar] = useTransition();
  const router = useRouter();

  const valido = ehDiasValido(transf) && ehDiasValido(pedidos);
  const alterado =
    Number(transf) !== atuais.diasTransferencias || Number(pedidos) !== atuais.diasPedidos;

  function aplicar() {
    if (!valido) return;
    iniciar(async () => {
      const r = await definirParametros(Number(transf), Number(pedidos));
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      toast.success("Prazos de projeção atualizados");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="dias-transf" className="text-xs text-muted-foreground">
            Transferências vencidas
          </Label>
          <Input
            id="dias-transf"
            type="number"
            min={0}
            max={365}
            value={transf}
            onChange={(e) => setTransf(e.target.value)}
            className="w-32"
            disabled={!podeEditar || salvando}
            aria-invalid={!ehDiasValido(transf)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dias-pedidos" className="text-xs text-muted-foreground">
            Pedidos de compra vencidos
          </Label>
          <Input
            id="dias-pedidos"
            type="number"
            min={0}
            max={365}
            value={pedidos}
            onChange={(e) => setPedidos(e.target.value)}
            className="w-32"
            disabled={!podeEditar || salvando}
            aria-invalid={!ehDiasValido(pedidos)}
          />
        </div>
        <Button
          onClick={aplicar}
          disabled={!podeEditar || salvando || !valido || !alterado}
          className="bg-(--brand-turquoise) text-(--brand-petrol) hover:bg-(--brand-turquoise)/90"
        >
          {salvando ? <Loader2 className="size-4 animate-spin" /> : null}
          Aplicar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Dias úteis contados da data de referência. Valem apenas quando a chegada prevista pela
        origem já caiu no passado; o restante do percurso segue o SLA normalmente.
      </p>
      {!valido ? (
        <p className="text-xs text-destructive">Informe números inteiros entre 0 e 365.</p>
      ) : null}
    </div>
  );
}
