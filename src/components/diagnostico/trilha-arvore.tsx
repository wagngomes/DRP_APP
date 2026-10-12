import { ArrowLeftRight, Check, CircleHelp, Truck, X } from "lucide-react";

import { tomDaEtapa } from "@/components/diagnostico/tons-etapa";
import { Badge } from "@/components/ui/badge";
import type {
  PassoTrilha,
  VereditoArvore,
} from "@/lib/diagnostico-ruptura/consultas";
import type { Evidencia } from "@/lib/diagnostico-ruptura/evidencias";

/**
 * O veredito, o caminho que levou até ele e a prova.
 *
 * A árvore responde **qual foi**, numa frase única. A trilha é o que dispensa
 * confiança no motor: a pessoa lê as perguntas na ordem, vê a resposta e os
 * números que cada uma olhou, e confere o veredito sozinha — é o mesmo fluxo
 * de `docs/arvore-diagnostico.md`.
 *
 * A prova vem logo acima, porque é o que vai para a ata: uma frase com os
 * números dentro, a prescrição quando havia estoque na rede, e os CDs que
 * tinham sobra naquele dia.
 */

/** O selo compacto, para a linha da tabela. */
export function SeloArvore({ arvore }: { arvore: VereditoArvore | null }) {
  if (!arvore) {
    return (
      <span className="text-xs text-muted-foreground">
        árvore não rodou nesta posição
      </span>
    );
  }

  const tom = tomDaEtapa(arvore.etapa);

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
      <span className={`size-2 shrink-0 rounded-full ${tom.barra}`} />
      <span className={`truncate font-medium ${tom.texto}`}>
        {arvore.rotulo}
      </span>
      {/* O nó que travou, e não só "incompleta": sem ele a pessoa sabe que
          falta dado e não sabe qual. */}
      {arvore.incompleta && arvore.noTravou ? (
        <span className="shrink-0 rounded bg-slate-500/10 px-1 py-px font-mono text-[10px] text-muted-foreground">
          {`parou em ${arvore.noTravou}`}
        </span>
      ) : null}
    </span>
  );
}

