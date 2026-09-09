"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertOctagon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  PackageSearch,
  ShoppingCart,
  Truck,
  Warehouse,
  X,
} from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkflowRota } from "@/components/produto/workflow-rota";
import {
  VAZIO,
  agregarPorFornecedor,
  listarBus,
  listarCurvas,
  type Categoria,
  type PosicaoRompida,
  type Reposicao,
  type ResumoFornecedor,
} from "@/lib/fornecedores/agregacao";

/**
 * Cada categoria tem cor, ícone e rótulo próprios, na mesma linguagem da tela de
 * produto: compras em âmbar, transferências em turquesa. "Sem cobertura" é o
 * único vermelho — é a única situação sem solução a caminho.
 */
const CATEGORIAS: Record<
  Categoria,
  { rotulo: string; curto: string; icone: typeof ShoppingCart; fundo: string; borda: string }
> = {
  compra: {
    rotulo: "Pedido de compra a caminho",
    curto: "Com compra",
    icone: ShoppingCart,
    fundo: "bg-amber-500/15 text-amber-800 dark:text-amber-400",
    borda: "border-amber-500/40",
  },
  transferencia: {
    rotulo: "Transferência a caminho",
    curto: "Com transferência",
    icone: Truck,
    fundo: "bg-teal-500/15 text-teal-800 dark:text-teal-300",
    borda: "border-teal-500/40",
  },
  a_comprar: {
    rotulo: "Sem reposição a caminho, mas há saldo no plano de compra",
    curto: "A comprar",
    icone: PackageSearch,
    fundo: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
    borda: "border-sky-500/40",
  },
  sem_cobertura: {
    rotulo: "Sem reposição a caminho e sem saldo no plano de compra do mês",
    curto: "Sem plano de compras",
    icone: AlertOctagon,
    fundo: "bg-red-500/15 text-red-800 dark:text-red-400",
    borda: "border-red-500/40",
  },
};

/** Da mais resolvida para a mais crítica — vale para colunas e ordenação. */
const ORDEM: Categoria[] = ["compra", "transferencia", "a_comprar", "sem_cobertura"];

const POR_PAGINA = 25;
const POR_PAGINA_DETALHE = 12;

