import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

import { NAVEGACAO } from "@/lib/seguranca/limites";
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

  // Teto de navegação antes de qualquer outra coisa: uma requisição recusada
  // aqui não chega a renderizar página nem a consultar o banco.
  const origem = origemDaRequisicao(request.headers);
  const veredito = verificarCamadas(`nav:${origem}`, NAVEGACAO);
  if (!veredito.permitido) {
    return new NextResponse("Requisições demais. Tente novamente em instantes.", {
      status: 429,
      headers: {
        "Retry-After": String(veredito.esperarSegundos),
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
  const sessionCookie = getSessionCookie(request);

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
