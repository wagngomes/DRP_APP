import Link from "next/link";
import { headers } from "next/headers";

import { documentoOpenApi } from "@/lib/openapi";

/**
 * Documentação da API, renderizada a partir da própria especificação.
 *
 * Sem Swagger UI nem Scalar via CDN de propósito: em rede corporativa fechada
 * um visualizador que baixa script de fora simplesmente não carrega, e a
 * documentação some justamente onde ela mais precisa existir. Renderizar no
 * servidor a partir do mesmo objeto que serve `/api/openapi.json` custa pouco e
 * funciona offline.
 *
 * Pública por decisão: descreve o contrato, não expõe dado. Quem quiser chamar
 * as rotas ainda precisa de sessão.
 */
export const dynamic = "force-dynamic";

const COR_METODO: Record<string, string> = {
  get: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  post: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  patch: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  delete: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

type Operacao = {
  tags?: string[];
  summary?: string;
  description?: string;
  parameters?: { name: string; in: string; required?: boolean; schema?: unknown }[];
  requestBody?: { content?: Record<string, unknown> };
  responses?: Record<string, { description?: string }>;
  security?: unknown[];
};

const METODOS = ["get", "post", "patch", "put", "delete"] as const;

export default async function Docs() {
  const cabecalhos = await headers();
  const host = cabecalhos.get("host") ?? "localhost:3000";
  const protocolo = cabecalhos.get("x-forwarded-proto") ?? "http";
  const doc = documentoOpenApi(`${protocolo}://${host}`);

  const rotas = Object.entries(doc.paths as Record<string, Record<string, unknown>>);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="border-b-4 border-(--brand-petrol) pb-6">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          OpenAPI 3.0.3
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-(--brand-petrol) dark:text-foreground">
          {doc.info.title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {doc.info.description}
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link
            href="/api/openapi.json"
            className="rounded-md border px-3 py-1.5 font-medium hover:bg-muted"
          >
            Baixar especificação JSON
          </Link>
          <Link href="/" className="rounded-md border px-3 py-1.5 font-medium hover:bg-muted">
            Voltar ao sistema
          </Link>
        </div>
      </header>

      <div className="mt-8 flex flex-col gap-8">
        {rotas.map(([caminho, operacoes]) => {
          const parametrosDaRota = (operacoes.parameters ?? []) as Operacao["parameters"];

          return (
            <section key={caminho} className="flex flex-col gap-3">
              <h2 className="font-mono text-lg font-semibold">{caminho}</h2>

              {METODOS.filter((m) => operacoes[m]).map((metodo) => {
                const op = operacoes[metodo] as Operacao;
                const parametros = [...(parametrosDaRota ?? []), ...(op.parameters ?? [])];
                const semSessao = Array.isArray(op.security) && op.security.length === 0;

                return (
                  <article key={metodo} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={`rounded px-2 py-0.5 font-mono text-xs font-bold uppercase ${
                          COR_METODO[metodo] ?? "bg-muted"
                        }`}
                      >
                        {metodo}
                      </span>
                      <span className="font-medium">{op.summary}</span>
                      <span className="ml-auto font-mono text-xs text-muted-foreground">
                        {semSessao ? "sem sessão" : "requer sessão"}
                      </span>
                    </div>

                    {op.description ? (
                      <p className="mt-2 text-sm text-muted-foreground">{op.description}</p>
                    ) : null}

                    {parametros.length > 0 ? (
                      <div className="mt-3">
                        <p className="mb-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                          Parâmetros
                        </p>
                        <ul className="flex flex-col gap-1 text-sm">
                          {parametros.map((p) => (
                            <li key={`${p.in}-${p.name}`} className="flex flex-wrap gap-2">
                              <code className="font-mono text-xs">{p.name}</code>
                              <span className="text-xs text-muted-foreground">
                                {p.in}
                                {p.required ? " · obrigatório" : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {op.requestBody?.content ? (
                      <div className="mt-3">
                        <p className="mb-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                          Corpo
                        </p>
                        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                          {JSON.stringify(op.requestBody.content, null, 2)}
                        </pre>
                      </div>
                    ) : null}

                    <div className="mt-3">
                      <p className="mb-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                        Respostas
                      </p>
                      <ul className="flex flex-col gap-1 text-sm">
                        {Object.entries(op.responses ?? {}).map(([codigo, r]) => (
                          <li key={codigo} className="flex gap-2">
                            <code className="font-mono text-xs font-semibold">{codigo}</code>
                            <span className="text-xs text-muted-foreground">
                              {r.description}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
    </main>
  );
}
