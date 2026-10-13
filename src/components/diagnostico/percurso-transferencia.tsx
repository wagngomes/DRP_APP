import { CheckCircle2, Clock, Package, Truck } from "lucide-react";

import type { Percurso } from "@/lib/diagnostico-ruptura/percurso.server";

/**
 * O percurso realizado da mercadoria, perna a perna.
 *
 * Responde a pergunta que o veredito "triangulação lenta" deixa em aberto:
 * **onde** ela demorou. Cada perna traz o que levou contra o SLA do trecho, e a
 * que ainda está andando traz a chegada projetada.
 *
 * Componente de servidor — é leitura, sem estado nem evento. O dado vem de
 * `percurso.server.ts`, que não pode atravessar para o cliente.
 *
 * O rastro é o **lote**, não o pedido: `pedido_bo` vem vazio em 100% das linhas
 * de transferência, então não há como amarrar estas notas a um pedido de compra
 * específico. A tela diz "lote" e não "pedido" por isso — e um lote pode
 * aparecer em várias remessas ao longo de semanas, então as pernas são
 * mostradas como fatos separados, sem afirmar que carregam a mesma caixa.
 */

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const num = (v: number) =>
  v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export function PercursoTransferencia({
  percursos,
}: {
  percursos: Percurso[];
}) {
  if (percursos.length === 0) return null;

  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Truck className="size-3.5 text-muted-foreground" />
        <span className="text-sm font-medium">Percurso da mercadoria</span>
        <span className="text-xs text-muted-foreground">
          {percursos.length === 1
            ? "1 remessa rastreada pelo lote"
            : `${percursos.length} remessas rastreadas pelo lote`}
        </span>
      </div>

      <div className="mt-3 space-y-3">
        {percursos.map((p) => (
          <div key={`${p.lote}|${p.rota}`} className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="font-mono text-muted-foreground">
                {`lote ${p.lote}`}
              </span>
              {p.rota !== "—" ? (
                <span className="rounded bg-muted px-1.5 py-px font-medium">
                  {p.rota}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  transferência direta
                </span>
              )}
              {p.concluido ? (
                <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="size-3" />
                  {`chegou em ${p.diasTotais} dias`}
                </span>
              ) : (
                <span
                  className={`flex items-center gap-1 ${p.temPernaVencida ? "text-amber-700 dark:text-amber-400" : "text-sky-700 dark:text-sky-400"}`}
                >
                  <Clock className="size-3" />
                  {p.temPernaVencida ? "parada, prazo vencido" : "em curso"}
                </span>
              )}
              {/* O atraso acumulado é a manchete: é ele que liga o percurso à
                  ruptura, e é o número que a reunião cobra. */}
              {p.atrasoAcumulado > 0 ? (
                <span className="font-medium text-amber-700 dark:text-amber-400">
                  {`${p.atrasoAcumulado} dias além do SLA`}
                </span>
              ) : null}
            </div>

            <ol className="mt-1.5 space-y-1">
              {p.pernas.map((n) => {
                const atrasada = (n.atraso ?? 0) > 0;
                return (
                  <li
                    key={n.nf}
                    className="grid grid-cols-[1.25rem_minmax(0,9rem)_minmax(0,1fr)] items-start gap-2 text-xs"
                  >
                    <span className="flex justify-center pt-0.5">
                      {n.chegou ? (
                        <Package
                          className={`size-3.5 ${atrasada ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}
                        />
                      ) : (
                        <Truck
                          className={`size-3.5 ${n.vencida ? "text-amber-600 dark:text-amber-400" : "text-sky-600 dark:text-sky-400"}`}
                        />
                      )}
                    </span>
                    <span className="font-mono">
                      {`${n.de} → ${n.para}`}
                      <span className="ml-1 text-muted-foreground">
                        {`passo ${n.passo}`}
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="text-muted-foreground">
                        {`saiu ${dataBr(n.saiu)} · `}
                      </span>
                      {n.chegou ? (
                        <>
                          <span>{`chegou ${dataBr(n.chegou)}`}</span>
                          <span
                            className={`ml-1 font-medium ${atrasada ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}`}
                          >
                            {n.sla === null
                              ? `${n.dias}d · sem SLA cadastrado`
                              : atrasada
                                ? `${n.dias}d contra ${n.sla}d de SLA · +${n.atraso}`
                                : `${n.dias}d, dentro do SLA de ${n.sla}d`}
                          </span>
                        </>
                      ) : (
                        <span
                          className={
                            n.vencida
                              ? "font-medium text-amber-700 dark:text-amber-400"
                              : "text-sky-700 dark:text-sky-400"
                          }
                        >
                          {!n.chegadaPrevista
                            ? "em trânsito, sem SLA para projetar"
                            : n.vencida
                              ? `era para ter chegado em ${dataBr(n.chegadaPrevista)} · SLA ${n.sla}d`
                              : `prevista para ${dataBr(n.chegadaPrevista)} · SLA ${n.sla}d`}
                        </span>
                      )}
                      <span className="ml-1 font-mono text-muted-foreground">
                        {`${num(n.quantidade)} un · NF ${n.nf}`}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>

      {/* O limite vai na tela, e não só no código: quem lê precisa saber que a
          chegada tem a granularidade das cargas. */}
      <p className="mt-2 text-[11px] text-muted-foreground">
        A chegada é deduzida do dia em que a nota sai da base — tem a precisão
        das importações, não do recebimento.
      </p>
    </div>
  );
}
