import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { FormularioRecuperar } from "@/components/auth/formulario-recuperar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Pedido de redefinição de senha.
 *
 * O envio já existia no servidor desde sempre, mas não havia por onde pedi-lo:
 * nem link, nem tela. Quem esquecia a senha dependia de alguém mexer no banco —
 * e com o e-mail desligado, nem isso resolvia.
 *
 * Pública por necessidade: quem esqueceu a senha não consegue entrar para
 * pedir a troca.
 */
export const metadata = { title: "Recuperar senha · DRP_AI" };

export default function RecuperarSenha() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl text-(--brand-petrol) dark:text-foreground">
            Recuperar senha
          </CardTitle>
          <CardDescription>
            Informe o e-mail da sua conta. Se ela existir, enviamos um link para
            você definir uma nova senha.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormularioRecuperar />
          <p className="text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              <ArrowLeft className="size-3.5" />
              Voltar para a entrada
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
