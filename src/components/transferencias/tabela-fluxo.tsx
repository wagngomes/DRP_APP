"use client";

import { Fragment, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, MoveRight } from "lucide-react";

import type { TransferenciaProjetada } from "@/lib/transferencias/consultas";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const MOTIVOS: Record<string, string> = {
  sigla_desconhecida: "Sigla da rota fora do cadastro de filiais",
  sem_sla: "Sem SLA cadastrado para um trecho da rota",
  passo_invalido: "Passo informado não bate com o tamanho da rota",
  sem_data_emissao: "Sem data de emissão",
};

function dataBr(d: Date | string | null): string {
  if (!d) return "—";
  const data = typeof d === "string" ? new Date(d) : d;
  return data.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function TabelaFluxo({
  linhas,
  rotulos,
}: {
  linhas: TransferenciaProjetada[];
  /** código da filial -> sigla, para a leitura ficar em nomes e não códigos. */
  rotulos: Record<string, string>;
}) {
  const [aberta, setAberta] = useState<number | null>(null);
  const rotulo = (codigo: string | null) => (codigo ? (rotulos[codigo] ?? codigo) : "—");

  return (
    <div className="max-h-[36rem] overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>NF</TableHead>
            <TableHead>Produto</TableHead>
            <TableHead>Percurso</TableHead>
            <TableHead className="text-center">Passo</TableHead>
            <TableHead>CD final</TableHead>
            <TableHead>Chegada prevista</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                Nenhuma transferência para este recorte.
              </TableCell>
            </TableRow>
          ) : (
            linhas.map((t) => {
              const p = t.projecao;
              const expandida = aberta === t.id;
              return (
                <Fragment key={t.id}>
                  <TableRow className="cursor-pointer" onClick={() => setAberta(expandida ? null : t.id)}>
                    <TableCell className="font-mono text-xs">
                      <span className="flex items-center gap-1.5">
                        {expandida ? (
                          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                        )}
                        {t.numero_nf_saida ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-xs" title={t.descricao_produto ?? ""}>
                      {t.descricao_produto ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {t.rota ? (
                        <span className="font-mono">{t.rota}</span>
                      ) : (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          {rotulo(t.filial_codigo_saida)}
                          <MoveRight className="size-3" />
                          {rotulo(t.filial_codigo_entrada)}
                          <span className="ml-1">(simples)</span>
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs">
                      {t.rota ? `${t.passo ?? "?"}/${t.qtde_passo ?? "?"}` : "—"}
                    </TableCell>
                    <TableCell className="text-xs font-medium">{rotulo(p.cdFinal)}</TableCell>
                    <TableCell className="text-xs">
                      {p.chegadaFinal ? (
                        <span className="flex items-center gap-1.5">
                          <span className="font-mono tabular-nums">{dataBr(p.chegadaFinal)}</span>
                          {p.reprojetada ? (
                            <Badge variant="secondary" className="text-[10px]">
                              reprojetada
                            </Badge>
                          ) : null}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <AlertTriangle className="size-3.5 shrink-0 text-amber-600" />
                          indefinida
                        </span>
                      )}
                    </TableCell>
                  </TableRow>

                  {expandida ? (
                    <TableRow className="bg-muted/40">
                      <TableCell colSpan={6} className="py-3">
                        <div className="space-y-2 pl-6">
                          <p className="text-xs text-muted-foreground">
                            {`Emissão em ${dataBr(t.data_emissao)} · quantidade ${t.qtde ?? "—"} · código ${t.codigo ?? "—"}`}
                          </p>

                          {p.motivo ? (
                            <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                              <AlertTriangle className="size-3.5 shrink-0" />
                              {MOTIVOS[p.motivo] ?? p.motivo}
                            </p>
                          ) : null}

                          {p.etapas.length > 0 ? (
                            <ol className="space-y-1">
                              {p.etapas.map((e, i) => (
                                <li
                                  key={`${e.de}-${e.para}-${i}`}
                                  className="flex flex-wrap items-center gap-2 text-xs"
                                >
                                  <span className="font-mono text-muted-foreground">{i + 1}.</span>
                                  <span className="font-medium">{rotulo(e.de)}</span>
                                  <MoveRight className="size-3 text-muted-foreground" />
                                  <span className="font-medium">{rotulo(e.para)}</span>
                                  <span className="text-muted-foreground">
                                    {e.transitTime === null
                                      ? "sem SLA"
                                      : `${e.transitTime} dia(s) útil(eis)`}
                                  </span>
                                  <span className="font-mono tabular-nums">
                                    {e.chegadaPrevista ? `chega ${dataBr(e.chegadaPrevista)}` : "—"}
                                  </span>
                                </li>
                              ))}
                            </ol>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
