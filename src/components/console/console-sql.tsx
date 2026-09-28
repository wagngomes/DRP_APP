"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  Database,
  Download,
  Loader2,
  Play,
  Table2,
  Timer,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ResultadoConsulta } from "@/lib/console/executar";

/**
 * Console SQL administrativo.
 *
 * Editor em cima, resultado embaixo, atalho para executar. A trava de escrita
 * está no servidor, em transação somente-leitura — não há aqui nenhuma validação
 * do texto, porque validação de texto não segura SQL.
 *
 * O que esta tela faz de útil é o entorno: o atalho que evita ir ao mouse a cada
 * tentativa, a lista de tabelas que evita decorar nomes, e o aviso de corte —
 * sem ele, mil linhas parecem o resultado inteiro e a conclusão sai errada.
 */

const EXEMPLOS: { rotulo: string; sql: string }[] = [
  {
    rotulo: "Tabelas e tamanho",
    sql: [
      "SELECT relname AS tabela,",
      "       n_live_tup AS linhas,",
      "       pg_size_pretty(pg_total_relation_size(relid)) AS tamanho",
      "  FROM pg_stat_user_tables",
      " ORDER BY pg_total_relation_size(relid) DESC",
    ].join("\n"),
  },
  {
    rotulo: "Colunas de uma tabela",
    sql: [
      "SELECT column_name AS coluna, data_type AS tipo, is_nullable AS aceita_nulo",
      "  FROM information_schema.columns",
      " WHERE table_name = 'forecast'",
      " ORDER BY ordinal_position",
    ].join("\n"),
  },
  {
    rotulo: "Datas de carga",
    sql: [
      "SELECT data_snapshot::date AS carga, count(*) AS linhas",
      "  FROM simulador",
      " GROUP BY 1",
      " ORDER BY 1 DESC",
    ].join("\n"),
  },
];

function Chip({
  icone: Icone,
  children,
}: {
  icone: typeof Timer;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 font-mono text-xs tabular-nums">
      <Icone className="size-3.5 text-muted-foreground" />
      {children}
    </span>
  );
}

export function ConsoleSql({ tabelas }: { tabelas: string[] }) {
  const [sql, setSql] = useState(EXEMPLOS[0].sql);
  const [resultado, setResultado] = useState<ResultadoConsulta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [rodando, setRodando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);

  async function executar() {
    if (!sql.trim() || rodando) return;
    setRodando(true);
    setErro(null);
    try {
      const r = await fetch("/api/console", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql, formato: "json" }),
      });
      const corpo = await r.json();
      if (!r.ok) {
        setErro(corpo.erro ?? "Falha ao executar a consulta.");
        setResultado(null);
      } else {
        setResultado(corpo);
      }
    } catch {
      setErro("Não foi possível falar com o servidor.");
    } finally {
      setRodando(false);
    }
  }

  async function exportar() {
    if (!sql.trim() || exportando) return;
    setExportando(true);
    try {
      const r = await fetch("/api/console", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql, formato: "xlsx" }),
      });
      if (!r.ok) {
        setErro((await r.json()).erro ?? "Falha ao exportar.");
        return;
      }
      // O arquivo vem como blob e é baixado por um link temporário: é o caminho
      // que preserva o nome definido pelo servidor no Content-Disposition.
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        r.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ??
        "consulta.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_230px]">
      <div className="min-w-0 space-y-4">
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-3 py-2">
            <span className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <Database className="size-3.5" />
              Consulta
            </span>
            <div className="flex items-center gap-2">
              <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">
                Ctrl + Enter
              </span>
              <Button
                size="sm"
                onClick={executar}
                disabled={rodando || !sql.trim()}
              >
                {rodando ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                Executar
              </Button>
            </div>
          </div>

          <textarea
            ref={editor}
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={(e) => {
              // Ctrl/Cmd + Enter executa. Numa tela de tentativa e erro, ir ao
              // mouse a cada rodada é o que mais cansa.
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                void executar();
              }
            }}
            spellCheck={false}
            className="block h-56 w-full resize-y bg-transparent p-3 font-mono text-[13px] leading-relaxed outline-none"
            placeholder="SELECT ..."
          />
        </div>

        {erro ? (
          <div className="flex gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-rose-700 dark:text-rose-400">
                O banco recusou a consulta
              </p>
              {/* A mensagem do Postgres vai inteira: é ela que diz qual coluna
                  não existe, e é por ela que se corrige o comando. */}
              <pre className="mt-1 overflow-x-auto font-mono text-xs whitespace-pre-wrap text-muted-foreground">
                {erro}
              </pre>
            </div>
          </div>
        ) : null}

        {resultado ? (
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2">
              <Chip
                icone={Table2}
              >{`${resultado.total.toLocaleString("pt-BR")} linha(s)`}</Chip>
              <Chip icone={Timer}>{`${resultado.duracaoMs} ms`}</Chip>
              {resultado.truncado ? (
                // Sem este aviso, mil linhas passam por "o resultado inteiro" e
                // a conclusão tirada delas sai errada.
                <span className="rounded-md bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                  {`mostrando as primeiras ${resultado.linhas.length.toLocaleString("pt-BR")}`}
                </span>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={exportar}
                disabled={exportando || resultado.total === 0}
              >
                {exportando ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Excel
              </Button>
            </div>

            {resultado.linhas.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                A consulta não devolveu nenhuma linha.
              </p>
            ) : (
              <div className="max-h-[60vh] overflow-auto">
                <table className="w-full border-collapse text-sm">
                  {/* Cabeçalho fixo: rolando trezentas linhas sem ele, não se
                      sabe mais qual coluna é qual. */}
                  <thead className="sticky top-0 z-10 bg-muted">
                    <tr>
                      {resultado.colunas.map((c) => (
                        <th
                          key={c}
                          className="border-b px-3 py-2 text-left font-mono text-xs font-semibold whitespace-nowrap"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.linhas.map((linha, i) => (
                      <tr
                        key={i}
                        className="even:bg-muted/30 hover:bg-muted/60"
                      >
                        {resultado.colunas.map((c) => {
                          const v = linha[c];
                          return (
                            <td
                              key={c}
                              className="max-w-xs truncate border-b px-3 py-1.5 font-mono text-xs"
                              title={v === null ? "" : String(v)}
                            >
                              {v === null ? (
                                <span className="text-muted-foreground italic">
                                  null
                                </span>
                              ) : typeof v === "number" ? (
                                <span className="tabular-nums">
                                  {v.toLocaleString("pt-BR")}
                                </span>
                              ) : (
                                String(v)
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border bg-card p-3">
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Exemplos
          </p>
          <div className="grid gap-1">
            {EXEMPLOS.map((e) => (
              <button
                key={e.rotulo}
                type="button"
                onClick={() => setSql(e.sql)}
                className="rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                {e.rotulo}
              </button>
            ))}
          </div>
        </div>

        {/* A lista existe para não precisar decorar nome de tabela — clicar
            acrescenta o nome ao fim da consulta. */}
        <div className="rounded-xl border bg-card p-3">
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {`Tabelas · ${tabelas.length}`}
          </p>
          <div className="grid max-h-80 gap-0.5 overflow-y-auto">
            {tabelas.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setSql((atual) => `${atual.trimEnd()}\n${t}`);
                  editor.current?.focus();
                }}
                className="rounded px-2 py-1 text-left font-mono text-xs hover:bg-muted"
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
