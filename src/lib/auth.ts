import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { prisma } from "@/lib/prisma";
import { EMAIL_FROM, resend } from "@/lib/resend";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      await resend.emails.send({
        from: EMAIL_FROM,
        to: user.email,
        subject: "Redefinição de senha - DRP_AI",
        html: `<p>Clique no link para redefinir sua senha: <a href="${url}">${url}</a></p>`,
      });
    },
  },
  /**
   * Tetos das rotas de autenticação.
   *
   * O limitador do Better Auth cobre `/api/auth/*`, que **não passa pelo proxy**
   * — o matcher exclui `/api`. Sem esta configuração o login ficaria sem teto
   * nenhum em desenvolvimento (o padrão liga só em produção) e com um teto
   * frouxo de 100 a cada 10 s em produção.
   *
   * Como não haverá SSO por ora, estes números são a defesa principal da
   * autenticação, não uma camada extra.
   */
  rateLimit: {
    enabled: true,
    // Teto geral das rotas de auth: sessão, logout, verificação.
    window: 60,
    max: 60,
    customRules: {
      // Entrada e cadastro: onde a força bruta acontece.
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60 * 60, max: 10 },
      // Redefinição de senha dispara e-mail: teto mais baixo evita usar o
      // sistema como ferramenta de incômodo contra um endereço.
      "/forget-password": { window: 60 * 60, max: 5 },
      "/reset-password": { window: 60 * 60, max: 10 },
    },
  },

  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
