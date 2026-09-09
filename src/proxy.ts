import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_ROUTES = ["/login"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
