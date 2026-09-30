import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { exigirAdminOuErro } from "@/lib/autorizacao";
import {
  executarConsulta,
  LIMITE_EXPORTACAO,
  LIMITE_TELA,
} from "@/lib/console/executar";
import { registrar } from "@/lib/seguranca/auditoria";
import { CONSOLE_SIMULTANEO, CONSOLE_SQL } from "@/lib/seguranca/limites";
import {
  sair,
  tentarEntrar,
  verificarCamadas,
} from "@/lib/seguranca/rate-limit";

/**
 * Execução de SQL pelo console administrativo.
 *
 * A segurança desta rota está em `executarConsulta`, que roda tudo em transação
 * somente-leitura — ver o comentário de lá. Aqui ficam três coisas: quem pode
 * chamar, o registro de quem chamou, e a forma da resposta.
 *
 * O registro não é detalhe. Uma tela que executa SQL arbitrário sem deixar
 * rastro é a que ninguém consegue investigar depois; com ele, `docker compose
 * logs app | grep SEGURANCA` responde quem rodou o quê e quando.
 */

const corpoSchema = z.object({
  sql: z.string().trim().min(1, "Escreva uma consulta.").max(20_000),
  formato: z.enum(["json", "xlsx"]).default("json"),
});

export async function POST(req: NextRequest) {
  const autorizado = await exigirAdminOuErro();
  if (!autorizado.ok) {
    return NextResponse.json(
      { erro: autorizado.erro },
      { status: autorizado.status },
    );
  }

  const corpo = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!corpo.success) {
    return NextResponse.json(
      { erro: corpo.error.issues[0].message },
      { status: 400 },
    );
  }

  const ator = autorizado.sessao.usuario;

  // Teto por minuto. Folgado para quem investiga — a pessoa lê o resultado antes
  // de escrever a próxima consulta — e existe para o caso de laço acidental.
  //
  // As rotas de API não passam pelo proxy (o matcher exclui `/api`), então sem
  // isto aqui não havia teto nenhum.
  const veredito = verificarCamadas(`console:${ator.id}`, CONSOLE_SQL);
  if (!veredito.permitido) {
    return NextResponse.json(
      {
        erro: "Muitas consultas seguidas. Aguarde alguns instantes.",
        retryAfterSegundos: veredito.esperarSegundos,
      },
      {
        status: 429,
        headers: { "Retry-After": String(veredito.esperarSegundos) },
      },
    );
  }

  const { sql, formato } = corpo.data;
  const limite = formato === "xlsx" ? LIMITE_EXPORTACAO : LIMITE_TELA;

  // A consulta inteira vai para o log, e é intencional: numa tela de SQL, o
  // comando **é** a ação. Guardar só "executou uma consulta" não serviria para
  // nada na hora de entender o que aconteceu.
  registrar("consulta_sql", {
    ator: ator.email,
    detalhe: `${formato} · ${sql.replace(/\s+/g, " ").slice(0, 500)}`,
  });

  // Duas por vez. É a concorrência que derruba: cada consulta pode durar dez
  // segundos, a máquina tem dois núcleos e o pool do Prisma abre cinco conexões.
  // Meia dúzia de consultas pesadas ao mesmo tempo esgota o pool e a aplicação
  // inteira para de responder — inclusive para quem não está no console.
  const chaveConcorrencia = `console:${ator.id}`;
  if (!tentarEntrar(chaveConcorrencia, CONSOLE_SIMULTANEO)) {
    return NextResponse.json(
      { erro: "Já há consultas em andamento. Espere elas terminarem." },
      { status: 429 },
    );
  }

  let resultado;
  try {
    resultado = await executarConsulta(sql, limite);
  } catch (erro) {
    // A mensagem do Postgres vai inteira para a tela, ao contrário do que fazemos
    // em rotas públicas. Aqui ela é o produto: "column x does not exist" é o que
    // permite corrigir a consulta, e quem a lê já tem acesso ao banco.
    return NextResponse.json(
      {
        erro:
          erro instanceof Error
            ? erro.message
            : "Falha ao executar a consulta.",
      },
      { status: 400 },
    );
  } finally {
    // `finally` para o contador voltar mesmo quando a consulta falha — senão o
    // primeiro erro de sintaxe bloquearia a pessoa até o processo reiniciar.
    sair(chaveConcorrencia);
  }

  if (formato === "json") return NextResponse.json(resultado);

  const livro = new ExcelJS.Workbook();
  livro.creator = "DRP_AI";
  livro.created = new Date();
  const planilha = livro.addWorksheet("Consulta");

  planilha.columns = resultado.colunas.map((c) => ({
    header: c,
    key: c,
    // Largura pelo nome da coluna, com piso e teto: sem isso toda coluna sai com
    // a largura padrão e um `descricao` de 60 caracteres fica ilegível.
    width: Math.min(Math.max(c.length + 4, 12), 50),
  }));
  planilha.getRow(1).font = { bold: true };
  planilha.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF16455C" },
  };
  planilha.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  planilha.views = [{ state: "frozen", ySplit: 1 }];

  for (const linha of resultado.linhas) planilha.addRow(linha);

  // A consulta vai numa aba própria, não numa célula da primeira: quem receber
  // o arquivo depois consegue saber de onde os números vieram.
  const origem = livro.addWorksheet("Consulta SQL");
  origem.getColumn(1).width = 120;
  origem.addRow([`Executada em ${new Date().toLocaleString("pt-BR")}`]);
  origem.addRow([`${resultado.total} linha(s) em ${resultado.duracaoMs}ms`]);
  if (resultado.truncado) {
    origem.addRow([
      `Exportação limitada às primeiras ${LIMITE_EXPORTACAO} linhas.`,
    ]);
  }
  origem.addRow([]);
  const celulaSql = origem.addRow([sql]).getCell(1);
  celulaSql.alignment = { wrapText: true, vertical: "top" };
  celulaSql.font = { name: "Consolas", size: 10 };

  const buffer = await livro.xlsx.writeBuffer();
  const carimbo = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="consulta-${carimbo}.xlsx"`,
    },
  });
}
