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
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
