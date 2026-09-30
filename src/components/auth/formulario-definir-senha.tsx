"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { flattenError } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { resetSenhaSchema } from "@/lib/validations/user";

/**
 * Define a nova senha a partir do token que veio no e-mail.
 *
 * O token é de uso único e vale por uma hora. Errar a confirmação não deve
 * gastá-lo, por isso a validação das duas senhas acontece antes de qualquer
 * chamada ao servidor.
 */
export function FormularioDefinirSenha({ token }: { token: string | null }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState<Record<string, string[]>>({});

  if (!token) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Este link está incompleto ou expirou. Peça um novo para redefinir a
          senha.
        </p>
        <Button
          variant="outline"
          className="w-full"
          render={<Link href="/recuperar-senha" />}
        >
          Pedir novo link
        </Button>
      </div>
    );
  }

  async function aoEnviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErros({});

    const dados = new FormData(evento.currentTarget);
    const validado = resetSenhaSchema.safeParse({
      password: dados.get("password"),
      confirmacao: dados.get("confirmacao"),
    });

    if (!validado.success) {
      setErros(flattenError(validado.error).fieldErrors);
      return;
    }

    setEnviando(true);
    const { error } = await authClient.resetPassword({
      newPassword: validado.data.password,
      token: token!,
    });
    setEnviando(false);

    if (error) {
      // Aqui a mensagem do servidor vale: "token inválido ou expirado" é
      // exatamente o que a pessoa precisa saber para pedir outro link.
      toast.error(
        error.message ??
          "Não foi possível redefinir a senha. Peça um novo link.",
      );
      return;
    }

    toast.success("Senha redefinida. Entre com a nova senha.");
    router.push("/login");
  }

  return (
    <form onSubmit={aoEnviar} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="nova-senha">Nova senha</Label>
        <Input
          id="nova-senha"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
        {erros.password ? (
          <p className="text-sm text-destructive">{erros.password[0]}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">Ao menos 12 caracteres.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmar-senha">Confirme a nova senha</Label>
        <Input
          id="confirmar-senha"
          name="confirmacao"
          type="password"
          autoComplete="new-password"
          required
        />
        {erros.confirmacao ? (
          <p className="text-sm text-destructive">{erros.confirmacao[0]}</p>
        ) : null}
      </div>
      <Button
        type="submit"
        disabled={enviando}
        className="w-full bg-(--brand-turquoise) text-(--brand-petrol) hover:bg-(--brand-turquoise)/90"
      >
        {enviando ? "Salvando..." : "Definir nova senha"}
      </Button>
    </form>
  );
}
