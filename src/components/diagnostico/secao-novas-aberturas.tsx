import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle, PackagePlus, ShoppingCart, Sparkles, Truck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WorkflowRota } from "@/components/produto/workflow-rota";
import { JanelaAberturas } from "@/components/diagnostico/janela-aberturas";
import {
  coberturaSuspeita,
  POR_PAGINA,
  type NovaAbertura,
  type ResultadoNovasAberturas,
} from "@/lib/diagnostico-ruptura/novas-aberturas";

/**
 * Novas aberturas de forecast entre duas cargas.
 *
 * Fica ao lado do diagnóstico porque responde à pergunta que vem **antes**
 * dele: estas posições ainda não são ruptura com causa, são demanda recém
 * criada que pode virar ruptura amanhã. Quem olha quer decidir hoje se manda
 * comprar ou transferir — e para isso precisa ver, na mesma linha, o que já
 * existe de estoque e o que já está a caminho.
 *
 * O workflow é o mesmo da tela de produto, de propósito: o percurso de uma
 * reposição precisa ser lido do mesmo jeito em todo lugar.
 */

const num = (v: number) => Math.round(v).toLocaleString("pt-BR");

const dataBr = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

const dataCurta = (d: Date | string | null) => {
  if (!d) return "sem data";
  const data = typeof d === "string" ? new Date(d) : d;
  return data.toLocaleDateString("pt-BR", { timeZone: "UTC" });
};

