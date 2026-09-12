"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, Trash2, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getDisplayColumns,
  getIdField,
  humanizeColumn,
  type ImportColumn,
  type ImportModelConfig,
} from "@/lib/imports/config";

const PAGE_SIZE = 25;

/** Valor sentinela dos selects de filtro — significa "sem filtro". */
const ALL = "todos";

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

type ListResponse = {
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageCount: number;
  /** Datas (yyyy-mm-dd) com dados — só vem para tabelas cumulativas. */
  snapshotDates?: string[];
};

type SnapshotFilters = { dia: string; mes: string; ano: string };

/** Resultado da última importação, para o usuário revisar sem pressa. */
type ResultadoImport = {
  inseridos: number;
  totalLinhas: number;
  ignoradas: number;
  linhasIgnoradas: { row: number; reason: string }[];
  resumo: { count: number; reason: string }[];
  colunasAusentes: string[];
};

/**
 * Baixa as linhas ignoradas como CSV.
 *
 * O aviso na tela mostra os motivos agregados, mas reconciliar cadastro exige a
 * lista completa — quais linhas e quais códigos foram recusados.
 */
function baixarIgnoradas(modelo: string, linhas: { row: number; reason: string }[]) {
  const escapar = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const conteudo = [
    "linha;motivo",
    ...linhas.map((l) => `${l.row};${escapar(l.reason)}`),
  ].join("\n");
  // BOM para o Excel abrir com acentuação correta.
  const blob = new Blob(["﻿" + conteudo], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `linhas-ignoradas-${modelo}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  // `items` faz o SelectValue exibir o rótulo em vez do valor cru.
  const items = [{ value: ALL, label: `${label}: todos` }, ...options];
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => onChange(String(next))}
    >
      <SelectTrigger size="sm" className="min-w-36" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function formatCellValue(value: unknown, type: ImportColumn["type"]) {
  if (value === null || value === undefined) return "—";

  if (type === "date") {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  }

  if (type === "decimal") {
    const num = Number(value);
    if (Number.isNaN(num)) return String(value);
    return num.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
  }

  return String(value);
}

export function ImportTabPanel({
  model,
  podeEditar,
}: {
  model: ImportModelConfig;
  /**
   * Consulta vê a tabela e os filtros; importar e limpar substituem a base
   * inteira e ficam de fora. Os botões continuam visíveis, desabilitados e com
   * o motivo no `title` — sumir com eles faria a pessoa procurar o que não
   * existe.
   */
  podeEditar: boolean;
}) {
  const { key: modelKey, label } = model;
  const idField = getIdField(model);
  const isCumulative = Boolean(model.cumulative && model.snapshotField);
  const columns = getDisplayColumns(model);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  /** Datas marcadas para exclusão; vazio = apagar a tabela inteira. */
  const [datasParaLimpar, setDatasParaLimpar] = useState<Set<string>>(new Set());
  const [resultado, setResultado] = useState<ResultadoImport | null>(null);
  const [snapshotDates, setSnapshotDates] = useState<string[]>([]);
  const [filters, setFilters] = useState<SnapshotFilters>({
    dia: ALL,
    mes: ALL,
    ano: ALL,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadPage = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(targetPage),
          pageSize: String(PAGE_SIZE),
        });
        if (isCumulative) {
          for (const [key, value] of Object.entries(filters)) {
            if (value !== ALL) params.set(key, value);
          }
        }
        const response = await fetch(`/api/imports/${modelKey}?${params}`);
        if (!response.ok) throw new Error("Falha ao carregar os dados");
        const data: ListResponse = await response.json();
        setRows(data.rows);
        setPage(data.page);
        setPageCount(data.pageCount);
        setTotal(data.total);
        setSnapshotDates(data.snapshotDates ?? []);
      } catch {
        toast.error(`Não foi possível carregar os dados de ${label}`);
      } finally {
        setLoading(false);
      }
    },
    [modelKey, label, isCumulative, filters]
  );

  useEffect(() => {
    // Adiado para fora do corpo síncrono do efeito (loadPage seta estado de
    // loading de imediato) — evita o aviso de setState síncrono em efeito.
    // `loadPage` muda junto com os filtros, então trocar um filtro recarrega
    // a listagem já a partir da primeira página.
    queueMicrotask(() => {
      loadPage(1);
    });
  }, [loadPage]);

  // Opções dos selects vêm das datas que realmente têm dados — nunca oferece
  // um dia/mês/ano que resultaria em tabela vazia por não existir upload.
  const { anos, meses, dias } = useMemo(() => {
    const parts = snapshotDates.map((date) => date.split("-").map(Number));
    const unique = (values: number[]) => [...new Set(values)];
    return {
      anos: unique(parts.map((p) => p[0])).sort((a, b) => b - a),
      meses: unique(parts.map((p) => p[1])).sort((a, b) => a - b),
      dias: unique(parts.map((p) => p[2])).sort((a, b) => a - b),
    };
  }, [snapshotDates]);

  const hasActiveFilter = Object.values(filters).some((value) => value !== ALL);

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/imports/${modelKey}`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        // O motivo real (coluna faltando, linha inválida, erro do banco) fica em
        // campos separados — sem eles a mensagem genérica manda o usuário
        // procurar problema nas colunas mesmo quando o CSV está correto.
        const causes: string[] = [];
        if (data.missingColumns?.length) {
          causes.push(`Colunas ausentes no CSV: ${data.missingColumns.join(", ")}.`);
        }
        // O resumo agrupado vem antes das linhas soltas: quando o arquivo
        // inteiro falha pelo mesmo motivo, a contagem é o que explica a causa.
        if (data.skippedSummary?.length) {
          causes.push(
            data.skippedSummary
              .map((s: { count: number; reason: string }) => `${s.count} linha(s): ${s.reason}`)
              .join(" | ")
          );
        } else if (data.skippedRows?.length) {
          const [first] = data.skippedRows;
          causes.push(`Ex.: linha ${first.row} — ${first.reason}.`);
        }
        setResultado({
          inseridos: 0,
          totalLinhas: data.totalRows ?? 0,
          ignoradas: data.totalRows ?? 0,
          linhasIgnoradas: data.skippedRows ?? [],
          resumo: data.skippedSummary ?? [],
          colunasAusentes: data.missingColumns ?? [],
        });
        toast.error(data.error ?? "Falha ao importar o CSV", {
          description: causes.join(" ") || undefined,
        });
        return;
      }

      setResultado({
        inseridos: data.insertedCount ?? 0,
        totalLinhas: data.totalRows ?? 0,
        ignoradas: data.skippedCount ?? 0,
        linhasIgnoradas: data.skippedRows ?? [],
        resumo: data.skippedSummary ?? [],
        colunasAusentes: data.missingColumns ?? [],
      });
      const skippedMsg = data.skippedCount > 0 ? ` (${data.skippedCount} linha(s) ignorada(s))` : "";
      toast.success(`${data.insertedCount} registro(s) importado(s) em ${label}${skippedMsg}`, {
        description: data.missingColumns?.length
          ? `Colunas não encontradas no CSV, gravadas como vazias: ${data.missingColumns.join(", ")}`
          : undefined,
      });
      await loadPage(1);
    } catch {
      toast.error("Falha ao importar o CSV");
    } finally {
      setUploading(false);
    }
  }

  async function handleClear() {
    setClearing(true);
    try {
      const params = new URLSearchParams();
      for (const d of datasParaLimpar) params.append("data", d);
      const qs = params.toString();
      const response = await fetch(
        qs ? `/api/imports/${modelKey}?${qs}` : `/api/imports/${modelKey}`,
        { method: "DELETE" }
      );
      if (!response.ok) throw new Error("Falha ao limpar a tabela");
      const data = await response.json();
      const alvo =
        datasParaLimpar.size === 0
          ? ""
          : datasParaLimpar.size === 1
            ? ` de ${formatarData([...datasParaLimpar][0])}`
            : ` em ${datasParaLimpar.size} cargas`;
      toast.success(`${data.deletedCount} registro(s) removido(s) de ${label}${alvo}`);
      setDatasParaLimpar(new Set());
      setConfirmOpen(false);
      await loadPage(1);
    } catch {
      toast.error(`Não foi possível limpar a tabela ${label}`);
    } finally {
      setClearing(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>{label}</CardTitle>
          <CardDescription>
            {total} registro(s) {hasActiveFilter ? "no filtro atual" : "na tabela"}
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileSelected}
          />
          <Button
            variant="outline"
            onClick={() => setConfirmOpen(true)}
            disabled={!podeEditar || clearing || loading}
            title={podeEditar ? undefined : "Exige perfil de administrador"}
          >
            <Trash2 className="size-4" />
            Limpar tabela
          </Button>
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={!podeEditar || uploading}
            title={podeEditar ? undefined : "Exige perfil de administrador"}
            className="bg-(--brand-turquoise) text-(--brand-petrol) hover:bg-(--brand-turquoise)/90"
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
            Importar CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {resultado && resultado.ignoradas > 0 ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 dark:bg-amber-950/20">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
                  {`${resultado.ignoradas} linha(s) ignorada(s) de ${resultado.totalLinhas}`}
                  {resultado.inseridos > 0 ? ` · ${resultado.inseridos} gravada(s)` : ""}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {resultado.resumo.map((r) => (
                    <li key={r.reason} className="text-xs text-muted-foreground">
                      {`${r.count}× ${r.reason}`}
                    </li>
                  ))}
                  {resultado.colunasAusentes.length > 0 ? (
                    <li className="text-xs text-muted-foreground">
                      {`Colunas ausentes no CSV: ${resultado.colunasAusentes.join(", ")}`}
                    </li>
                  ) : null}
                </ul>
                {resultado.ignoradas > resultado.linhasIgnoradas.length ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {`O arquivo baixado traz as primeiras ${resultado.linhasIgnoradas.length}.`}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => baixarIgnoradas(modelKey, resultado.linhasIgnoradas)}
                  disabled={resultado.linhasIgnoradas.length === 0}
                >
                  <Download className="size-4" />
                  Baixar linhas ignoradas
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setResultado(null)} aria-label="Fechar aviso">
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {isCumulative && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-3">
            <span className="mr-1 text-sm font-medium text-(--brand-petrol)">
              Filtrar por data do snapshot
            </span>
            <FilterSelect
              label="Dia"
              value={filters.dia}
              onChange={(dia) => setFilters((prev) => ({ ...prev, dia }))}
              options={dias.map((d) => ({ value: String(d), label: String(d) }))}
            />
            <FilterSelect
              label="Mês"
              value={filters.mes}
              onChange={(mes) => setFilters((prev) => ({ ...prev, mes }))}
              options={meses.map((m) => ({
                value: String(m),
                label: MONTH_NAMES[m - 1] ?? String(m),
              }))}
            />
            <FilterSelect
              label="Ano"
              value={filters.ano}
              onChange={(ano) => setFilters((prev) => ({ ...prev, ano }))}
              options={anos.map((a) => ({ value: String(a), label: String(a) }))}
            />
            {hasActiveFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilters({ dia: ALL, mes: ALL, ano: ALL })}
              >
                Limpar filtro
              </Button>
            )}
            <span className="ml-auto text-sm text-muted-foreground">
              {snapshotDates.length} dia(s) importado(s)
            </span>
          </div>
        )}

        <div className="max-h-[28rem] overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column.field}>{humanizeColumn(column.field)}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">
                    {hasActiveFilter
                      ? "Nenhum registro para a data selecionada."
                      : "Nenhum dado importado ainda."}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={String(row[idField])}>
                    {columns.map((column) => (
                      <TableCell key={column.field}>
                        {formatCellValue(row[column.field], column.type)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Página {page} de {pageCount}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadPage(page - 1)}
              disabled={loading || page <= 1}
            >
              <ChevronLeft className="size-4" />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadPage(page + 1)}
              disabled={loading || page >= pageCount}
            >
              Próxima
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar tabela {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              {isCumulative
                ? "Escolha o que apagar. A ação não pode ser desfeita."
                : "Essa ação apaga todos os registros importados desta tabela. Não pode ser desfeita."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Numa tabela cumulativa cada carga vira um snapshot; marcar datas
              apaga só elas, e nenhuma marcada apaga a tabela inteira. */}
          {isCumulative && snapshotDates.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {datasParaLimpar.size === 0
                    ? `Nada marcado — serão apagados todos os ${total} registro(s)`
                    : `${datasParaLimpar.size} de ${snapshotDates.length} carga(s) marcada(s)`}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setDatasParaLimpar((atual) =>
                      atual.size === snapshotDates.length ? new Set() : new Set(snapshotDates)
                    )
                  }
                >
                  {datasParaLimpar.size === snapshotDates.length ? "Desmarcar todas" : "Marcar todas"}
                </Button>
              </div>

              <div className="max-h-56 space-y-1.5 overflow-auto">
                {snapshotDates.map((data) => (
                  <label
                    key={data}
                    className="flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={datasParaLimpar.has(data)}
                      onChange={() =>
                        setDatasParaLimpar((atual) => {
                          const proximo = new Set(atual);
                          if (proximo.has(data)) proximo.delete(data);
                          else proximo.add(data);
                          return proximo;
                        })
                      }
                    />
                    <span>{`Carga de ${formatarData(data)}`}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClear}
              disabled={clearing}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {clearing
                ? "Limpando..."
                : datasParaLimpar.size === 0
                  ? "Apagar tudo"
                  : `Apagar ${datasParaLimpar.size} carga(s)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