function numero(v: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function dataBr(d: Date | string | null): string {
  if (!d) return "—";
  const data = typeof d === "string" ? new Date(d) : d;
  return data.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function contagem(r: ResumoFornecedor, c: Categoria): number {
  if (c === "compra") return r.compra;
  if (c === "transferencia") return r.transferencia;
  if (c === "a_comprar") return r.aComprar;
  return r.semCobertura;
}

export function TabelaFornecedores({
  posicoes,
  rotulosFiliais,
}: {
  posicoes: PosicaoRompida[];
  rotulosFiliais: Record<string, string>;
}) {
  /**
   * Recorte aberto. `categoria` nula significa "todas as situações" — é o que
   * o clique no nome do fornecedor abre; clicar num número abre só aquela
   * coluna.
   */
  const [aberto, setAberto] = useState<{
    fornecedor: string;
    categoria: Categoria | null;
  } | null>(null);
  /** Segundo nível: CD aberto dentro do fornecedor. */
  const [filialAberta, setFilialAberta] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [bu, setBu] = useState<string | null>(null);
  const [curva, setCurva] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [paginaDetalhe, setPaginaDetalhe] = useState(1);

  const bus = useMemo(() => listarBus(posicoes), [posicoes]);
  /**
   * As curvas disponíveis seguem a BU escolhida: uma BU pode não ter as três,
   * e oferecer um chip que zera a tabela seria enganoso. O contrário não vale —
   * as BUs são sempre as mesmas, para o filtro de cima não "sumir" ao filtrar.
   */
  const curvas = useMemo(
    () => listarCurvas(bu ? posicoes.filter((p) => p.bu === bu) : posicoes),
    [posicoes, bu]
  );

  /** Recorte ativo: alimenta os totais, a tabela e o detalhamento de uma vez. */
  const doRecorte = useMemo(
    () =>
      posicoes.filter((p) => (bu ? p.bu === bu : true) && (curva ? p.curva === curva : true)),
    [posicoes, bu, curva]
  );

  const resumo = useMemo(() => agregarPorFornecedor(doRecorte), [doRecorte]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return termo ? resumo.filter((r) => r.fornecedor.toLowerCase().includes(termo)) : resumo;
  }, [resumo, busca]);

  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const atual = Math.min(pagina, paginas);
  const visiveis = filtrados.slice((atual - 1) * POR_PAGINA, atual * POR_PAGINA);

  const detalhe = useMemo(() => {
    if (!aberto) return [];
    return doRecorte
      .filter(
        (p) =>
          p.fornecedor === aberto.fornecedor &&
          (aberto.categoria === null || p.categoria === aberto.categoria)
      )
      // Sem plano de compras primeiro: é o que exige decisão hoje.
      .sort(
        (a, b) =>
          ORDEM.indexOf(b.categoria) - ORDEM.indexOf(a.categoria) ||
          a.codigo.localeCompare(b.codigo)
      );
  }, [aberto, doRecorte]);

  /**
   * Segundo nível: o detalhe do fornecedor agrupado por CD, do que tem mais
   * posições para o que tem menos. Só o CD aberto abre a lista de produtos.
   */
  const porFilial = useMemo(() => {
    const mapa = new Map<string, PosicaoRompida[]>();
    for (const p of detalhe) {
      const lista = mapa.get(p.filial) ?? [];
      lista.push(p);
      mapa.set(p.filial, lista);
    }
    return [...mapa.entries()]
      .map(([filial, itens]) => ({ filial, itens }))
      .sort((a, b) => b.itens.length - a.itens.length || a.filial.localeCompare(b.filial));
  }, [detalhe]);

  const produtos = useMemo(
    () => (filialAberta ? detalhe.filter((p) => p.filial === filialAberta) : []),
    [detalhe, filialAberta]
  );

  const paginasDetalhe = Math.max(1, Math.ceil(produtos.length / POR_PAGINA_DETALHE));
  const atualDetalhe = Math.min(paginaDetalhe, paginasDetalhe);
  const produtosVisiveis = produtos.slice(
    (atualDetalhe - 1) * POR_PAGINA_DETALHE,
    atualDetalhe * POR_PAGINA_DETALHE
  );

  /** Clicar de novo no mesmo recorte fecha; em outro, troca sem fechar. */
  function selecionar(fornecedor: string, categoria: Categoria | null) {
    setAberto((anterior) =>
      anterior && anterior.fornecedor === fornecedor && anterior.categoria === categoria
        ? null
        : { fornecedor, categoria }
    );
    // O CD aberto pertence ao recorte anterior — recomeça no nível de filial.
    setFilialAberta(null);
    setPaginaDetalhe(1);
  }

  function selecionarFilial(filial: string) {
    setFilialAberta((anterior) => (anterior === filial ? null : filial));
    setPaginaDetalhe(1);
  }

  const rotulo = (codigo: string | null) =>
    codigo ? rotulosFiliais[codigo] ?? codigo : "—";

  /** Qualquer troca de filtro fecha o detalhe: ele pode não existir no novo recorte. */
  function trocarBu(novo: string | null) {
    setBu(novo);
    setCurva(null);
    setAberto(null);
    setFilialAberta(null);
    setPagina(1);
    setPaginaDetalhe(1);
  }

  function trocarCurva(novo: string | null) {
    setCurva(novo);
    setAberto(null);
    setFilialAberta(null);
    setPagina(1);
    setPaginaDetalhe(1);
  }

  /** Base de contagem dos chips de curva: já respeita a BU escolhida. */
  const baseCurva = bu ? posicoes.filter((p) => p.bu === bu) : posicoes;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        {bus.length > 1 ? (
          <GrupoFiltro
            titulo="BU"
            opcoes={bus.map((item) => ({
              valor: item,
              rotulo: item === VAZIO ? "Sem BU" : item,
              total: posicoes.filter((p) => p.bu === item).length,
            }))}
            ativo={bu}
            totalGeral={posicoes.length}
            aoTrocar={trocarBu}
          />
        ) : null}

        {curvas.length > 1 ? (
          <GrupoFiltro
            titulo="Curva"
            opcoes={curvas.map((item) => ({
              valor: item,
              rotulo: item === VAZIO ? "Sem curva" : `Curva ${item}`,
              total: baseCurva.filter((p) => p.curva === item).length,
            }))}
            ativo={curva}
            totalGeral={baseCurva.length}
            aoTrocar={trocarCurva}
          />
        ) : null}
      </div>

      <TotaisPorCategoria posicoes={doRecorte} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setPagina(1);
          }}
          placeholder="Buscar fornecedor…"
          className="max-w-xs"
        />
        <p className="text-sm text-muted-foreground">
          {`${numero(filtrados.length)} fornecedor(es) · clique na linha para ver todos os itens, ou num número para ver só aquela situação`}
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fornecedor</TableHead>
              <TableHead className="text-right">Posições</TableHead>
              {ORDEM.map((c) => (
                <TableHead key={c} className="text-right whitespace-nowrap">
                  {CATEGORIAS[c].curto}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiveis.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Nenhum fornecedor com ruptura neste recorte.
                </TableCell>
              </TableRow>
            ) : (
              visiveis.map((r) => {
                const ativo = aberto?.fornecedor === r.fornecedor;
                return [
                  <TableRow
                    key={r.fornecedor}
                    onClick={() => selecionar(r.fornecedor, null)}
                    className={`cursor-pointer ${ativo ? "bg-muted" : ""}`}
                  >
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-1.5">
                        {ativo ? (
                          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                        )}
                        {r.fornecedor}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-base font-semibold tabular-nums">
                      {numero(r.total)}
                    </TableCell>
                    {ORDEM.map((c) => {
                      const valor = contagem(r, c);
                      const info = CATEGORIAS[c];
                      const selecionada = ativo && aberto?.categoria === c;
                      return (
                        <TableCell key={c} className="text-right">
                          {valor === 0 ? (
                            <span className="font-mono text-sm tabular-nums text-muted-foreground/40">
                              0
                            </span>
                          ) : (
                            <button
                              type="button"
                              title={`${info.rotulo} — clique para ver só estes itens`}
                              onClick={(e) => {
                                // Sem isto o clique também dispara a linha, que
                                // abre o fornecedor inteiro.
                                e.stopPropagation();
                                selecionar(r.fornecedor, c);
                              }}
                              className={`inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-sm font-semibold tabular-nums transition-shadow hover:ring-2 hover:ring-foreground/25 ${info.fundo} ${
                                selecionada ? "ring-2 ring-foreground/60" : ""
                              }`}
                            >
                              <info.icone className="size-3.5 shrink-0" />
                              {numero(valor)}
                            </button>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>,

                  /* Faixa de contexto do recorte aberto. */
                  ativo ? (
                    <TableRow key={`${r.fornecedor}-contexto`} className="hover:bg-transparent">
                      <TableCell colSpan={6} className="bg-muted/40 py-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-(--brand-petrol) dark:text-foreground">
                              {`${numero(detalhe.length)} posição(ões) em ${numero(porFilial.length)} CD(s)`}
                            </span>
                            {aberto?.categoria ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selecionar(r.fornecedor, null);
                                }}
                                title="Ver todas as situações deste fornecedor"
                                className={`inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${CATEGORIAS[aberto.categoria].fundo}`}
                              >
                                {CATEGORIAS[aberto.categoria].curto}
                                <X className="size-3 shrink-0" />
                              </button>
                            ) : null}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            clique num CD para ver os produtos
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null,

                  /* Segundo nível: cada CD é uma linha real da tabela, com as
                     mesmas colunas — é o que mantém os números alinhados com o
                     cabeçalho em vez de empilhados à direita. */
                  ...(ativo
                    ? porFilial.flatMap(({ filial, itens }) => {
                        const abertaEsta = filialAberta === filial;
                        return [
                          <TableRow
                            key={`${r.fornecedor}-${filial}`}
                            onClick={() => selecionarFilial(filial)}
                            className={`cursor-pointer bg-muted/40 ${abertaEsta ? "bg-muted" : ""}`}
                          >
                            <TableCell className="pl-6">
                              <span className="flex items-center gap-2">
                                {abertaEsta ? (
                                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                                )}
                                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-(--brand-petrol) px-2 py-0.5 text-white dark:bg-(--brand-turquoise) dark:text-(--brand-petrol)">
                                  <Warehouse className="size-3.5 shrink-0" />
                                  <span className="font-mono text-base leading-none font-bold">
                                    {rotulo(filial)}
                                  </span>
                                </span>
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                              {numero(itens.length)}
                            </TableCell>
                            {ORDEM.map((c) => {
                              const n = itens.filter((i) => i.categoria === c).length;
                              const info = CATEGORIAS[c];
                              return (
                                <TableCell key={c} className="text-right">
                                  {n === 0 ? (
                                    <span className="font-mono text-xs tabular-nums text-muted-foreground/40">
                                      0
                                    </span>
                                  ) : (
                                    <span
                                      title={info.rotulo}
                                      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums ${info.fundo}`}
                                    >
                                      <info.icone className="size-3.5 shrink-0" />
                                      {numero(n)}
                                    </span>
                                  )}
                                </TableCell>
                              );
                            })}
                          </TableRow>,

                          /* Terceiro nível: produtos do CD aberto. */
                          abertaEsta ? (
                            <TableRow
                              key={`${r.fornecedor}-${filial}-produtos`}
                              className="hover:bg-transparent"
                            >
                              <TableCell colSpan={6} className="bg-muted/25 p-0">
                                <div className="space-y-2 p-3 pl-8">
                                  <p className="text-xs text-muted-foreground">
                                    clique no código para abrir o produto
                                  </p>
                                  <div className="grid gap-2">
                                    {produtosVisiveis.map((p) => (
                                      <CardPosicao key={p.codigo} posicao={p} rotulo={rotulo} />
                                    ))}
                                  </div>
                                  <Paginacao
                                    pagina={atualDetalhe}
                                    paginas={paginasDetalhe}
                                    aoMudar={setPaginaDetalhe}
                                  />
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : null,
                        ];
                      })
                    : []),
                ];
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Paginacao pagina={atual} paginas={paginas} aoMudar={setPagina} />
    </div>
  );
}

/** Linha de chips de um filtro, com "Todas" à frente e a contagem em cada opção. */
function GrupoFiltro({
  titulo,
  opcoes,
  ativo,
  totalGeral,
  aoTrocar,
}: {
  titulo: string;
  opcoes: { valor: string; rotulo: string; total: number }[];
  ativo: string | null;
  totalGeral: number;
  aoTrocar: (valor: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 w-12 shrink-0 text-sm font-medium text-muted-foreground">
        {titulo}
      </span>
      <Chip ativo={ativo === null} total={totalGeral} onClick={() => aoTrocar(null)}>
        Todas
      </Chip>
      {opcoes.map((o) => (
        <Chip
          key={o.valor}
          ativo={ativo === o.valor}
          total={o.total}
          onClick={() => aoTrocar(o.valor)}
        >
          {o.rotulo}
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  ativo,
  total,
  onClick,
  children,
}: {
  ativo: boolean;
  total: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        ativo
          ? "bg-(--brand-petrol) text-white dark:bg-(--brand-turquoise) dark:text-(--brand-petrol)"
          : "bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
      <span className={`ml-1.5 font-mono text-xs tabular-nums ${ativo ? "opacity-80" : "opacity-70"}`}>
        {numero(total)}
      </span>
    </button>
  );
}

/** Totais por categoria do recorte atual — acompanham o filtro de BU. */
function TotaisPorCategoria({ posicoes }: { posicoes: PosicaoRompida[] }) {
  const contagens = ORDEM.map((c) => ({
    categoria: c,
    valor: posicoes.filter((p) => p.categoria === c).length,
  }));

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {contagens.map(({ categoria, valor }) => {
        const info = CATEGORIAS[categoria];
        return (
          <div
            key={categoria}
            className={`rounded-lg border-l-4 bg-card p-3 ring-1 ring-foreground/5 ${info.borda}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">{info.curto}</p>
                <p className="font-mono text-2xl font-semibold tabular-nums">{numero(valor)}</p>
              </div>
              <info.icone className="size-5 shrink-0 text-muted-foreground" />
            </div>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={info.rotulo}>
              {info.rotulo}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/** Uma posição item × CD da faixa, com as reposições a caminho (se houver). */
function CardPosicao({
  posicao,
  rotulo,
}: {
  posicao: PosicaoRompida;
  rotulo: (codigo: string | null) => string;
}) {
  const info = CATEGORIAS[posicao.categoria];

  return (
    <div className={`rounded-lg border-l-4 bg-card p-3 ring-1 ring-foreground/5 ${info.borda}`}>
      {/* Sem o chip de CD: o cabeçalho do grupo acima já diz em qual filial
          estamos, e repetir em cada card só polui. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link
          href={`/produto/${encodeURIComponent(posicao.codigo)}`}
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-sm font-semibold text-(--brand-petrol) underline underline-offset-2 dark:text-(--brand-turquoise)"
        >
          {posicao.codigo}
        </Link>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {posicao.descricao ?? "—"}
        </span>
        <Badge className={`gap-1 whitespace-nowrap ${info.fundo}`} title={info.rotulo}>
          <info.icone className="size-3.5 shrink-0" />
          {info.curto}
        </Badge>
      </div>

      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        <span>{`Forecast do mês: ${numero(posicao.forecast)} un`}</span>
        <span>
          {posicao.saldoComprar > 0
            ? `Saldo a comprar: ${numero(posicao.saldoComprar)} un`
            : "Sem saldo no plano de compra do mês"}
        </span>
      </p>

      {posicao.reposicoes.length > 0 ? (
        <div className="mt-2 space-y-2">
          {posicao.reposicoes.map((rep, i) => (
            <LinhaReposicao key={`${rep.origem}-${rep.documento}-${i}`} rep={rep} rotulo={rotulo} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Uma reposição: quantidade, identificação e o percurso com datas projetadas. */
function LinhaReposicao({
  rep,
  rotulo,
}: {
  rep: Reposicao;
  rotulo: (codigo: string | null) => string;
}) {
  const compra = rep.origem === "compra";
  const cor = compra
    ? "text-amber-700 dark:text-amber-400"
    : "text-teal-700 dark:text-teal-300";
  const fundo = compra
    ? "border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/20"
    : "border-teal-500/30 bg-teal-500/5 dark:bg-teal-950/20";
  const Icone = compra ? ShoppingCart : Truck;

  return (
    <div className={`rounded-md border p-2.5 ${fundo}`}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <Icone className={`size-3.5 shrink-0 ${cor}`} />
        <span className={`font-mono text-lg font-semibold tabular-nums ${cor}`}>
          {numero(rep.quantidade)}
          <span className="ml-1 text-xs font-normal text-muted-foreground">un</span>
        </span>
        <span className="font-mono text-xs font-medium">
          {compra ? `Pedido ${rep.documento ?? "—"}` : `NF ${rep.documento ?? "—"}`}
        </span>
        <span className="text-xs text-muted-foreground">
          {`${compra ? "emitido" : "emitida"} ${dataBr(rep.emissao)}`}
        </span>
        {rep.direto ? (
          <span className="text-xs text-muted-foreground">compra direta</span>
        ) : rep.rota ? (
          <span className="font-mono text-xs text-muted-foreground">{rep.rota}</span>
        ) : (
          <span className="text-xs text-muted-foreground">transferência simples</span>
        )}
        {rep.reprojetada ? (
          <Badge variant="secondary" className="text-[10px]">
            {compra ? "reprojetado" : "reprojetada"}
          </Badge>
        ) : null}
      </div>

      {compra ? (
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <span>{`Status: ${rep.statusLogistica ?? "—"}`}</span>
          <span>{`Agendamento: ${rep.dataAgendada ?? "—"}`}</span>
          <span>{`Frete: ${rep.frete ?? "—"}`}</span>
        </p>
      ) : null}

      {/* Compra direta não percorre rota: entra na própria filial. */}
      {rep.direto || rep.etapas.length === 0 ? (
        <p
          className={`mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${
            compra ? "bg-amber-500/20" : "bg-teal-500/20"
          }`}
        >
          <span className="font-medium">Chegada</span>
          <span className="font-mono tabular-nums text-muted-foreground">
            {dataBr(rep.chegada)}
          </span>
        </p>
      ) : (
        <div className="mt-2">
          <WorkflowRota
            etapas={rep.etapas}
            rotulo={rotulo}
            tom={rep.origem}
            inicio={rep.inicio}
          />
        </div>
      )}
    </div>
  );
}

function Paginacao({
  pagina,
  paginas,
  aoMudar,
}: {
  pagina: number;
  paginas: number;
  aoMudar: (p: number) => void;
}) {
  if (paginas <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-sm text-muted-foreground">{`Página ${pagina} de ${paginas}`}</span>
      <Button
        variant="outline"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          aoMudar(pagina - 1);
        }}
        disabled={pagina <= 1}
      >
        <ChevronLeft className="size-4" />
        Anterior
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          aoMudar(pagina + 1);
        }}
        disabled={pagina >= paginas}
      >
        Próxima
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
