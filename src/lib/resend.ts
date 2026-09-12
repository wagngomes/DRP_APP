/**
 * Cliente de e-mail transacional.
 *
 * Criado no primeiro uso, e não no carregamento do módulo. A diferença importa:
 * `new Resend(undefined)` lança exceção, e um módulo que lança ao ser importado
 * envenena tudo que o importa — inclusive quem nunca vai mandar e-mail.
 *
 * Foi assim que o build de produção quebrou em `/api/cenarios/excel`: aquela
 * rota importa a autorização, que importa a autenticação, que importa este
 * arquivo. Durante o `next build` não existe `RESEND_API_KEY` — variáveis de
 * execução não estão presentes na construção da imagem — e a compilação morria
 * ao coletar dados da página, com um erro que não menciona e-mail em lugar
 * nenhum.
 *
 * Preguiçoso, o custo da chave ausente só aparece para quem realmente tenta
 * enviar, e com uma mensagem que diz o que fazer.
 */
import { Resend } from "resend";

let cliente: Resend | null = null;

/** Há chave configurada? Permite decidir sem provocar a exceção. */
export function temResend(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function clienteResend(): Resend {
  if (!cliente) {
    const chave = process.env.RESEND_API_KEY?.trim();
    if (!chave) {
      throw new Error(
        "RESEND_API_KEY não configurada — sem ela não há como enviar e-mail de " +
          "confirmação nem de redefinição de senha."
      );
    }
    cliente = new Resend(chave);
  }
  return cliente;
}

/**
 * Remetente. O padrão é o endereço de teste do Resend, que **só entrega para o
 * dono da conta Resend** — serve para experimentar, não para uso real. Em
 * produção, aponte para um endereço do domínio verificado.
 */
export const EMAIL_FROM = process.env.EMAIL_FROM || "DRP_AI <onboarding@resend.dev>";
