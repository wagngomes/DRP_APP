/**
 * Especificação OpenAPI 3.0 da API, gerada a partir dos schemas Zod.
 *
 * Gerada, e não escrita à mão, pelo motivo de sempre: documentação escrita à
 * parte descola do código na primeira alteração e passa a mentir. Aqui os
 * mesmos schemas que validam a requisição descrevem o contrato — mudou a
 * validação, mudou a documentação.
 *
 * Sem biblioteca de ponte: o Zod 4 traz `z.toJSONSchema()` embutido, e OpenAPI
 * 3.0 aceita JSON Schema com pequenas diferenças. A conversão fica em
 * `paraOpenApi()`, que é onde essas diferenças moram.
 */
import { z } from "zod";

import { IMPORT_MODEL_KEYS } from "@/lib/imports/config";
import { updateUserSchema } from "@/lib/validations/user";

/** Schema de um upload de CSV — multipart não é descrito por Zod. */
const CORPO_UPLOAD = {
  "multipart/form-data": {
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary", description: "Arquivo CSV" },
      },
      required: ["file"],
    },
  },
} as const;

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

export const exportarCenarioSchema = z.object({
  dados: z.string().min(2, "Envie o resultado da análise em JSON"),
});

export const limparTabelaSchema = z.object({
  datas: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
});

/**
 * Converte um schema Zod em Schema Object do OpenAPI 3.0.
 *
 * `target: "draft-7"` porque OpenAPI 3.0 deriva desse rascunho; sem isso o Zod
 * emite construções do 2020-12 que geradores de cliente não entendem. O
 * `$schema` é removido: é válido em JSON Schema e inválido dentro do OpenAPI.
 */
