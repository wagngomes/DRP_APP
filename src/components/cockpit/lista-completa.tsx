import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ItemResumo } from "@/lib/ia/persistencia";

export const POR_PAGINA = 25;

function n(v: number | null, casas = 0): string {
  return v === null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: casas });
}

/**
 * As posições que a IA não comentou.
 *
 * Renderizada no servidor e paginada pela URL. A versão anterior mandava as
 * 2.133 linhas para o navegador e paginava lá, o que deixava a página em 1 MB de
 * HTML mesmo com a lista fechada. Aqui só as 25 linhas visíveis viajam.
 *
 * Efeito colateral bom: o recorte inteiro — seção aberta, página e busca — cabe
 * num link.
 */
export function ListaCompleta({
  itens,
  chave,
  rotulo,
  aberta,
  pagina,
  busca,
  href,
}: {
  itens: ItemResumo[];
  /** Identifica esta lista na URL. */
  chave: string;
  rotulo: string;
  aberta: boolean;
  pagina: number;
  busca: string;
  /** Monta URLs preservando vista e BU. */
  href: (extra: Record<string, string | undefined>) => string;
}) {
  if (itens.length === 0) return null;

  const termo = busca.trim().toLowerCase();
  const filtrados = termo
    ? itens.filter(
        (i) =>
          i.codigo.toLowerCase().includes(termo) ||
          i.fornecedor.toLowerCase().includes(termo) ||
          (i.descricao ?? "").toLowerCase().includes(termo) ||
          i.filial.includes(termo)
      )
    : itens;

  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const atual = Math.min(Math.max(1, pagina), paginas);
  const visiveis = filtrados.slice((atual - 1) * POR_PAGINA, atual * POR_PAGINA);

  return (
    <div className="mt-3 border-t pt-3">
      <Link
        href={href({ lista: aberta ? undefined : chave })}
        scroll={false}
        className="flex w-fit items-center gap-1.5 text-sm font-medium text-(--brand-petrol) hover:underline dark:text-(--brand-turquoise)"
      >
        <ChevronDown
          className={`size-4 shrink-0 transition-transform ${aberta ? "" : "-rotate-90"}`}
        />
        {aberta
          ? "Ocultar lista"
          : `Ver todas as ${itens.length.toLocaleString("pt-BR")} de ${rotulo.toLowerCase()}`}
      </Link>

      {aberta ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Formulário GET: a busca vira URL, sem JavaScript no cliente. */}
            <form action="/cockpit" className="flex items-center gap-2">
              <input type="hidden" name="lista" value={chave} />
              {href({}).includes("vista=curva") ? (
                <input type="hidden" name="vista" value="curva" />
              ) : null}
              {(() => {
                const bu = new URL(href({}), "http://x").searchParams.get("bu");
                return bu ? <input type="hidden" name="bu" value={bu} /> : null;
              })()}
              <Input
                name="q"
                defaultValue={busca}
                placeholder="Buscar código, produto, fornecedor ou CD…"
                className="max-w-sm"
              />
              <Button type="submit" variant="outline" size="sm">
                Buscar
              </Button>
              {termo ? (
                <Button variant="ghost" size="sm" render={<Link href={href({ lista: chave })} />}>
                  Limpar
                </Button>
              ) : null}
            </form>
            <p className="text-xs text-muted-foreground">
              {`${filtrados.length.toLocaleString("pt-BR")} posições · ordenadas por unidades expostas`}
            </p>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>CD</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Curva</TableHead>
                  <TableHead className="text-right">Dias</TableHead>
                  <TableHead className="text-right">Descobertos</TableHead>
                  <TableHead className="text-right">Exposição</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      Nada encontrado para esta busca.
                    </TableCell>
                  </TableRow>
                ) : (
                  visiveis.map((i) => (
                    <TableRow key={`${i.codigo}-${i.filial}`}>
                      <TableCell className="font-mono">
                        <span className="flex items-center gap-1.5">
                          <Link
                            href={`/produto/${encodeURIComponent(i.codigo)}`}
                            className="text-(--brand-petrol) underline underline-offset-2 dark:text-(--brand-turquoise)"
                          >
                            {i.codigo}
                          </Link>
                          {/* Marca o que já tem texto da IA acima. */}
                          {i.comAnalise ? (
                            <Sparkles
                              className="size-3 shrink-0 text-(--brand-turquoise)"
                              aria-label="comentado pela IA"
                            />
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell
                        className="max-w-56 truncate text-xs text-muted-foreground"
                        title={i.descricao ?? ""}
                      >
                        {i.descricao ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{i.filial}</TableCell>
                      <TableCell className="max-w-40 truncate text-xs">{i.fornecedor}</TableCell>
                      <TableCell className="text-center font-mono text-xs">{i.curva}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {n(i.diasChao, 1)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold tabular-nums">
                        {n(i.diasDescobertos)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                        {n(i.peso)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {paginas > 1 ? (
            <div className="flex items-center justify-end gap-2">
              <span className="text-sm text-muted-foreground">{`Página ${atual} de ${paginas}`}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={atual <= 1}
                render={
                  <Link
                    href={href({ lista: chave, pag: String(atual - 1), q: busca || undefined })}
                    scroll={false}
                  />
                }
              >
                <ChevronLeft className="size-4" />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={atual >= paginas}
                render={
                  <Link
                    href={href({ lista: chave, pag: String(atual + 1), q: busca || undefined })}
                    scroll={false}
                  />
                }
              >
                Próxima
                <ChevronRight className="size-4" />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
