import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getIdField, getImportModel, getTableName, IMPORT_MODEL_KEYS } from "@/lib/imports/config";
import { bulkLoadRecords } from "@/lib/imports/bulk-copy";
import { decodificarCsv, parseCsvForModel, SkipTracker } from "@/lib/imports/csv";
import { filterByReferences } from "@/lib/imports/references";
import { limparCacheReferencia } from "@/lib/cache-referencia";
import { metricas } from "@/lib/observabilidade/metricas";
import { IMPORTACAO, IMPORTACAO_SIMULTANEA } from "@/lib/seguranca/limites";
import { sair, tentarEntrar, verificarCamadas } from "@/lib/seguranca/rate-limit";

// Arquivos de 45k+ linhas levam mais que o limite padrão de execução.
export const maxDuration = 300;

type RouteParams = { params: Promise<{ model: string }> };

const modelParamSchema = z.enum(IMPORT_MODEL_KEYS);

// Selects vazios chegam como "" — tratados como "sem filtro" em vez de erro.
const optionalInt = (min: number, max: number) =>
  z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.number().int().min(min).max(max).optional()
  );

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  // Filtro por data do snapshot, só aplicável a models cumulativos.
  dia: optionalInt(1, 31),
  mes: optionalInt(1, 12),
  ano: optionalInt(1970, 9999),
});

// Dispatch genérico para o delegate correto do PrismaClient (produtos, fiscal, ...).
// Cada model tem um shape de colunas diferente, então o acesso aqui é
// estruturalmente tipado em vez de por model — evita 12 rotas quase idênticas.
// A gravação em massa não passa por aqui: fica no COPY de @/lib/imports/bulk-copy.
type ImportDelegate = {
  findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
  count: (args?: { where?: Record<string, unknown> }) => Promise<number>;
  deleteMany: (args?: { where?: Record<string, unknown> }) => Promise<{ count: number }>;
};

function getDelegate(delegateName: string): ImportDelegate {
  return (prisma as unknown as Record<string, ImportDelegate>)[delegateName];
}