/** O percurso inteiro, pergunta por pergunta. */
export function TrilhaArvore({
  arvore,
  trilha,
}: {
  arvore: VereditoArvore | null;
  trilha: PassoTrilha[];
}) {
  if (!arvore || trilha.length === 0) return null;

  const tom = tomDaEtapa(arvore.etapa);

  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`size-2.5 shrink-0 rounded-full ${tom.barra}`} />
        <span className="text-sm font-medium">Árvore de decisão</span>
        <span className={`text-sm font-semibold ${tom.texto}`}>
          {arvore.rotulo}
        </span>
        {arvore.incompleta ? (
          <Badge
            variant="outline"
            className="gap-1 text-[10px] text-muted-foreground"
          >
            <CircleHelp className="size-3" />
            {arvore.noTravou
              ? `faltou dado em ${arvore.noTravou}`
              : "faltou dado"}
          </Badge>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground">
          {arvore.dono}
        </span>
      </div>

      <ol className="mt-3 space-y-1.5">
        {trilha.map((p) => (
          <li
            key={p.no}
            className="grid grid-cols-[1.5rem_2.5rem_minmax(0,1fr)] items-start gap-2 text-xs"
          >
            <span className="flex justify-center pt-0.5">
              {p.resposta === null ? (
                <CircleHelp className="size-3.5 text-muted-foreground" />
              ) : p.resposta ? (
                <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <X className="size-3.5 text-rose-600 dark:text-rose-400" />
              )}
            </span>
            <span className="pt-0.5 font-mono text-[11px] text-muted-foreground">
              {p.no}
            </span>
            <div className="min-w-0">
              <p className="leading-snug">{p.pergunta}</p>
              {/* Os números que a pergunta olhou. É isto que permite discordar
                  do veredito com argumento, em vez de só desconfiar dele. */}
              {p.evidencia && Object.keys(p.evidencia).length > 0 ? (
                <dl className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  {Object.entries(p.evidencia).map(([k, v]) => (
                    <div key={k} className="flex gap-1">
                      <dt>{k.replaceAll("_", " ")}</dt>
                      <dd className="font-mono tabular-nums">
                        {typeof v === "number"
                          ? v.toLocaleString("pt-BR", {
                              maximumFractionDigits: 1,
                            })
                          : String(v ?? "—")}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * A prova da causa: a frase, os números e o que teria bastado.
 *
 * Vem antes da trilha na tela. Quem está na reunião quer a frase; quem
 * discorda dela desce para o percurso e confere pergunta por pergunta.
 *
 * A prescrição é a parte acionável, e é o que sobrou do motor contrafactual:
 * *"transferir 180 até 04/09 teria evitado"*, com o CD doador nomeado. Sem o
 * nome do CD a frase não serve — quem lê teria de ir procurar onde havia
 * estoque.
 */
export function ProvaDaCausa({ evidencia }: { evidencia: Evidencia | null }) {
  if (!evidencia) return null;

  const valores = Object.entries(evidencia.valores).filter(
    ([, v]) => v !== null && v !== undefined,
  );

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed">{evidencia.resumo}</p>

      {evidencia.prescricao ? (
        <div
          className={`rounded-md border p-3 ${
            evidencia.prescricao.tipo === "evitaria"
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-amber-500/30 bg-amber-500/5"
          }`}
        >
          <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <Truck className="size-3.5" />
            {evidencia.prescricao.tipo === "evitaria"
              ? "O que teria evitado"
              : "O que teria reduzido"}
          </p>
          <p className="mt-1 text-sm leading-relaxed">
            {`Transferir `}
            <span className="font-mono font-semibold tabular-nums">
              {num(evidencia.prescricao.quantidade)}
            </span>
            {` unidades até `}
            <span className="font-semibold">
              {dataBr(evidencia.prescricao.data)}
            </span>
            {evidencia.prescricao.cd ? (
              <>
                {`, do CD `}
                <span className="font-mono font-semibold">
                  {evidencia.prescricao.cd}
                </span>
                {evidencia.prescricao.sobraNoCd !== null
                  ? ` — que tinha ${num(evidencia.prescricao.sobraNoCd)} acima do Alvo`
                  : ""}
              </>
            ) : null}
            {evidencia.prescricao.tipo === "evitaria"
              ? ", e não teria rompido."
              : `, deixando ${num(evidencia.prescricao.diasRestantes)} dia(s) de ruptura em vez de todos.`}
          </p>
        </div>
      ) : null}

      {valores.length > 0 ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
          {valores.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="truncate text-muted-foreground">
                {k.replaceAll("_", " ")}
              </dt>
              <dd className="truncate font-mono tabular-nums">
                {typeof v === "number" ? num(v) : String(v)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {/* O modificador: vale em cima de qualquer veredito. Uma ruptura herdada
          da abertura continua sendo da abertura, e ainda assim podia ter sido
          evitada com o que estava parado noutro CD. */}
      {evidencia.balanceamentoNaoRealizado ? (
        <p className="flex items-start gap-1.5 text-xs text-sky-700 dark:text-sky-400">
          <ArrowLeftRight className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Além da causa acima, cabia transferência: outro CD tinha estoque
            acima do Alvo e nada saiu.
          </span>
        </p>
      ) : null}

      {/* Os doadores, mesmo quando não há prescrição: saber que a rede tinha
          estoque parado é informação, ainda que naquele prazo nada resolvesse. */}
      {evidencia.doadores && evidencia.doadores.length > 0 ? (
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            CDs com estoque acima do Alvo no dia
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {evidencia.doadores.map((d) => (
              <span
                key={d.cd}
                className="rounded-full border px-2 py-0.5 text-xs"
                title={`${num(d.disponivel)} disponíveis no CD ${d.cd}`}
              >
                <span className="font-mono">{d.cd}</span>
                <span className="font-mono font-medium tabular-nums">
                  {` +${num(d.sobra)}`}
                </span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const num = (v: number) =>
  v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

const dataBr = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};