function paraOpenApi(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, {
    target: "draft-7",
    io: "input",
  }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

function respostaJson(descricao: string, schema?: z.ZodType) {
  return {
    description: descricao,
    ...(schema
      ? { content: { "application/json": { schema: paraOpenApi(schema) } } }
      : {}),
  };
}

const erroSchema = z.object({
  error: z.string(),
  issues: z.record(z.string(), z.array(z.string())).optional(),
});

const saudeSchema = z.object({
  status: z.enum(["ok", "degradado"]),
  banco: z.object({
    conectado: z.boolean(),
    latenciaMs: z.number(),
    erro: z.string().optional(),
  }),
  versao: z.string().optional(),
  tempoDeVidaSegundos: z.number().optional(),
  em: z.string(),
});

const resultadoImportacaoSchema = z.object({
  insertedCount: z.number().optional(),
  skippedCount: z.number(),
  duplicatesInBatch: z.number(),
  missingColumns: z.array(z.string()),
});

const TABELAS = [...IMPORT_MODEL_KEYS];

/** Documento completo, montado a cada chamada para refletir o código atual. */
export function documentoOpenApi(baseUrl: string) {
  return {
    openapi: "3.0.3",
    info: {
      title: "DRP_AI — API",
      version: "1.0.0",
      description:
        "API do sistema de planejamento de distribuição. As rotas são consumidas " +
        "pela própria aplicação; a autenticação é por cookie de sessão, emitido " +
        "pelo fluxo de login. Saúde e métricas não exigem sessão porque são " +
        "consumidas por orquestrador e coletor.",
    },
    servers: [{ url: baseUrl }],
    tags: [
      { name: "Operação", description: "Saúde e métricas para infraestrutura" },
      { name: "Importações", description: "Carga e limpeza das bases operacionais" },
      { name: "Usuário", description: "Perfil do usuário autenticado" },
      { name: "Cenários", description: "Exportação das análises hipotéticas" },
    ],
    paths: {
      "/api/health": {
        get: {
          tags: ["Operação"],
          summary: "Saúde da aplicação",
          description:
            "Verifica a conectividade com o banco. Responde 503 quando o banco " +
            "não responde, para o orquestrador reiniciar ou tirar a instância " +
            "do balanceador.",
          security: [],
          responses: {
            200: respostaJson("Aplicação e banco saudáveis", saudeSchema),
            503: respostaJson("Banco inacessível", saudeSchema),
          },
        },
      },
      "/api/metrics": {
        get: {
          tags: ["Operação"],
          summary: "Métricas no formato Prometheus",
          security: [],
          responses: {
            200: {
              description: "Métricas em texto de exposição",
              content: { "text/plain": { schema: { type: "string" } } },
            },
          },
        },
      },
      "/api/imports/{model}": {
        parameters: [
          {
            name: "model",
            in: "path",
            required: true,
            description: "Tabela de destino",
            schema: { type: "string", enum: TABELAS },
          },
        ],
        get: {
          tags: ["Importações"],
          summary: "Lista os dados importados, paginados",
          parameters: [
            {
              name: "page",
              in: "query",
              schema: { type: "integer", minimum: 1, default: 1 },
            },
            {
              name: "pageSize",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 200, default: 25 },
            },
          ],
          responses: {
            200: {
              description: "Página de registros",
              content: { "application/json": { schema: { type: "object" } } },
            },
            400: respostaJson("Tabela inválida ou parâmetros fora do formato", erroSchema),
            401: respostaJson("Sem sessão", erroSchema),
          },
        },
        post: {
          tags: ["Importações"],
          summary: "Importa um arquivo CSV",
          requestBody: { required: true, content: CORPO_UPLOAD },
          responses: {
            200: respostaJson("Importação concluída", resultadoImportacaoSchema),
            400: respostaJson("Arquivo ausente, tabela inválida ou CSV malformado", erroSchema),
            401: respostaJson("Sem sessão", erroSchema),
          },
        },
        delete: {
          tags: ["Importações"],
          summary: "Limpa a tabela, opcionalmente só alguns snapshots",
          requestBody: {
            required: false,
            content: {
              "application/json": { schema: paraOpenApi(limparTabelaSchema) },
            },
          },
          responses: {
            200: respostaJson(
              "Registros apagados",
              z.object({ deletedCount: z.number(), datas: z.array(z.string()).optional() })
            ),
            400: respostaJson("Tabela ou data inválida", erroSchema),
            401: respostaJson("Sem sessão", erroSchema),
          },
        },
      },
      "/api/users/me": {
        patch: {
          tags: ["Usuário"],
          summary: "Atualiza o perfil do usuário autenticado",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: paraOpenApi(updateUserSchema) },
            },
          },
          responses: {
            200: respostaJson("Perfil atualizado"),
            400: respostaJson("Dados inválidos", erroSchema),
            401: respostaJson("Sem sessão", erroSchema),
          },
        },
      },
      "/api/cenarios/excel": {
        post: {
          tags: ["Cenários"],
          summary: "Exporta uma análise de cenário para Excel",
          description:
            "Recebe o resultado que a tela já tem em mãos, em vez de refazer a " +
            "análise: repetir custaria duas chamadas de IA e o texto sairia " +
            "diferente do que o usuário leu.",
          requestBody: {
            required: true,
            content: {
              "application/x-www-form-urlencoded": {
                schema: paraOpenApi(exportarCenarioSchema),
              },
            },
          },
          responses: {
            200: {
              description: "Planilha .xlsx",
              content: {
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
                  schema: { type: "string", format: "binary" },
                },
              },
            },
            400: respostaJson("Dados ausentes ou inválidos", erroSchema),
            401: respostaJson("Sem sessão", erroSchema),
          },
        },
      },
    },
    components: {
      securitySchemes: {
        sessaoCookie: {
          type: "apiKey",
          in: "cookie",
          name: "better-auth.session_token",
          description: "Cookie de sessão emitido pelo login.",
        },
      },
    },
    security: [{ sessaoCookie: [] }],
  };
}
