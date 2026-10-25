import { NextResponse, type NextRequest } from "next/server";

import { exigirSessao } from "@/lib/autorizacao";
import {
  gerarPlanilhaTrecho,
  nomeArquivoTrecho,
  type DadosPlanilhaTrecho,
} from "@/lib/triangulacoes/planilha";
import { exportarTrechoSchema } from "@/lib/openapi";

/**
 * Download do detalhe de um trecho em Excel.
 *
 * Fina de propósito: autorização, leitura da entrada e resposta. A montagem e a
 * formatação ficam em `lib/triangulacoes/planilha.ts`, onde dá para testar sem
 * HTTP.
 *
 * **Sessão, e não administrador.** A rota do cenário exige admin porque exporta
 * uma análise que o sistema produziu; aqui o arquivo é a mesma tabela que a
 * pessoa está vendo na tela, que já é de sessão. Exigir admin tornaria o botão
 * inútil justamente para quem usa a tela.
 *
 * Recebe as linhas que a tela montou, em vez de refazer a consulta: a projeção
 * depende da data de referência e dos parâmetros de dias para vencidas, e
 * recalcular poderia devolver datas diferentes das que a pessoa viu ao clicar.
 */
export async function POST(request: NextRequest) {
  await exigirSessao();

  const form = await request.formData();
  const entrada = exportarTrechoSchema.safeParse({ dados: form.get("dados") });
  if (!entrada.success) {
    return NextResponse.json(
      { error: "Dados inválidos", issues: entrada.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  let dados: DadosPlanilhaTrecho;
  try {
    dados = JSON.parse(entrada.data.dados) as DadosPlanilhaTrecho;
  } catch {
    return NextResponse.json(
      { error: "O conteúdo enviado não é um JSON válido" },
      { status: 400 },
    );
  }

  if (
    !dados ||
    typeof dados !== "object" ||
    typeof dados.de !== "string" ||
    typeof dados.para !== "string" ||
    !Array.isArray(dados.linhas)
  ) {
    return NextResponse.json(
      { error: "O JSON enviado não é o detalhe de um trecho" },
      { status: 400 },
    );
  }

  const buffer = await gerarPlanilhaTrecho(dados);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivoTrecho(dados)}"`,
    },
  });
}
