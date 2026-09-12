import Link from "next/link";

import { exigirSessao } from "@/lib/autorizacao";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { CelulasCds, type CdTexto } from "@/components/compras-urgentes/dica-cds";
import { FiltroFornecedor } from "@/components/visao-geral/filtro-fornecedor";
import { FiltroLista } from "@/components/ui/filtro-lista";
import { carregarComprasUrgentes, type PosicaoCd } from "@/lib/compras-urgentes/consultas";
import { carregarRotulosFiliais } from "@/lib/transferencias/consultas";
import { lerDataReferencia } from "@/lib/data-referencia.server";
import { VAZIO } from "@/lib/fornecedores/agregacao";
import { dataBr, inteiro } from "@/lib/visao-geral/formato";

export const dynamic = "force-dynamic";

type SearchParams = {
  dias?: string | string[];
  bu?: string | string[];
  fornecedor?: string | string[];
  analista?: string | string[];
  pag?: string | string[];
};

const LIMITE_PADRAO = 20;
/** Linhas por página. O corte é no servidor: só o que se vê é serializado. */
const POR_PAGINA = 50;

const primeiro = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

function num(v: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function umaCasa(v: number | null): string {
  return v === null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

export default async function ComprasUrgentes({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sessao = await exigirSessao();

  const params = await searchParams;
  const diasBruto = Number(primeiro(params.dias));
  const limite =
    Number.isFinite(diasBruto) && diasBruto >= 0 && diasBruto <= 365
      ? diasBruto
      : LIMITE_PADRAO;
  const bu = primeiro(params.bu);
  const fornecedor = primeiro(params.fornecedor);
  const analista = primeiro(params.analista);
  const pagPedida = Number(primeiro(params.pag) ?? 1) || 1;

  const dataReferencia = await lerDataReferencia();
  const [dados, rotulos] = await Promise.all([
    carregarComprasUrgentes(dataReferencia, limite, bu, fornecedor, analista),
    carregarRotulosFiliais(),
  ]);

  const paginas = Math.max(1, Math.ceil(dados.produtos.length / POR_PAGINA));
  const pagina = Math.min(Math.max(1, pagPedida), paginas);
  const visiveis = dados.produtos.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  const rotulo = (codigo: string) => rotulos.get(codigo) ?? codigo;

  /** Formata no servidor: o tooltip é client e recebe só texto. */
  const paraTexto = (cds: PosicaoCd[]): CdTexto[] =>
    cds.map((c) => ({
      filial: rotulo(c.filial),
      estoqueChao: num(c.estoqueChao),
      transferencias: num(c.transferencias),
      compras: num(c.compras),
      forecast: num(c.forecast),
      dias: umaCasa(c.diasChao),
    }));

  /** Preserva os demais filtros ao trocar um deles. */
  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (limite !== LIMITE_PADRAO) p.set("dias", String(limite));
    if (bu) p.set("bu", bu);
    if (fornecedor) p.set("fornecedor", fornecedor);
    if (analista) p.set("analista", analista);
    if (pagina > 1) p.set("pag", String(pagina));
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined) p.delete(k);
      else p.set(k, v);
    }
    const qs = p.toString();
    return qs ? `/compras-urgentes?${qs}` : "/compras-urgentes";
  };

  return (
    <DashboardShell
      user={{ name: sessao.usuario.name, email: sessao.usuario.email }}
      papel={sessao.usuario.papel}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-(--brand-petrol) dark:text-foreground">
              Compras urgentes
            </h1>
            <p className="text-muted-foreground">
              Cobertura consolidada da rede — o que comprar antes que a rede inteira fique
              descoberta.
            </p>
          </div>
          <Badge variant="secondary" className="text-sm">
            {`Referência: ${dataBr(dataReferencia)}`}
          </Badge>
        </div>

        <Card>
          <CardContent className="grid gap-4 pt-6">
            {/* Formulário GET: o recorte vira URL, sem JavaScript no cliente. */}
            <form action="/compras-urgentes" className="flex flex-wrap items-end gap-2">
              {bu ? <input type="hidden" name="bu" value={bu} /> : null}
              {fornecedor ? (
                <input type="hidden" name="fornecedor" value={fornecedor} />
              ) : null}
              <div className="space-y-1.5">
                <label htmlFor="dias" className="text-xs text-muted-foreground">
                  Cobertura total até (dias)
                </label>
                <Input
                  id="dias"
                  name="dias"
                  type="number"
                  min={0}
                  max={365}
                  defaultValue={limite}
                  className="w-32"
                />
              </div>
              <Button type="submit" variant="outline">
                Aplicar
              </Button>
            </form>

            {dados.bus.length > 1 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-sm font-medium text-muted-foreground">BU</span>
                <Chip href={href({ bu: undefined })} ativo={!bu}>
                  Todas
                </Chip>
                {dados.bus.map((b) => (
                  <Chip key={b} href={href({ bu: b })} ativo={bu === b}>
                    {b === VAZIO ? "Sem BU" : b}
                  </Chip>
                ))}
              </div>
            ) : null}

            <FiltroLista
              rotulo="Analista"
              atual={analista}
              hrefTodos={href({ analista: undefined, pag: undefined })}
              opcoes={dados.analistas.map((a) => ({
                valor: a,
                rotulo: a === VAZIO ? "Sem analista" : a,
                href: href({ analista: a, pag: undefined }),
              }))}
            />

            <FiltroFornecedor
              fornecedores={dados.fornecedores}
              atual={fornecedor}
              basePath="/compras-urgentes"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {`${inteiro(dados.produtos.length)} produto(s) com até ${limite} dias de cobertura total`}
            </CardTitle>
            <CardDescription>
              {`De ${inteiro(dados.totalUniverso)} produtos no universo. Cobertura da rede inteira: estoque chão + transferências + compras, sobre o forecast somado de todos os CDs. Ordenado do menor para o maior número de dias; no empate, quem tem mais CDs rompidos vem antes.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[36rem] overflow-auto rounded-md border">
              <Table>
                {/* Cabeçalho fixo: a tabela rola e os títulos precisam ficar. */}
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead className="text-right">Chão</TableHead>
                    <TableHead className="text-right">Transf.</TableHead>
                    <TableHead className="text-right">Compras</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Dias total</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Dias chão</TableHead>
                    <TableHead className="text-center">CDs 0</TableHead>
                    <TableHead className="text-center whitespace-nowrap">CDs 0–10</TableHead>
                    <TableHead className="text-center whitespace-nowrap">CDs 10–20</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Saldo a comprar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="py-8 text-center text-muted-foreground">
                        Nenhum produto neste recorte.
                      </TableCell>
                    </TableRow>
                  ) : (
                    visiveis.map((p) => (
                      <TableRow key={p.codigo}>
                        <TableCell className="font-mono">
                          <Link
                            href={`/produto/${encodeURIComponent(p.codigo)}`}
                            className="text-(--brand-petrol) underline underline-offset-2 dark:text-(--brand-turquoise)"
                          >
                            {p.codigo}
                          </Link>
                        </TableCell>
                        <TableCell
                          className="max-w-64 truncate text-xs text-muted-foreground"
                          title={p.descricao ?? ""}
                        >
                          {p.descricao ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-40 truncate text-xs">{p.fornecedor}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {num(p.estoqueChao)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-teal-700 dark:text-teal-300">
                          {num(p.transferencias)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-amber-700 dark:text-amber-400">
                          {num(p.compras)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold tabular-nums">
                          {umaCasa(p.diasTotal)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                          {umaCasa(p.diasChao)}
                        </TableCell>
                        <CelulasCds
                          grupos={{
                            rompidos: paraTexto(p.cdsRompidos),
                            ate10: paraTexto(p.cdsAte10),
                            de10a20: paraTexto(p.cds10a20),
                          }}
                        />
                        <TableCell
                          className={`text-right font-mono tabular-nums ${
                            p.saldoComprar > 0 ? "" : "text-muted-foreground/50"
                          }`}
                        >
                          {num(p.saldoComprar)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {paginas > 1 ? (
              <div className="mt-3 flex items-center justify-end gap-2">
                <span className="text-sm text-muted-foreground">
                  {`Página ${pagina} de ${paginas}`}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagina <= 1}
                  render={<Link href={href({ pag: String(pagina - 1) })} scroll={false} />}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagina >= paginas}
                  render={<Link href={href({ pag: String(pagina + 1) })} scroll={false} />}
                >
                  Próxima
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}

function Chip({
  href,
  ativo,
  children,
}: {
  href: string;
  ativo: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        ativo
          ? "bg-(--brand-petrol) text-white dark:bg-(--brand-turquoise) dark:text-(--brand-petrol)"
          : "bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
