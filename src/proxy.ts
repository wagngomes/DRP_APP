import { createHash } from "node:crypto";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

import { registrar } from "@/lib/seguranca/auditoria";
import { NAVEGACAO, NAVEGACAO_ANONIMA } from "@/lib/seguranca/limites";
import { origemDaRequisicao, verificarCamadas } from "@/lib/seguranca/rate-limit";

/**
 * Rotas que dispensam sessão.
 *
 * `/docs` entra aqui porque descreve o contrato da API sem expor dado, e é
 * consultada por quem ainda não tem conta — time de arquitetura, integrador.
 * Se a política interna exigir, basta tirá-la desta lista.
 */
const PUBLIC_ROUTES = ["/login", "/docs"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const origem = origemDaRequisicao(request.headers);
  const sessionCookie = getSessionCookie(request);

  // Teto de navegação antes de qualquer outra coisa: uma requisição recusada
  // aqui não chega a renderizar página nem a consultar o banco.
  //
  // A chave é a sessão quando existe, e só cai no IP para quem ainda não
  // entrou. Numa rede corporativa todo mundo compartilha um endereço público:
  // contar por IP faria o teto de uma pessoa valer para a empresa inteira, e
  // duas pessoas navegando junto bloqueariam a terceira.
  //
  // O valor do cookie vira um resumo curto antes de servir de chave. Ele é
  // credencial: não deve ficar inteiro em memória como índice de mapa, nem
  // correr o risco de escapar num log adiante.
  const chave = sessionCookie
    ? `nav:s:${createHash("sha256").update(sessionCookie).digest("hex").slice(0, 16)}`
    : `nav:ip:${origem}`;

  const veredito = verificarCamadas(
    chave,
    sessionCookie ? NAVEGACAO : NAVEGACAO_ANONIMA
  );
  if (!veredito.permitido) {
    // Registra o IP, nunca a chave de sessão — o log precisa dizer de onde veio,
    // não entregar por onde entrar.
    registrar("limite_excedido", {
      origem,
      detalhe: `navegação em ${pathname}${sessionCookie ? " (autenticado)" : ""}`,
    });
    return new NextResponse("Requisições demais. Tente novamente em instantes.", {
      status: 429,
      headers: {
        "Retry-After": String(veredito.esperarSegundos),
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

  if (!sessionCookie && !isPublicRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (sessionCookie && isPublicRoute) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Exclui `/_next` inteiro, e não só `static` e `image`: os endpoints de
  // recarga automática do desenvolvimento também moram ali e consumiriam o
  // orçamento de navegação, provocando 429 falso enquanto se programa. Nenhum
  // deles serve dado protegido.
  matcher: ["/((?!api|_next|favicon.ico).*)"],
};