export function SecaoNovasAberturas({
  dados,
  rotulos,
  pagina,
  href,
}: {
  dados: ResultadoNovasAberturas;
  /** Código da filial -> sigla. */
  rotulos: Record<string, string>;
  pagina: number;
  /** Monta a URL preservando os demais filtros da tela. */
  href: (extra: Record<string, string | undefined>) => string;
}) {
  const rotulo = (codigo: string | null) =>
    codigo ? (rotulos[codigo] ?? codigo) : "—";

  const paginas = Math.max(1, Math.ceil(dados.total / POR_PAGINA));
  const semCargas = dados.cargas.length < 2;

  return (
    <Card id="novas-aberturas" className="scroll-mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-(--brand-turquoise)" />
          Novas aberturas
        </CardTitle>
        <CardDescription>
          Posições que ganharam previsão entre as duas cargas: não tinham
          forecast naquele CD e passaram a ter. Nascem com demanda e sem prazo
          para comprar, então valem uma decisão antes de virarem ruptura.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {semCargas ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            É preciso ao menos duas cargas de forecast para comparar.
          </p>
        ) : (
          <>
            <div className="rounded-md border bg-muted/20 p-3">
              {/* Suspense porque o seletor lê `useSearchParams`: sem ele o
                  build de produção reclama de bailout para renderização no
                  cliente, mesmo numa página `force-dynamic`. */}
              <Suspense
                fallback={
                  <div className="h-16 animate-pulse rounded-md bg-muted/50" />
                }
              >
                <JanelaAberturas
                  de={dados.de ?? ""}
                  ate={dados.ate ?? ""}
                  cargaDe={dados.de}
                  cargaAte={dados.ate}
                  primeira={dados.cargas[dados.cargas.length - 1]}
                  ultima={dados.cargas[0]}
                />
              </Suspense>
              {dados.snapshotPosicao ? (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {`Estoque, pedidos e transferências na posição de ${dataBr(dados.snapshotPosicao)} — a mesma data da carga final, para não misturar épocas.`}
                </p>
              ) : null}
            </div>

            {/* A tela duvidando de si mesma: carga inicial mais fina que a
                final inventa aberturas que nunca aconteceram. */}
            {coberturaSuspeita(dados.cobertura) ? (
              <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-px size-3.5 shrink-0" />
                <span>
                  {`A carga inicial trouxe ${num(dados.cobertura!.de)} posições com previsão contra ${num(dados.cobertura!.ate)} da final. ` +
                    "Parte do que aparece aqui pode ser retorno de uma carga incompleta, e não abertura de verdade — vale comparar com outra data inicial."}
                </span>
              </p>
            ) : null}

            {dados.total === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma abertura nova nesta janela.
              </p>
            ) : (
              <>
                <p className="text-sm font-medium">
                  {`${num(dados.total)} abertura(s) entre ${dataBr(dados.de!)} e ${dataBr(dados.ate!)}`}
                </p>

                <div className="space-y-2">
                  {dados.linhas.map((l) => (
                    <LinhaAbertura
                      key={`${l.codigo}|${l.filial}`}
                      linha={l}
                      rotulo={rotulo}
                    />
                  ))}
                </div>

                {paginas > 1 ? (
                  <div className="flex items-center justify-between pt-1 text-sm">
                    <span className="text-muted-foreground">
                      {`Página ${pagina} de ${paginas}`}
                    </span>
                    <div className="flex gap-2">
                      {pagina > 1 ? (
                        <Link
                          href={`${href({ pgAb: String(pagina - 1) })}#novas-aberturas`}
                          scroll={false}
                          className="rounded-md border px-3 py-1.5 hover:bg-muted"
                        >
                          Anterior
                        </Link>
                      ) : null}
                      {pagina < paginas ? (
                        <Link
                          href={`${href({ pgAb: String(pagina + 1) })}#novas-aberturas`}
                          scroll={false}
                          className="rounded-md border px-3 py-1.5 hover:bg-muted"
                        >
                          Próxima
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LinhaAbertura({
  linha: l,
  rotulo,
}: {
  linha: NovaAbertura;
  rotulo: (codigo: string | null) => string;
}) {
  const nadaACaminho = l.transferencias.length === 0 && l.pedidos.length === 0;
  const semEstoque = l.estoqueChao <= 0;

  return (
    <div className="rounded-md border p-3">
      <div className="grid grid-cols-1 items-start gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,16rem)_6rem_6rem_7rem_minmax(0,1fr)]">
        <div className="min-w-0">
          {/* Link para a tela de produto: a decisão sobre uma abertura quase
              sempre continua lá, com a posição em todos os CDs. */}
          <Link
            href={`/produto/${encodeURIComponent(l.codigo)}`}
            className="block truncate font-mono text-sm font-medium text-(--brand-petrol) hover:underline dark:text-(--brand-turquoise)"
          >
            {l.codigo}
          </Link>
          <span className="block truncate text-xs text-muted-foreground">
            {l.descricao ?? "—"}
          </span>
          {l.fornecedor ? (
            <span className="block truncate text-[11px] text-muted-foreground/80">
              {l.fornecedor}
            </span>
          ) : null}
        </div>

        <div className="min-w-0">
          <span className="block font-mono text-sm font-semibold">
            {rotulo(l.filial)}
          </span>
          <span className="block font-mono text-[11px] text-muted-foreground">
            {l.filial}
          </span>
        </div>

        <div>
          <span className="block text-[11px] text-muted-foreground">
            Forecast
          </span>
          <span className="block font-mono text-sm font-semibold tabular-nums">
            {num(l.forecast)}
          </span>
        </div>

        <div>
          <span className="block text-[11px] text-muted-foreground">
            Estoque chão
          </span>
          <span
            className={`block font-mono text-sm font-semibold tabular-nums ${
              semEstoque ? "text-rose-600 dark:text-rose-400" : ""
            }`}
          >
            {num(l.estoqueChao)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <PackagePlus className="size-3" />
            {`aberto em ${dataBr(l.criadoEm)}`}
          </Badge>
          {/* Duas formas do mesmo fato que pedem ações diferentes: CD novo para
              o item é cadastro, previsão ligada é planejamento. */}
          <Badge
            variant="outline"
            className={`text-[10px] ${
              l.linhaNova
                ? "border-sky-500 text-sky-700 dark:text-sky-400"
                : "border-muted-foreground/40 text-muted-foreground"
            }`}
          >
            {l.linhaNova ? "CD novo para o item" : "previsão ligada"}
          </Badge>
          {l.rotaCompra ? (
            <Badge variant="outline" className="font-mono text-[10px]">
              {`rota ${l.rotaCompra}`}
            </Badge>
          ) : null}
          {semEstoque && nadaACaminho ? (
            <Badge className="gap-1 bg-rose-500/15 text-[10px] text-rose-700 hover:bg-rose-500/15 dark:text-rose-400">
              <AlertTriangle className="size-3" />
              sem estoque e sem reposição
            </Badge>
          ) : null}
        </div>
      </div>

      {nadaACaminho ? null : (
        <div className="mt-3 space-y-2 border-t pt-3">
          {l.pedidos.map((p) => (
            <div key={`p${p.id}`} className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <ShoppingCart className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="font-medium">
                  {`${num(p.quantidade_receber ?? 0)} un.`}
                </span>
                <span className="font-mono text-muted-foreground">
                  {`pedido ${p.num_pedido ?? "—"}`}
                </span>
                {p.status_logistica ? (
                  <span className="text-muted-foreground">
                    {p.status_logistica}
                  </span>
                ) : null}
                {p.frete ? (
                  <span className="text-muted-foreground">{p.frete}</span>
                ) : null}
                {p.projecao.reprojetada ? (
                  <Badge variant="secondary" className="text-[10px]">
                    reprojetada
                  </Badge>
                ) : null}
              </div>
              {p.projecao.direto ? (
                <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-amber-500/20 px-2 py-1 text-xs">
                  <span className="font-medium">
                    {rotulo(p.projecao.cdFinal)}
                  </span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {dataCurta(p.projecao.chegadaFinal)}
                  </span>
                </p>
              ) : (
                <div className="mt-1.5">
                  <WorkflowRota
                    etapas={p.projecao.etapas}
                    rotulo={rotulo}
                    tom="compra"
                    inicio={dataCurta(p.projecao.chegadaPrimeiroPonto)}
                  />
                </div>
              )}
            </div>
          ))}

          {l.transferencias.map((t) => (
            <div key={`t${t.id}`} className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <Truck className="size-3.5 shrink-0 text-teal-600 dark:text-teal-400" />
                <span className="font-medium">{`${num(t.qtde ?? 0)} un.`}</span>
                <span className="font-mono text-muted-foreground">
                  {`NF ${t.numero_nf_saida ?? "—"}`}
                </span>
                {t.projecao.reprojetada ? (
                  <Badge variant="secondary" className="text-[10px]">
                    reprojetada
                  </Badge>
                ) : null}
              </div>
              <div className="mt-1.5">
                <WorkflowRota
                  etapas={t.projecao.etapas}
                  rotulo={rotulo}
                  tom="transferencia"
                  inicio="saída"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
