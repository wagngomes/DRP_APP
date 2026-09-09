import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import type { ResultadoTela } from "@/app/actions/cenario";
import { gerarPlanilhaCenario, nomeArquivoCenario } from "@/lib/simulacao/planilha";

/**
 * Download do cenário em Excel.
 *
 * Fina de propósito: sessão, leitura da entrada e resposta. Toda a montagem e a
 * formatação ficam em `lib/simulacao/planilha.ts`, onde dá para testar sem HTTP.
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const form = await request.formData();
  const bruto = String(form.get("dados") ?? "");
  if (!bruto) {
    return NextResponse.json({ error: "Sem dados para exportar" }, { status: 400 });
  }

  let dados: ResultadoTela;
  try {
    dados = JSON.parse(bruto) as ResultadoTela;
  } catch {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const buffer = await gerarPlanilhaCenario(dados);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivoCenario(dados)}"`,
    },
  });
}
