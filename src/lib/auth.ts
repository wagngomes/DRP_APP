import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { APIError } from "better-auth/api";

import { prisma } from "@/lib/prisma";
import { EMAIL_FROM, resend } from "@/lib/resend";
import { avisoDominios, emailPermitido } from "@/utils/email-permitido";
import { registrar } from "@/lib/seguranca/auditoria";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  /**
   * `role` precisa ser declarado aqui para viajar na sessão.
   *
   * Sem isto a coluna existe no banco mas `session.user.role` chega indefinido,
   * e todo mundo seria tratado como consulta. `input: false` é o ponto
   * importante: impede que o próprio cadastro mande o campo e alguém se
   * promova a administrador no momento em que cria a conta.
   */
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
        input: false,
      },
    },
  },
  /**
   * Quem pode criar conta, e quando ela passa a valer.
   *
   * O cadastro é aberto por natureza — qualquer pessoa que alcance a URL vê o
   * formulário. Duas travas, porque elas respondem a perguntas diferentes:
   *
   * `EMAIL_PERMITIDO` responde "essa pessoa é da empresa?". Verificação de
   * e-mail sozinha não responde isso: provar que se é dono de uma caixa do
   * Gmail não diz nada sobre pertencer à companhia, e a conta criada enxerga
   * estoque, vendas, fornecedores e clientes.
   *
   * `requireEmailVerification` responde "esse endereço é mesmo dela?". Fica sob
   * variável de ambiente porque depende de o domínio estar verificado no
   * Resend: com o remetente de sandbox, o e-mail só chega para o dono da conta
   * Resend e todo mundo mais ficaria trancado do lado de fora, sem erro visível.
   */
  emailAndPassword: {
    enabled: true,
    // 12 é a recomendação atual para senha sem segundo fator. O antigo 8 vinha
    // de uma época em que a conta não dava acesso à base inteira.
    minPasswordLength: 12,
    requireEmailVerification: process.env.EXIGIR_EMAIL_VERIFICADO === "true",
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

  emailVerification: {
    sendOnSignUp: true,
    // Entra direto depois de confirmar: sem isto a pessoa clica no link, vê uma
    // tela de sucesso e precisa digitar a senha de novo, sem entender por quê.
    autoSignInAfterVerification: true,
    // Uma hora. Link de confirmação é credencial de uso único; validade longa
    // transforma um e-mail vazado em porta aberta por dias.
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => {
      await resend.emails.send({
        from: EMAIL_FROM,
        to: user.email,
        subject: "Confirme seu e-mail - DRP_AI",
        html:
          `<p>Olá, ${user.name}.</p>` +
          `<p>Confirme seu e-mail para liberar o acesso ao DRP_AI:</p>` +
          `<p><a href="${url}">Confirmar e-mail</a></p>` +
          `<p>O link vale por uma hora. Se não foi você quem se cadastrou, ignore esta mensagem.</p>`,
      });
    },
  },

  /**
   * Origens que podem falar com a API de autenticação.
   *
   * Sem esta lista o Better Auth aceita qualquer origem, e um site de terceiro
   * consegue disparar requisições autenticadas com o cookie da pessoa. É a
   * defesa contra CSRF, e custa uma linha.
   */
  trustedOrigins: [
    process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ],

  /**
   * A trava de domínio, aplicada antes de a conta existir.
   *
   * No hook de criação, e não na validação do formulário: o formulário é
   * conveniência da tela, e `/api/auth/sign-up/email` aceita requisição direta
   * de qualquer cliente. Recusar aqui é recusar de verdade.
   */
  databaseHooks: {
    user: {
      create: {
        before: async (usuario) => {
          if (!emailPermitido(usuario.email)) {
            registrar("cadastro_bloqueado", {
              alvo: usuario.email,
              detalhe: "domínio fora da lista permitida",
            });
            throw new APIError("BAD_REQUEST", {
              message:
                avisoDominios() ??
                "Este endereço de e-mail não tem permissão para criar conta.",
            });
          }
          return { data: usuario };
        },
      },
    },
  },

  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
