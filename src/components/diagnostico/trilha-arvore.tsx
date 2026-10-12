import { Check, CircleHelp, X } from "lucide-react";

import { tomDaEtapa } from "@/components/diagnostico/barra-causas";
import { Badge } from "@/components/ui/badge";
import type {
  PassoTrilha,
  VereditoArvore,
} from "@/lib/diagnostico-ruptura/consultas";

/**
 * O veredito da árvore de decisão, e o caminho que levou até ele.
 *
 * A outra régua do diagnóstico. O motor contrafactual mede **quanto** cada
 * etapa explica e devolve várias causas com percentual; a árvore responde
 * **qual foi**, numa frase única. As duas aparecem juntas na tela de
 * propósito: quando discordam, é esse par que vale conferir à mão.
 *
 * A trilha é o que dispensa confiança no motor. A pessoa lê as perguntas na
 * ordem, vê a resposta e os números que cada uma olhou, e confere o veredito
 * sozinha — é o mesmo fluxo de `docs/arvore-diagnostico.md`.
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
