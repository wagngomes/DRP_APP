import { z } from "zod";

export const signUpSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome completo"),
  email: z.email("E-mail inválido"),
  // Espelha `minPasswordLength` em `lib/auth.ts`. Divergir aqui faria o
  // formulário aceitar uma senha que o servidor recusa, e a pessoa veria um
  // erro genérico sem saber o que corrigir.
  password: z.string().min(12, "A senha deve ter no mínimo 12 caracteres"),
});

export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.email("E-mail inválido"),
  password: z.string().min(1, "Informe sua senha"),
});

export type SignInInput = z.infer<typeof signInSchema>;

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2, "Informe seu nome completo").optional(),
    image: z.url("URL de imagem inválida").optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Informe ao menos um campo para atualizar",
  });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
