"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { flattenError } from "zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth-client";
import { signInSchema, signUpSchema } from "@/lib/validations/user";

export function AuthPanel() {
  return (
    <Card className="w-full max-w-md border-none shadow-none sm:border sm:shadow-sm">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl text-[var(--brand-petrol)]">
          Bem-vindo ao DRP_AI
        </CardTitle>
        <CardDescription>
          Entre com sua conta ou crie um novo acesso
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Entrar</TabsTrigger>
            <TabsTrigger value="signup">Criar conta</TabsTrigger>
          </TabsList>
          <TabsContent value="login" className="pt-4">
            <LoginForm />
          </TabsContent>
          <TabsContent value="signup" className="pt-4">
            <SignUpForm />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function LoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});

    const formData = new FormData(event.currentTarget);
    const parsed = signInSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    if (!parsed.success) {
      setErrors(flattenError(parsed.error).fieldErrors);
      return;
    }

    setLoading(true);
    const { error } = await authClient.signIn.email({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setLoading(false);

    if (error) {
      toast.error(error.message ?? "Não foi possível entrar. Verifique suas credenciais.");
      return;
    }

    toast.success("Login realizado com sucesso!");
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="login-email">E-mail</Label>
        <Input id="login-email" name="email" type="email" placeholder="voce@empresa.com" required />
        {errors.email && <p className="text-sm text-destructive">{errors.email[0]}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="login-password">Senha</Label>
        <Input id="login-password" name="password" type="password" required />
        {errors.password && <p className="text-sm text-destructive">{errors.password[0]}</p>}
      </div>
      <Button
        type="submit"
        disabled={loading}
        className="w-full bg-(--brand-turquoise) text-(--brand-petrol) hover:bg-(--brand-turquoise)/90"
      >
        {loading ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}

function SignUpForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});

    const formData = new FormData(event.currentTarget);
    const parsed = signUpSchema.safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
    });

    if (!parsed.success) {
      setErrors(flattenError(parsed.error).fieldErrors);
      return;
    }

    setLoading(true);
    const { error } = await authClient.signUp.email({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setLoading(false);

    if (error) {
      toast.error(error.message ?? "Não foi possível criar a conta.");
      return;
    }

    toast.success("Conta criada com sucesso!");
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="signup-name">Nome completo</Label>
        <Input id="signup-name" name="name" placeholder="Seu nome" required />
        {errors.name && <p className="text-sm text-destructive">{errors.name[0]}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-email">E-mail</Label>
        <Input id="signup-email" name="email" type="email" placeholder="voce@empresa.com" required />
        {errors.email && <p className="text-sm text-destructive">{errors.email[0]}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-password">Senha</Label>
        <Input id="signup-password" name="password" type="password" required />
        {errors.password && <p className="text-sm text-destructive">{errors.password[0]}</p>}
      </div>
      <Button
        type="submit"
        disabled={loading}
        className="w-full bg-(--brand-turquoise) text-(--brand-petrol) hover:bg-(--brand-turquoise)/90"
      >
        {loading ? "Criando conta..." : "Criar conta"}
      </Button>
    </form>
  );
}
