import { FormularioDefinirSenha } from "@/components/auth/formulario-definir-senha";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Tela que o link do e-mail abre.
 *
 * O token vem na URL porque é assim que o better-auth monta o link. Ele é de uso
 * único e expira em uma hora — é credencial, não identificador, e por isso a
 * página não o guarda nem o registra em log.
 *
 * Precisa ser pública: quem chega aqui não consegue entrar.
 */
export const metadata = { title: "Definir nova senha · DRP_AI" };

export default async function DefinirSenha({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const bruto = Array.isArray(params.token) ? params.token[0] : params.token;
  const token = bruto?.trim() ? bruto.trim() : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl text-(--brand-petrol) dark:text-foreground">
            Definir nova senha
          </CardTitle>
          <CardDescription>
            Escolha uma senha nova para a sua conta. Depois de salvar, entre com
            ela.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormularioDefinirSenha token={token} />
        </CardContent>
      </Card>
    </main>
  );
}
