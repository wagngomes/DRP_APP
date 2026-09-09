"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Download,
  Lightbulb,
  Loader2,
  MoveRight,
  Trash2,
  Truck,
} from "lucide-react";

import {
  excluirCenario,
  rodarCenario,
  type CenarioResumo,
  type EstadoCenario,
  type ResultadoTela,
  type ResumoCenario,
} from "@/app/actions/cenario";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Tela de cenário: uma pergunta em português, uma análise calculada.
 *
 * A ordem da página é a ordem da decisão — o que a premissa provoca, o que
 * fazer, e o que sobra depois de fazer. O bloco da premissa interpretada vem
 * antes de tudo de propósito: se o modelo entendeu a data errada, o usuário
 * precisa ver isso antes de ler qualquer conclusão, não depois de agir sobre
 * ela.
 */

function num(v: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function dataBr(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Ordem e aparência dos grupos: do que exige ação hoje ao que só informa. */
const ESTILO_GRUPO = {
  hoje: { rotulo: "Rompida hoje", cor: "bg-red-500/15 text-red-700 dark:text-red-400", ordem: 0 },
  ate_entrada: {
    rotulo: "Rompe antes da carga",
    cor: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    ordem: 1,
  },
  depois: { rotulo: "Rompe depois", cor: "", ordem: 2 },
} as const;

/**
 * Soma o que já está colocado, por origem.
 *
 * Vem da mesma lista que a coluna "Entradas já colocadas" detalha — por isso as
 * duas colunas sempre fecham com o detalhe, sem depender de o motor devolver um
 * total separado que pudesse divergir.
 */
function somarEntradas(
  entradas: { origem: "compra" | "transferencia"; quantidade: number }[],
  origem: "compra" | "transferencia"
): string {
  const total = entradas
    .filter((e) => e.origem === origem)
    .reduce((a, e) => a + e.quantidade, 0);
  return total > 0 ? num(total) : "";
}

function contarGrupo(
  posicoes: { grupo: keyof typeof ESTILO_GRUPO }[],
  grupo: keyof typeof ESTILO_GRUPO
): number {
  return posicoes.filter((p) => p.grupo === grupo).length;
}

/** Grupo primeiro, data de ruptura depois: a leitura é do mais urgente ao menos. */
function ordenarPorGrupo<T extends { grupo: keyof typeof ESTILO_GRUPO; dataRuptura: string | null }>(
  posicoes: T[]
): T[] {
  const ordemDe = (g: keyof typeof ESTILO_GRUPO) => ESTILO_GRUPO[g]?.ordem ?? 99;
  return [...posicoes].sort(
    (a, b) =>
      ordemDe(a.grupo) - ordemDe(b.grupo) ||
      (a.dataRuptura ?? "9999").localeCompare(b.dataRuptura ?? "9999")
  );
}

const ROTULO_ACAO = {
  transferencia: "Transferir",
  antecipar_entrada: "Antecipar entrada",
  compra_emergencial: "Compra emergencial",
} as const;

export function PainelCenario({
  fornecedores,
  rotulos,
  cenarios,
  inicial,
  selecionadoId,
}: {
  fornecedores: string[];
  /** Código do CD -> sigla, para a tela não mostrar número cru. */
  rotulos: Record<string, string>;
  /** Análises guardadas, mais recente primeiro. */
  cenarios: CenarioResumo[];
  /** Análise reaberta pela URL, se houver. */
  inicial: ResultadoTela | null;
  selecionadoId?: string;
}) {
  const [resposta, acao, pendente] = useActionState<EstadoCenario, FormData>(
    rodarCenario,
    null
  );

  // A execução recém-feita ganha da análise reaberta: é a que o usuário acabou
  // de pedir. Ao clicar num card a página remonta o painel, zerando `resposta`.
  const estado: EstadoCenario = resposta ?? (inicial ? inicial : null);

  const cd = (codigo: string) => rotulos[codigo] ?? codigo;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <form action={acao} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-[18rem_1fr]">
              <div className="space-y-1.5">
                <label htmlFor="fornecedor" className="text-sm font-medium">
                  Fornecedor
                </label>
                <select
                  id="fornecedor"
                  name="fornecedor"
                  required
                  defaultValue={estado?.ok ? estado.fornecedor : ""}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">Selecione…</option>
                  {fornecedores.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="pergunta" className="text-sm font-medium">
                  Cenário
                </label>
                <textarea
                  id="pergunta"
                  name="pergunta"
                  rows={3}
                  required
                  defaultValue={estado?.ok ? estado.pergunta : ""}
                  placeholder="Ex.: esta semana vamos colocar o restante dos pedidos, mas só vamos começar a receber a partir do dia 21/09. Quais as consequências?"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={pendente}>
                {pendente ? <Loader2 className="size-4 animate-spin" /> : null}
                {pendente ? "Simulando…" : "Analisar cenário"}
              </Button>
              <span className="text-xs text-muted-foreground">
                A análise leva alguns segundos: o sistema simula o balanço dia a dia de cada
                item em cada CD, propõe contingências e simula de novo com elas.
              </span>
            </div>
          </form>
        </CardContent>
      </Card>

      {cenarios.length > 0 ? (
        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">
            {`Análises salvas (${cenarios.length})`}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cenarios.map((c) => (
              <CardCenario
                key={c.id}
                cenario={c}
                ativo={c.id === selecionadoId}
              />
            ))}
          </div>
        </div>
      ) : null}

      {estado && !estado.ok ? (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">{estado.erro}</CardContent>
        </Card>
      ) : null}

      {estado?.ok ? (
        <div className="space-y-6">
          {/* Premissa interpretada: confira antes de ler o resto. */}
          <Card className="border-l-4 border-(--brand-turquoise)">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                Premissa simulada
                {/* Form POST comum: o navegador baixa pelo Content-Disposition,
                    sem blob nem fetch. O resultado vai junto para o servidor não
                    refazer a análise — a IA escreveria outro texto e a planilha
                    não bateria com a tela. */}
                <form method="POST" action="/api/cenarios/excel">
                  <input type="hidden" name="dados" value={JSON.stringify(estado)} />
                  <Button type="submit" variant="outline" size="sm">
                    <Download className="size-4" />
                    Exportar para Excel
                  </Button>
                </form>
              </CardTitle>
              <CardDescription>
                Confira se é isto que você quis dizer — todo o resto foi calculado sobre esta
                hipótese.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <p>{estado.interpretacao}</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{estado.fornecedor}</Badge>
                <Badge variant="secondary">
                  {`Saldo a colocar: ${num(estado.saldoTotal)} un em ${estado.itensComSaldo} itens`}
                </Badge>
                <Badge variant="secondary">
                  {`Entra na rota em ${dataBr(estado.dataEntrada)}`}
                </Badge>
                <Badge variant="secondary">{`Base: ${dataBr(estado.dataBase)}`}</Badge>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Cartao titulo="Posições que rompem" valor={num(estado.antes.rompem)}
              nota={`de ${num(estado.antes.posicoesAvaliadas)} avaliadas`} alerta />
            <Cartao titulo="Já zeradas hoje" valor={num(estado.antes.jaZeradas)}
              nota="antes mesmo da premissa" />
            <Cartao titulo="Dias descobertos" valor={num(estado.antes.diasDescobertos)}
              nota="somados até a carga chegar" />
            <Cartao titulo="Unidades faltando" valor={num(estado.antes.unidadesFaltando)}
              nota="déficit no pior momento" />
          </div>

          <Secao
            icone={<AlertTriangle className="size-4" />}
            titulo="O que fica crítico"
            descricao="Todas as posições rompidas hoje, as que rompem até a data da premissa, e o que já está colocado a caminho de cada uma."
          >
            <p className="mb-4 text-sm leading-relaxed">{estado.resumoIa}</p>

            {estado.destaques.length > 0 ? (
              <div className="mb-4 grid gap-2">
                {estado.destaques.map((d) => (
                  <div
                    key={`${d.codigo}-${d.filial}`}
                    className="rounded-md border-l-4 border-red-500 bg-muted/30 p-3"
                  >
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      <Link
                        href={`/produto/${encodeURIComponent(d.codigo)}`}
                        className="font-mono text-(--brand-petrol) underline underline-offset-2 dark:text-(--brand-turquoise)"
                      >
                        {d.codigo}
                      </Link>
                      <Badge variant="secondary" className="font-mono">{cd(d.filial)}</Badge>
                      {d.titulo}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{d.porque}</p>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <Badge className="bg-red-500/15 text-red-700 dark:text-red-400">
                {`${contarGrupo(estado.criticas, "hoje")} rompidas hoje`}
              </Badge>
              <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">
                {`${contarGrupo(estado.criticas, "ate_entrada")} rompem até ${dataBr(estado.dataEntrada)}`}
              </Badge>
              <Badge variant="secondary">
                {`${contarGrupo(estado.criticas, "depois")} rompem depois ou não rompem`}
              </Badge>
            </div>

            <div className="max-h-[32rem] overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead>Situação</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>CD</TableHead>
                    <TableHead className="text-right">Chão</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Em transf.</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Em compra</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Rompe em</TableHead>
                    <TableHead>Entradas já colocadas</TableHead>
                    <TableHead>Percurso da carga do saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ordenarPorGrupo(estado.criticas).map((p) => (
                    <TableRow key={`${p.codigo}-${p.filial}`}>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={`whitespace-nowrap text-[10px] ${ESTILO_GRUPO[p.grupo]?.cor ?? ""}`}
                        >
                          {ESTILO_GRUPO[p.grupo]?.rotulo ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono">
                        <Link
                          href={`/produto/${encodeURIComponent(p.codigo)}`}
                          className="text-(--brand-petrol) underline underline-offset-2 dark:text-(--brand-turquoise)"
                        >
                          {p.codigo}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{cd(p.filial)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {num(p.estoqueInicial)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-teal-700 dark:text-teal-300">
                        {somarEntradas(p.entradasAbertas, "transferencia") || "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-amber-700 dark:text-amber-400">
                        {somarEntradas(p.entradasAbertas, "compra") || "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums text-red-700 dark:text-red-400">
                        {dataBr(p.dataRuptura)}
                      </TableCell>
                      <TableCell>
                        {p.entradasAbertas.length === 0 ? (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        ) : (
                          <ul className="grid gap-0.5">
                            {p.entradasAbertas.map((e, i) => (
                              <li key={i} className="whitespace-nowrap text-[11px]">
                                <span
                                  className={
                                    e.origem === "compra"
                                      ? "text-amber-700 dark:text-amber-400"
                                      : "text-teal-700 dark:text-teal-300"
                                  }
                                >
                                  {e.origem === "compra" ? "Compra" : "Transf."}
                                </span>
                                <span className="ml-1 font-mono tabular-nums">
                                  {`${num(e.quantidade)} un · ${dataBr(e.chegada)}`}
                                </span>
                                {e.documento ? (
                                  <span className="ml-1 font-mono text-muted-foreground">
                                    {e.documento}
                                  </span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                      <TableCell>
                        {p.percurso.length > 0 ? (
                          <ol className="flex flex-wrap items-center gap-1">
                            {p.percurso.map((x, i) => (
                              <li key={`${x.cd}-${i}`} className="flex items-center gap-1">
                                {i > 0 ? (
                                  <MoveRight className="size-3 shrink-0 text-muted-foreground" />
                                ) : null}
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[11px] ${
                                    i === p.percurso.length - 1
                                      ? "bg-amber-500/20 font-semibold"
                                      : "bg-muted"
                                  }`}
                                >
                                  <span className="font-mono">{cd(x.cd)}</span>
                                  <span className="ml-1 font-mono tabular-nums text-muted-foreground">
                                    {dataBr(x.chegada)}
                                  </span>
                                </span>
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <span className="text-xs text-amber-700 dark:text-amber-400">
                            {p.aviso === "sem_rota"
                              ? "sem rota de compra cadastrada"
                              : "percurso sem data"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Secao>

          <Secao
            icone={<Lightbulb className="size-4" />}
            titulo="Ações de contingência recomendadas"
            descricao="Propostas dentro do que o sistema sabe simular — transferência, antecipação e compra emergencial."
          >
            {estado.acoes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma contingência aplicável foi encontrada dentro do vocabulário que o
                motor sabe recalcular.
              </p>
            ) : (
              <div className="grid gap-2">
                {estado.acoes.map((a, i) => (
                  <div key={i} className="flex flex-wrap items-start gap-3 rounded-md border p-3">
                    <Badge className="bg-(--brand-turquoise)/20 text-(--brand-petrol) dark:text-(--brand-turquoise)">
                      {ROTULO_ACAO[a.tipo]}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-mono text-sm">
                        {a.tipo === "transferencia" ? (
                          <>
                            <span>{a.codigo}</span>
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Truck className="size-3.5" />
                              {cd(a.origem)}
                              <ArrowRight className="size-3" />
                              {cd(a.destino)}
                            </span>
                            <span className="font-semibold">{`${num(a.quantidade)} un`}</span>
                          </>
                        ) : a.tipo === "antecipar_entrada" ? (
                          <span className="font-semibold">
                            {`${a.codigo ? `${a.codigo} · ` : "todo o saldo · "}entrada em ${dataBr(a.novaData)}`}
                          </span>
                        ) : (
                          <>
                            <span>{a.codigo}</span>
                            <span className="text-muted-foreground">{cd(a.destino)}</span>
                            <span className="font-semibold">{`${num(a.quantidade)} un`}</span>
                            <span className="text-muted-foreground">
                              {`chegando ${dataBr(a.chegada)}`}
                            </span>
                          </>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{a.justificativa}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Secao>

          <Secao
            icone={<Check className="size-4" />}
            titulo="Cenário com as ações aplicadas"
            descricao="Recalculado pelo motor com as contingências acima — não é estimativa."
          >
            {estado.depois === null ? (
              <p className="text-sm text-muted-foreground">
                Sem ações aplicáveis, não há segundo cenário a calcular.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <Comparacao rotulo="Posições que rompem"
                  antes={estado.antes.rompem} depois={estado.depois.rompem} />
                <Comparacao rotulo="Dias descobertos"
                  antes={estado.antes.diasDescobertos} depois={estado.depois.diasDescobertos} />
                <Comparacao rotulo="Unidades faltando"
                  antes={estado.antes.unidadesFaltando} depois={estado.depois.unidadesFaltando} />
              </div>
            )}

            {estado.ignoradas.length > 0 ? (
              <div className="mt-4 rounded-md border border-amber-500/50 bg-amber-500/5 p-3">
                <p className="mb-1.5 text-xs font-semibold text-amber-800 dark:text-amber-400">
                  {`${estado.ignoradas.length} ação(ões) não puderam ser aplicadas`}
                </p>
                <ul className="grid gap-1 text-xs text-muted-foreground">
                  {estado.ignoradas.map((x, i) => (
                    <li key={i}>
                      <span className="font-medium">{x.descricao}</span>
                      {` — ${x.motivo}`}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Secao>

          {estado.antes.semProjecao > 0 ? (
            <p className="text-xs text-muted-foreground">
              {`${estado.antes.semProjecao} posição(ões) ficaram sem data de chegada — falta rota de compra ou SLA de algum trecho. Elas aparecem na tabela sem percurso.`}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Secao({
  icone,
  titulo,
  descricao,
  children,
}: {
  icone: React.ReactNode;
  titulo: string;
  descricao: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icone}
          {titulo}
        </CardTitle>
        <CardDescription>{descricao}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Cartao({
  titulo,
  valor,
  nota,
  alerta,
}: {
  titulo: string;
  valor: string;
  nota: string;
  alerta?: boolean;
}) {
  return (
    <Card className={alerta ? "border-l-4 border-red-500" : undefined}>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{titulo}</p>
        <p
          className={`font-mono text-3xl font-semibold tabular-nums ${
            alerta ? "text-red-700 dark:text-red-400" : ""
          }`}
        >
          {valor}
        </p>
        <p className="text-xs text-muted-foreground">{nota}</p>
      </CardContent>
    </Card>
  );
}

/** Antes e depois lado a lado, com o sinal do ganho explícito. */
function Comparacao({
  rotulo,
  antes,
  depois,
}: {
  rotulo: string;
  antes: number;
  depois: number;
}) {
  const delta = depois - antes;
  const melhorou = delta < 0;
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="flex items-center gap-2 font-mono text-2xl font-semibold tabular-nums">
        <span className="text-muted-foreground line-through decoration-1">{num(antes)}</span>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
        <span className={melhorou ? "text-emerald-700 dark:text-emerald-400" : ""}>
          {num(depois)}
        </span>
      </p>
      <p className="text-xs text-muted-foreground">
        {delta === 0 ? "sem mudança" : `${melhorou ? "−" : "+"}${num(Math.abs(delta))}`}
      </p>
    </div>
  );
}

/**
 * Card de uma análise guardada.
 *
 * Mostra o que basta para reconhecer a análise sem abri-la: fornecedor, data
 * simulada e o tamanho do estrago. A pergunta original vem truncada porque é o
 * que diferencia duas análises do mesmo fornecedor.
 */
function CardCenario({ cenario, ativo }: { cenario: CenarioResumo; ativo: boolean }) {
  const criado = new Date(cenario.criadoEm).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Card
      className={
        ativo ? "border-2 border-(--brand-turquoise)" : "transition-colors hover:border-foreground/20"
      }
    >
      <CardContent className="grid gap-2 pt-6">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold">{cenario.fornecedor}</p>
            <p className="text-xs text-muted-foreground">
              {`entrada ${dataBr(cenario.dataEntrada)} · base ${dataBr(cenario.dataBase)}`}
            </p>
          </div>
          {/* Form próprio: excluir não pode ser um link, e aninhar formulários
              não é válido em HTML. */}
          <form action={excluirCenario}>
            <input type="hidden" name="id" value={cenario.id} />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              aria-label={`Excluir análise de ${cenario.fornecedor}`}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          </form>
        </div>

        <p className="line-clamp-2 text-xs text-muted-foreground">{cenario.pergunta}</p>

        <div className="flex flex-wrap gap-1.5 text-xs">
          <Badge variant="secondary" className="font-mono">
            {`${num(cenario.rompem)} rompem`}
          </Badge>
          <Badge variant="secondary" className="font-mono">
            {`${num(cenario.diasDescobertos)} dias`}
          </Badge>
          <Badge variant="secondary" className="font-mono">
            {`${num(cenario.unidadesFaltando)} un`}
          </Badge>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">{criado}</span>
          <Button variant="outline" size="sm" render={<Link href={`/cenarios?analise=${cenario.id}`} />}>
            {ativo ? "Aberta" : "Abrir"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
