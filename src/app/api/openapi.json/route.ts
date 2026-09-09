import { NextResponse, type NextRequest } from "next/server";

import { documentoOpenApi } from "@/lib/openapi";

/**
 * Especificação OpenAPI da API, para geradores de cliente e para o gateway.
 *
 * Sem sessão: a especificação descreve o contrato, não expõe dado. Publicá-la
 * aberta é o que permite gerar cliente e importar no gateway corporativo sem
 * credencial no meio do caminho.
 */
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return NextResponse.json(documentoOpenApi(request.nextUrl.origin));
}