async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { model: modelParam } = await params;
  const parsedModel = modelParamSchema.safeParse(modelParam);
  if (!parsedModel.success) {
    return NextResponse.json({ error: "Tabela inválida" }, { status: 400 });
  }
  const model = getImportModel(parsedModel.data)!;

  const query = listQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  if (!query.success) {
    return NextResponse.json(
      { error: "Parâmetros de paginação inválidos", issues: query.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const { page, pageSize, dia, mes, ano } = query.data;

  const delegate = getDelegate(model.delegate);

  // Datas de snapshot existentes: alimentam os selects de dia/mês/ano na tela
  // (só aparecem opções que de fato têm dados) e são a base do filtro.
  let snapshotDates: Date[] = [];
  let where: Record<string, unknown> | undefined;

  if (model.cumulative && model.snapshotField) {
    const field = model.snapshotField;
    const distinctRows = await delegate.findMany({
      distinct: [field],
      select: { [field]: true },
      orderBy: { [field]: "desc" },
    });
    snapshotDates = distinctRows
      .map((row) => row[field])
      .filter((value): value is Date => value instanceof Date);

    if (dia !== undefined || mes !== undefined || ano !== undefined) {
      // Filtrar a lista de datas (poucas, uma por upload) e usar `in` evita
      // montar intervalos por combinação de dia/mês/ano e mantém o índice em uso.
      const matching = snapshotDates.filter(
        (date) =>
          (dia === undefined || date.getUTCDate() === dia) &&
          (mes === undefined || date.getUTCMonth() + 1 === mes) &&
          (ano === undefined || date.getUTCFullYear() === ano)
      );
      where = { [field]: { in: matching } };
    }
  }

  const [rows, total] = await Promise.all([
    delegate.findMany({
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { [getIdField(model)]: "desc" },
      ...(where ? { where } : {}),
    }),
    delegate.count(where ? { where } : undefined),
  ]);

  return NextResponse.json({
    rows,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    // ISO yyyy-mm-dd — a hora não interessa e evita fuso na volta para a tela.
    snapshotDates: snapshotDates.map((date) => date.toISOString().slice(0, 10)),
  });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { model: modelParam } = await params;
  const parsedModel = modelParamSchema.safeParse(modelParam);
  if (!parsedModel.success) {
    return NextResponse.json({ error: "Tabela inválida" }, { status: 400 });
  }
  const model = getImportModel(parsedModel.data)!;


  // Teto por hora, verificado antes de ler o corpo: requisição recusada não
  // carrega o arquivo na memória, o que ajuda justamente nos CSV grandes.
  const veredito = verificarCamadas(`import:${session.user.id}`, IMPORTACAO);
  if (!veredito.permitido) {
    return NextResponse.json(
      {
        error: "Muitas importações seguidas. Aguarde antes de enviar outra.",
        retryAfterSegundos: veredito.esperarSegundos,
      },
      { status: 429, headers: { "Retry-After": String(veredito.esperarSegundos) } }
    );
  }

  // Uma por vez, por usuário: o que derruba o processo é carga simultânea,
  // não frequência — cada arquivo é carregado inteiro na memória, e este
  // processo já morreu por falta de heap.
  const chaveConcorrencia = `import:${session.user.id}`;
  if (!tentarEntrar(chaveConcorrencia, IMPORTACAO_SIMULTANEA)) {
    return NextResponse.json(
      { error: "Já existe uma importação em andamento. Aguarde ela terminar." },
      { status: 429 }
    );
  }

  try {
    return await executarImportacao(request, model);
  } finally {
    // `finally` para o contador voltar mesmo se a importação lançar — senão
    // a primeira falha bloquearia o usuário até o processo reiniciar.
    sair(chaveConcorrencia);
  }
}

/**
 * Teto do arquivo de importação.
 *
 * A maior base já carregada tem 162 MB, e o teto fica em quase o dobro para não
 * barrar crescimento normal. Existe porque o parser mantém o arquivo na memória
 * três vezes ao mesmo tempo — bytes crus, texto decodificado e objetos — o que
 * dá um pico perto de 1,5 GB para 187 MB de dados. Sem teto, um arquivo de
 * poucos gigabytes derruba o processo por falta de heap, e o servidor tem 8 GB
 * divididos com o banco.
 *
 * Recusar é melhor que morrer: quem enviou recebe 413 com o tamanho, em vez de
 * ver o sistema inteiro cair para todo mundo.
 */
export const TAMANHO_MAXIMO_BYTES = 300 * 1024 * 1024;

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

function erroDeTamanho(bytes: number): string {
  return (
    `Arquivo de ${mb(bytes)} — o limite é ${mb(TAMANHO_MAXIMO_BYTES)}. ` +
    "Divida a carga em partes ou fale com o administrador."
  );
}

/** Corpo da importação, separado para o controle de concorrência envolvê-lo. */
async function executarImportacao(
  request: NextRequest,
  model: NonNullable<ReturnType<typeof getImportModel>>
) {
  // Recusa pelo cabeçalho antes de ler o corpo: com `formData()` o arquivo
  // inteiro já entrou na memória, e aí o dano de um envio grande demais está
  // feito. `content-length` é do cliente e pode mentir, então o tamanho real é
  // conferido de novo logo abaixo — este teste barato evita o caso comum.
  const anunciado = Number(request.headers.get("content-length") ?? 0);
  if (anunciado > TAMANHO_MAXIMO_BYTES) {
    return NextResponse.json({ error: erroDeTamanho(anunciado) }, { status: 413 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Envie um arquivo CSV" }, { status: 400 });
  }

  if (file.size > TAMANHO_MAXIMO_BYTES) {
    return NextResponse.json({ error: erroDeTamanho(file.size) }, { status: 413 });
  }

  const csvText = decodificarCsv(await file.arrayBuffer());
  const { records, recordRows, totalRows, skippedRows, missingColumns } = parseCsvForModel(
    csvText,
    model
  );

  // Agrega os motivos: num arquivo grande um erro sistemático produz milhares
  // de linhas ignoradas idênticas, e é a contagem que explica a causa.
  const tracker = new SkipTracker();
  for (const item of skippedRows) tracker.add(item.row, item.reason);

  if (records.length === 0) {
    return NextResponse.json(
      {
        error: "Nenhuma linha válida encontrada no CSV",
        totalRows,
        skippedRows: tracker.sample,
        skippedSummary: tracker.summary(),
        missingColumns,
      },
      { status: 400 }
    );
  }

  // Valida FKs (ex: fiscal.codigo -> produtos.codigo) antes de tentar gravar —
  // uma linha com código inexistente derrubaria a transação inteira no banco.
  const { valid: validRecords, skipped: referenceSkips } = await filterByReferences(
    records,
    recordRows,
    model
  );
  for (const item of referenceSkips) tracker.add(item.row, item.reason);

  if (validRecords.length === 0) {
    return NextResponse.json(
      {
        error:
          "Nenhuma linha pôde ser importada: nenhum código encontrado na(s) tabela(s) de referência. Importe a tabela referenciada primeiro.",
        totalRows,
        skippedRows: tracker.sample,
        skippedSummary: tracker.summary(),
        missingColumns,
      },
      { status: 400 }
    );
  }

  // Tabelas cumulativas (ex: Pedidos de Compra) não apagam o histórico —
  // cada upload vira um novo snapshot do dia, marcado pelo servidor.
  if (model.cumulative && model.snapshotField) {
    const snapshotDate = new Date();
    snapshotDate.setUTCHours(0, 0, 0, 0);
    for (const record of validRecords) {
      record[model.snapshotField] = snapshotDate;
    }
  }

  let insertedCount: number;
  let duplicatesInBatch: number;
  try {
    ({ insertedCount, duplicatesInBatch } = await bulkLoadRecords(validRecords, model));
  } catch (error) {
    const details = error instanceof Error ? error.message : "erro desconhecido";
    console.error(`[import:${model.key}] falha ao gravar ${validRecords.length} linha(s):`, error);
    return NextResponse.json(
      { error: `Falha ao gravar os dados no banco: ${details}`, details },
      { status: 400 }
    );
  }

  return NextResponse.json({
    insertedCount,
    totalRows,
    skippedRows: tracker.sample,
    skippedSummary: tracker.summary(),
    skippedCount: tracker.total + duplicatesInBatch,
    duplicatesInBatch,
    missingColumns,
  });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { model: modelParam } = await params;
  const parsedModel = modelParamSchema.safeParse(modelParam);
  if (!parsedModel.success) {
    return NextResponse.json({ error: "Tabela inválida" }, { status: 400 });
  }
  const model = getImportModel(parsedModel.data)!;

  // Tabelas cumulativas acumulam um snapshot por carga: apagar tudo destruiria
  // o histórico inteiro, então dá para limitar a exclusão a datas escolhidas.
  // Aceita `?data=` repetido — o usuário pode marcar várias de uma vez.
  const datas = request.nextUrl.searchParams.getAll("data").filter(Boolean);
  let where: Record<string, unknown> | undefined;

  if (datas.length > 0) {
    if (!model.cumulative || !model.snapshotField) {
      return NextResponse.json(
        { error: "Esta tabela não guarda histórico por data" },
        { status: 400 }
      );
    }
    const invalida = datas.find((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d));
    if (invalida) {
      return NextResponse.json({ error: `Data inválida: ${invalida}` }, { status: 400 });
    }
    where = {
      [model.snapshotField]: {
        in: datas.map((d) => new Date(`${d}T00:00:00.000Z`)),
      },
    };
  }

  const delegate = getDelegate(model.delegate);
  const { count } = await delegate.deleteMany(where ? { where } : undefined);

  // Apagar também invalida as estatísticas: uma tabela que ficou muito menor
  // continua sendo planejada como se fosse grande, e o efeito é o mesmo da
  // importação sem ANALYZE — plano ruim, tela lenta.
  try {
    await prisma.$executeRawUnsafe(`ANALYZE "${getTableName(model)}"`);
  } catch (erro) {
    console.warn(`[import] ANALYZE após limpeza de ${model.key} falhou:`, erro);
  }

  limparCacheReferencia();

  return NextResponse.json({ deletedCount: count, datas });
}
