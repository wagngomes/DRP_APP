import { createAuthClient } from "better-auth/react";

/**
 * Cliente de autenticação do navegador.
 *
 * Sem `baseURL` de propósito: omitido, o Better Auth usa a origem da própria
 * página, que é sempre a certa — a API de autenticação é servida pela mesma
 * aplicação que entregou o HTML.
 *
 * A versão anterior usava `process.env.NEXT_PUBLIC_APP_URL`, e isso quebrou em
 * produção de um jeito difícil de ler. Variável `NEXT_PUBLIC_*` é **congelada
 * no momento do build**, não lida em execução; o build acontece dentro da
 * imagem Docker, que não recebe o `.env` (ele está no `.dockerignore`). Sem
 * valor, o cliente caía no padrão `http://localhost:3000` e o navegador tentava
 * criar conta contra a máquina de quem estava acessando.
 *
 * A CSP pegou o erro — `connect-src 'self'` bloqueou a requisição para outra
 * origem —, mas a mensagem falava de política de segurança, não de configuração
 * ausente. Sem `baseURL` o problema deixa de existir: não há valor para
 * esquecer de passar, nem rebuild necessário quando o domínio muda.
 */
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
