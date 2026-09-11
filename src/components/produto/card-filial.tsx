import {
  AlertTriangle,
  Boxes,
  Gauge,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BadgeDias } from "@/components/produto/badge-dias";
import { WorkflowRota } from "@/components/produto/workflow-rota";
import type { PosicaoFilial } from "@/lib/produto/consultas";
import { ROTULO_STATUS, calcularRitmo, type StatusRitmo } from "@/utils/ritmo-venda";
import { ehCdVirtual } from "@/utils/cds-virtuais";

function numero(v: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function dataBr(d: Date | string | null): string {
  if (!d) return "—";
  const data = typeof d === "string" ? new Date(d) : d;
  return data.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/**
 * Cor por natureza da informação, não por enfeite: compras são âmbar e
 * transferências turquesa em todo lugar, então o número do topo e o bloco
 * detalhado abaixo se reconhecem pela cor. Estoque e forecast completam o
 * conjunto sem repetir tom.
 */
const TILES = [
  { chave: "estoque", icone: Boxes, cor: "text-(--brand-petrol) dark:text-sky-300", fundo: "bg-(--brand-petrol)/5 dark:bg-sky-950/40" },
  { chave: "compras", icone: ShoppingCart, cor: "text-amber-600 dark:text-amber-400", fundo: "bg-amber-500/8 dark:bg-amber-950/40" },
  { chave: "transf", icone: Truck, cor: "text-teal-600 dark:text-teal-300", fundo: "bg-teal-500/8 dark:bg-teal-950/40" },
  { chave: "forecast", icone: TrendingUp, cor: "text-violet-600 dark:text-violet-300", fundo: "bg-violet-500/8 dark:bg-violet-950/40" },
  { chave: "vendido", icone: Gauge, cor: "text-rose-600 dark:text-rose-300", fundo: "bg-rose-500/8 dark:bg-rose-950/40" },
] as const;

/**
 * Status do ritmo com ícone + rótulo: cor sozinha não carrega o significado,
 * e "atrasada" é aviso, não erro — por isso âmbar e não vermelho.
 */
const STATUS: Record<StatusRitmo, { icone: typeof TrendingUp; cor: string; rotulo: string }> = {
  atrasada: {
    icone: TrendingDown,
    cor: "text-amber-700 bg-amber-500/15 dark:text-amber-400",
    rotulo: ROTULO_STATUS.atrasada,
  },
  no_ritmo: {
    icone: Gauge,
    cor: "text-emerald-700 bg-emerald-500/15 dark:text-emerald-400",
    rotulo: ROTULO_STATUS.no_ritmo,
  },
  acelerada: {
    icone: TrendingUp,
    cor: "text-sky-700 bg-sky-500/15 dark:text-sky-300",
    rotulo: ROTULO_STATUS.acelerada,
  },
};

/**
 * Abertura do valor principal do tile, sempre em uma única linha de colunas:
 * rótulo pequeno em cima, número embaixo. Com 6 armazéns num tile estreito,
 * pares "rótulo valor" lado a lado estouravam a largura e quebravam em duas
 * linhas, dobrando a altura do card.
 */
function Abertura({
  itens,
}: {
  itens: { rotulo: string; quantidade: number | null }[];
}) {
  if (itens.length === 0) return null;
  return (
    <dl className="mt-2 flex gap-x-1 border-t pt-2">
      {itens.map((i) => (
        <div key={i.rotulo} className="min-w-0 flex-1 text-center">
          <dt className="truncate text-[10px] leading-tight font-medium text-muted-foreground">
            {i.rotulo}
          </dt>
          <dd className="truncate font-mono text-xs leading-tight font-medium tabular-nums text-foreground/80">
            {i.quantidade === null ? "—" : numero(i.quantidade)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Tile({
  indice,
  titulo,
  valor,
  children,
}: {
  indice: number;
  titulo: string;
  valor: string;
  children?: React.ReactNode;
}) {
  const t = TILES[indice];
  const Icone = t.icone;
  return (
    <div className={`rounded-lg border p-3 ${t.fundo}`}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icone className={`size-4 ${t.cor}`} />
        {titulo}
      </p>
      <p className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${t.cor}`}>{valor}</p>
      {children}
    </div>
  );
}

/**
 * Posição do produto em uma filial: estoque, compras e transferências que
 * terminam aqui, com o percurso e a data prevista em cada CD.
 *
 * `indice` alterna a faixa lateral entre as duas cores da marca, para os cards
 * empilhados não virarem um bloco único.
 */
export function CardFilial({
  posicao,
  rotulos,
  indice,
  dataReferencia,
  modo = "filial",
}: {
  posicao: PosicaoFilial;
  rotulos: Record<string, string>;
  indice: number;
  dataReferencia: string;
  /**
   * "cia" mostra só os totais consolidados: pedidos e transferências já são
   * detalhados no CD de destino, e repeti-los aqui duplicaria a leitura.
   */
  modo?: "filial" | "cia";
}) {
  const rotulo = (codigo: string | null) => (codigo ? (rotulos[codigo] ?? codigo) : "—");
  const emTransito = posicao.transferencias.reduce((s, t) => s + (t.qtde ?? 0), 0);
  // Os pedidos com rota entram no destino final, então o total do card é o que
  // de fato chega aqui — e não o que foi emitido por esta filial.
  const comprasChegando = posicao.pedidos.reduce((s, pe) => s + (pe.quantidade_receber ?? 0), 0);
  const ehCia = modo === "cia";
  const par = indice % 2 === 0;
  const ritmo = calcularRitmo(posicao.vendidoMes, posicao.forecastM0, dataReferencia);
  const info = ritmo.status ? STATUS[ritmo.status] : null;

  return (
    <Card
      className={
        ehCia
          ? "border-2 border-(--brand-turquoise) bg-(--brand-turquoise)/5"
          : `border-l-4 ${par ? "border-l-(--brand-petrol)" : "border-l-(--brand-turquoise)"}`
      }
    >
      <CardHeader className="flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-baseline gap-2 text-xl">
          {ehCia ? (
            <>
              <span className="text-teal-700 dark:text-(--brand-turquoise)">Visão Cia</span>
              <span className="text-sm font-normal text-muted-foreground">
                consolidado de todos os CDs
              </span>
            </>
          ) : (
            <>
              <span
                className={par ? "text-(--brand-petrol) dark:text-sky-300" : "text-teal-700 dark:text-(--brand-turquoise)"}
              >
                {rotulo(posicao.filial)}
              </span>
              <span className="font-mono text-sm font-normal text-muted-foreground">
                {posicao.filial}
              </span>
            </>
          )}
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          <BadgeDias dias={posicao.diasChao} rotulo="Chão" />
          <BadgeDias dias={posicao.diasTotal} rotulo="Total" />
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Tile indice={0} titulo="Estoque chão" valor={numero(posicao.estoqueChao)}>
            <Abertura itens={posicao.armazens} />
          </Tile>
          <Tile indice={1} titulo="Compras chegando" valor={numero(comprasChegando)} />
          <Tile indice={2} titulo="Transferências chegando" valor={numero(emTransito)} />
          <Tile
            indice={3}
            titulo="Forecast do mês"
            valor={posicao.forecastM0 === null ? "—" : numero(posicao.forecastM0)}
          >
            {/* Vendas dos 4 meses anteriores: dão a tendência que sustenta (ou
                contradiz) o forecast destacado acima. */}
            <Abertura itens={posicao.historico} />
          </Tile>
          <Tile indice={4} titulo="Vendido no mês" valor={numero(posicao.vendidoMes)}>
            {/* Percentual e status na mesma linha: são a mesma leitura — quanto
                do forecast saiu e se isso está adiantado ou atrasado. */}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t pt-2">
              <span className="flex items-baseline gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">do forecast</span>
                <span className="font-mono text-sm font-medium tabular-nums text-foreground/80">
                  {ritmo.percentualForecast === null
                    ? "—"
                    : `${(ritmo.percentualForecast * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
                </span>
              </span>
              {info ? (
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${info.cor}`}
                  title={`Esperado ${(ritmo.fracaoDecorrida * 100).toFixed(0)}% do forecast até a data de referência`}
                >
                  <info.icone className="size-3.5 shrink-0" />
                  {info.rotulo}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">sem forecast</span>
              )}
            </div>
          </Tile>
        </div>

        {/* Só aparece quando a venda deste CD está acelerada: em qualquer outro
            ritmo, "quem comprou fora do padrão" é curiosidade, não explicação. */}
        {ritmo.status === "acelerada" && posicao.clientesAcelerando.length > 0 ? (
          <section className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 dark:border-red-500/25 dark:bg-red-950/20">
            <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-red-700 dark:text-red-400">
              <Users className="size-4" />
              {`Quem puxou a aceleração (${posicao.clientesAcelerando.length})`}
            </p>
            <p className="mb-2 text-xs text-muted-foreground">
              {ehCia
                ? "Clientes que compraram acima do próprio padrão, somando todos os CDs."
                : "Clientes que compraram acima do próprio padrão neste CD."}
            </p>
            <ul className="grid gap-1.5">
              {posicao.clientesAcelerando.slice(0, 6).map((c) => (
                <li
                  key={c.cnpj}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-md border bg-card px-2.5 py-1.5"
                >
                  <span className="min-w-0 flex-1 truncate text-xs" title={c.cliente}>
                    {c.cliente}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {`${numero(c.atual)} un · padrão ${numero(c.mediana)}`}
                  </span>
                  <span className="font-mono text-sm font-semibold tabular-nums text-red-700 dark:text-red-400">
                    {`+${numero(c.excedente)}`}
                  </span>
                </li>
              ))}
            </ul>
            {posicao.clientesAcelerando.length > 6 ? (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {`e mais ${posicao.clientesAcelerando.length - 6} cliente(s).`}
              </p>
            ) : null}
          </section>
        ) : null}

        {/* Aceleração sem cliente identificado é informação, não ausência de
            dado: quando o aumento está diluído entre muitos, o forecast é que
            está defasado. Nos CDs virtuais é limite da base de origem. */}
        {ritmo.status === "acelerada" && posicao.clientesAcelerando.length === 0 ? (
          <p className="rounded-lg border border-dashed p-2.5 text-xs text-muted-foreground">
            {ehCdVirtual(posicao.filial)
              ? "O histórico de vendas não separa o armazém 11, então não há como atribuir esta aceleração a clientes deste CD."
              : "Nenhum cliente isolado explica esta aceleração — o aumento está diluído entre vários, o que costuma indicar forecast defasado e não pedido pontual."}
          </p>
        ) : null}

        {!ehCia && posicao.rotaCompra ? (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Rota de compra:</span>{" "}
            <span className="font-mono">{posicao.rotaCompra}</span>
          </p>
        ) : null}

        {!ehCia && posicao.pedidos.length > 0 ? (
          <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 dark:border-amber-500/25 dark:bg-amber-950/20">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400">
              <ShoppingCart className="size-4" />
              {`Pedidos de compra a caminho (${posicao.pedidos.length})`}
            </p>
            <div className="space-y-2">
              {posicao.pedidos.map((pe) => (
                <div key={pe.id} className="rounded-md border bg-card p-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-mono text-2xl font-semibold text-amber-700 tabular-nums dark:text-amber-400">
                      {numero(pe.quantidade_receber ?? 0)}
                      <span className="ml-1 text-sm font-normal text-muted-foreground">un</span>
                    </span>
                    <span className="font-mono text-xs font-medium">
                      Pedido {pe.num_pedido ?? "—"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {`emitido ${dataBr(pe.data_emissao)}`}
                    </span>
                    {pe.projecao.direto ? (
                      <span className="text-xs text-muted-foreground">compra direta</span>
                    ) : (
                      <span className="font-mono text-xs text-muted-foreground">{pe.rota}</span>
                    )}
                    {pe.projecao.reprojetada ? (
                      <Badge variant="secondary" className="text-[10px]">
                        reprojetado
                      </Badge>
                    ) : null}
                  </div>

                  <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>{`Status: ${pe.status_logistica ?? "—"}`}</span>
                    <span>{`Agendamento: ${pe.data_agendada ?? "—"}`}</span>
                    <span>{`Frete: ${pe.frete ?? "—"}`}</span>
                    <span>{`Data pedra: ${dataBr(pe.data_pedra)}`}</span>
                  </p>

                  {pe.projecao.direto ? (
                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-500/20 px-2 py-1 text-xs">
                      <span className="font-medium">{rotulo(pe.projecao.cdFinal)}</span>
                      <span className="font-mono tabular-nums text-muted-foreground">
                        {pe.projecao.chegadaFinal ? dataBr(pe.projecao.chegadaFinal) : "sem data"}
                      </span>
                    </p>
                  ) : (
                    <div className="mt-2">
                      <WorkflowRota
                        etapas={pe.projecao.etapas}
                        rotulo={rotulo}
                        tom="compra"
                        /* Reprojetado: a data pedra está no passado; vale a recalculada. */
                        inicio={dataBr(pe.projecao.chegadaPrimeiroPonto)}
                      />
                    </div>
                  )}

                  {pe.projecao.motivo ? (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="size-3.5 shrink-0" />
                      {pe.projecao.motivo === "sem_data_emissao"
                        ? "Sem data pedra: não há como projetar a chegada."
                        : "Percurso sem data prevista: falta SLA em algum trecho."}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {!ehCia && posicao.transferencias.length > 0 ? (
          <section className="rounded-lg border border-teal-500/30 bg-teal-500/5 p-3 dark:border-teal-500/25 dark:bg-teal-950/20">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-teal-700 dark:text-teal-300">
              <Truck className="size-4" />
              {`Transferências a caminho (${posicao.transferencias.length})`}
            </p>
            <div className="space-y-2">
              {posicao.transferencias.map((t) => (
                <div key={t.id} className="rounded-md border bg-card p-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-mono text-2xl font-semibold text-teal-700 tabular-nums dark:text-teal-300">
                      {numero(t.qtde ?? 0)}
                      <span className="ml-1 text-sm font-normal text-muted-foreground">un</span>
                    </span>
                    <span className="font-mono text-xs font-medium">NF {t.numero_nf_saida ?? "—"}</span>
                    <span className="text-xs text-muted-foreground">
                      {`emitida ${dataBr(t.data_emissao)}`}
                    </span>
                    {t.rota ? (
                      <span className="font-mono text-xs text-muted-foreground">{t.rota}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">transferência simples</span>
                    )}
                    {t.projecao.reprojetada ? (
                      <Badge variant="secondary" className="text-[10px]">
                        reprojetada
                      </Badge>
                    ) : null}
                  </div>

                  {/* Workflow: cada parada com a data prevista de chegada. */}
                  <div className="mt-2">
                    <WorkflowRota
                      etapas={t.projecao.etapas}
                      rotulo={rotulo}
                      tom="transferencia"
                      inicio="saída"
                    />
                  </div>

                  {t.projecao.motivo ? (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="size-3.5 shrink-0" />
                      Percurso sem data prevista: falta SLA em algum trecho.
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
