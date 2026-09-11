import { NextResponse, type NextRequest } from "next/server";

import { exigirAdminOuErro } from "@/lib/autorizacao";
import type { ResultadoTela } from "@/app/actions/cenario";
import { gerarPlanilhaCenario, nomeArquivoCenario } from "@/lib/simulacao/planilha";
import { exportarCenarioSchema } from "@/lib/openapi";

/**
 * Download do cenário em Excel.
 *
 * Fina de propósito: autorização, leitura da entrada e resposta. Toda a montagem
 * e a formatação ficam em `lib/simulacao/planilha.ts`, onde dá para testar sem
 * HTTP.
 *
 * Exporta dado para fora do sistema, onde nenhum controle daqui alcança mais —
 * por isso exige administrador, e não só sessão.
 */
export async function POST(request: NextRequest) {
  const autorizado = await exigirAdminOuErro();
  if (!autorizado.ok) {
    return NextResponse.json({ error: autorizado.erro }, { status: autorizado.status });
  }

  const form = await request.formData();
  const entrada = exportarCenarioSchema.safeParse({ dados: form.get("dados") });
  if (!entrada.success) {
    return NextResponse.json(
      { error: "Dados inválidos", issues: entrada.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  let dados: ResultadoTela;
  try {
    dados = JSON.parse(entrada.data.dados) as ResultadoTela;
  } catch {
    return NextResponse.json(
      { error: "O conteúdo enviado não é um JSON válido" },
      { status: 400 }
    );
  }
  if (!dados || typeof dados !== "object" || !Array.isArray(dados.criticas)) {
    return NextResponse.json(
      { error: "O JSON enviado não é um resultado de cenário" },
      { status: 400 }
    );
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
