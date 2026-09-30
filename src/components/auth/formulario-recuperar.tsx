"use client";

import { useState } from "react";
import { MailCheck } from "lucide-react";
import { flattenError } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { pedirResetSchema } from "@/lib/validations/user";

/**
 * Pedido do link de redefinição.
 *
 * A confirmação é sempre a mesma, tenha a conta existido ou não. Uma mensagem
 * diferente para endereço inexistente transformaria esta tela num verificador
 * de quem tem conta na empresa — e como ela é pública, qualquer um poderia
 * consultá-la. Por isso o texto fala em "se existir".
 */
export function FormularioRecuperar() {
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aoEnviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);

    const dados = new FormData(evento.currentTarget);
    const validado = pedirResetSchema.safeParse({ email: dados.get("email") });
    if (!validado.success) {
      setErro(
        flattenError(validado.error).fieldErrors.email?.[0] ??
          "E-mail inválido",
      );
      return;
    }

    setEnviando(true);
    const { error } = await authClient.requestPasswordReset({
      email: validado.data.email,
      redirectTo: "/definir-senha",
    });
    setEnviando(false);

    // Mesmo em erro, a tela confirma: o único erro esperado aqui é o teto de
    // tentativas, e distinguir os casos entregaria a existência da conta.
    if (error && error.status === 429) {
      setErro("Muitas tentativas. Espere alguns minutos e tente de novo.");
      return;
    }
    setEnviado(true);
  }

  if (enviado) {
    return (
      <div className="flex gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
        <MailCheck className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="space-y-1 text-sm">
          <p className="font-medium text-emerald-700 dark:text-emerald-400">
            Verifique seu e-mail
          </p>
          <p className="text-muted-foreground">
            Se houver uma conta com esse endereço, o link de redefinição chegou.
            Ele vale por uma hora e só pode ser usado uma vez.
          </p>
          <p className="text-muted-foreground">
            Não recebeu? Olhe a caixa de spam.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={aoEnviar} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="recuperar-email">E-mail</Label>
        <Input
          id="recuperar-email"
          name="email"
          type="email"
          placeholder="voce@empresa.com"
          autoComplete="email"
          required
        />
        {erro ? <p className="text-sm text-destructive">{erro}</p> : null}
      </div>
      <Button
        type="submit"
        disabled={enviando}
        className="w-full bg-(--brand-turquoise) text-(--brand-petrol) hover:bg-(--brand-turquoise)/90"
      >
        {enviando ? "Enviando..." : "Enviar link de redefinição"}
      </Button>
    </form>
  );
}
