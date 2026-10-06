import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarCheck,
  Minus,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { faixaAcuracidade } from "@/utils/acuracidade";
import type { Medida, MesAnterior } from "@/lib/sop/consultas";
import { num, pct, TOM_FAIXA } from "./formato";

/**
 * Cartão de número grande e cartão de acuracidade.
 *
 * Juntos porque são o mesmo gesto — um número que se lê de longe, com apoio
 * pequeno embaixo — e separá-los daria dois arquivos de trinta linhas.
 */
export const TOM_KPI = {
  petrol: {
    borda:
      "border-t-4 border-t-(--brand-petrol) dark:border-t-(--brand-turquoise)",
    disco:
      "bg-(--brand-petrol)/10 text-(--brand-petrol) dark:bg-(--brand-turquoise)/15 dark:text-(--brand-turquoise)",
    brilho: "bg-(--brand-petrol)/10 dark:bg-(--brand-turquoise)/10",
  },
  turquesa: {
    borda: "border-t-4 border-t-(--brand-turquoise)",
    disco:
      "bg-(--brand-turquoise)/20 text-teal-700 dark:text-(--brand-turquoise)",
    brilho: "bg-(--brand-turquoise)/20",
  },
  ambar: {
    borda: "border-t-4 border-t-amber-500",
    disco: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    brilho: "bg-amber-500/15",
  },
  violeta: {
    borda: "border-t-4 border-t-violet-500",
    disco: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
    brilho: "bg-violet-500/15",
  },
} as const;

export function Kpi({
  icone: Icone,
  rotulo,
  valor,
  apoio,
  tom = "petrol",
}: {
  icone: LucideIcon;
  rotulo: string;
  valor: string;
  apoio: string;
  tom?: keyof typeof TOM_KPI;
}) {
  const t = TOM_KPI[tom];
  return (
    <Card className={`relative overflow-hidden ${t.borda}`}>
      <div
        aria-hidden
        className={`pointer-events-none absolute -top-16 -right-16 size-40 rounded-full blur-2xl ${t.brilho}`}
      />
      <CardContent className="relative pt-6">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {rotulo}
          </p>
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-xl ${t.disco}`}
          >
            <Icone className="size-4.5" />
          </span>
        </div>
        <p className="mt-2 font-mono text-4xl font-semibold tracking-tight text-(--brand-petrol) tabular-nums dark:text-foreground">
          {valor}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{apoio}</p>
      </CardContent>
    </Card>
  );
}

/**
 * Como cada status do mês fechado se apresenta.
 *
 * Fora do componente para a tabela ser lida de uma vez: é mais fácil discutir
 * "acelerada é âmbar com seta para cima" olhando quatro linhas juntas do que
 * caçando ternários no meio do JSX.
 */
const TOM_STATUS = {
  acelerada: {
    rotulo: "Acelerada",
    icone: TrendingUp,
    borda: "border-t-amber-500",
    disco: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    brilho: "bg-amber-500/20",
    numero: "text-amber-700 dark:text-amber-400",
    selo: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  no_ritmo: {
    rotulo: "No ritmo",
    icone: Minus,
    borda: "border-t-emerald-500",
    disco: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    brilho: "bg-emerald-500/20",
    numero: "text-emerald-700 dark:text-emerald-400",
    selo: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  atrasada: {
    rotulo: "Abaixo",
    icone: TrendingDown,
    borda: "border-t-sky-500",
    disco: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
    brilho: "bg-sky-500/20",
    numero: "text-sky-700 dark:text-sky-400",
    selo: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  },
} as const;

/**
 * Acima disto a aceleração deixa de ser desvio e vira aviso.
 *
 * Dobrar o previsto não é "vendeu um pouco mais": ou a previsão estava muito
 * errada, ou aconteceu algo que ninguém planejou — e nos dois casos quem abre a
 * tela precisa reparar antes de ler o resto.
 */
const LIMITE_ATENCAO = 2;

/**
 * O mês anterior, já fechado, com o status de quem vendeu bem ou mal.
 *
 * Fica na linha da abertura porque é a outra metade da mesma pergunta: como o
 * mês anterior terminou e com o que este começou. No dia 1º é a única coisa
 * dessa linha que já tem história para contar.
 */
export function Fechamento({
  mes,
  dados,
}: {
  /** Rótulo já formatado, ex. "setembro de 2026". */
  mes: string;
  dados: MesAnterior;
}) {
  const t = dados.status ? TOM_STATUS[dados.status] : null;
  const Icone = t?.icone ?? CalendarCheck;
  const alerta =
    dados.status === "acelerada" &&
    dados.indice !== null &&
    dados.indice >= LIMITE_ATENCAO;

  return (
    <Card
      className={`relative overflow-hidden border-t-4 ${t?.borda ?? "border-t-slate-400"}`}
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute -top-16 -right-16 size-40 rounded-full blur-2xl ${t?.brilho ?? "bg-slate-400/10"}`}
      />
      <CardContent className="relative pt-6">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Mês anterior
          </p>
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-xl ${
              t?.disco ?? "bg-muted text-muted-foreground"
            }`}
          >
            <Icone className="size-4.5" />
          </span>
        </div>

        <p
          className={`mt-2 font-mono text-4xl font-semibold tracking-tight tabular-nums ${
            t?.numero ?? "text-(--brand-petrol) dark:text-foreground"
          }`}
        >
          {num(dados.vendido)}
        </p>

        {/* Sem previsão, a venda ainda vale — o que não existe é o julgamento.
            Mostrar "no ritmo" sem ter contra o que comparar seria inventar. */}
        {t ? (
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${t.selo}`}
            >
              <Icone className="size-3" />
              {t.rotulo}
            </span>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {pct(dados.indice, 0)}
            </span>
            {alerta ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-1.5 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-400">
                <TriangleAlert className="size-3" />
                Atenção
              </span>
            ) : null}
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-muted-foreground">
            sem forecast para comparar
          </p>
        )}

        <p className="mt-1 text-xs text-muted-foreground">
          {dados.forecast === null
            ? `fechamento de ${mes}`
            : `${mes} · previsto ${num(dados.forecast)}`}
        </p>
      </CardContent>
    </Card>
  );
}

export function Acerto({
  rotulo,
  medida,
  ausente,
}: {
  rotulo: string;
  medida: Medida;
  /** Texto a exibir quando não há previsão — diferente de previsão errada. */
  ausente?: string;
}) {
  if (ausente) {
    return (
      <div className="rounded-lg border border-dashed p-3">
        <p className="text-xs text-muted-foreground">{rotulo}</p>
        <p className="mt-1 font-mono text-2xl font-semibold text-muted-foreground tabular-nums">
          —
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{ausente}</p>
      </div>
    );
  }
  // A cor continua vindo da acuracidade, que mede o tamanho do erro. O número
  // exibido é o atingimento, que diz para que lado ele foi: 130% e 70% têm a
  // mesma acuracidade e significados opostos, e é o lado que decide o que fazer.
  const faixa = faixaAcuracidade(medida.acuracidade);
  const acima = medida.atingimento !== null && medida.atingimento > 1;

  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p
        className={`mt-1 inline-flex rounded-md px-2 py-0.5 font-mono text-2xl font-semibold tabular-nums ${TOM_FAIXA[faixa]}`}
      >
        {pct(medida.atingimento, 0)}
      </p>
      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        {medida.atingimento === null ? (
          "sem previsão para comparar"
        ) : (
          <>
            {acima ? (
              <ArrowUpRight className="size-3 text-amber-600" />
            ) : (
              <ArrowDownRight className="size-3 text-sky-600" />
            )}
            {`vendeu ${acima ? "acima" : "abaixo"} · ${num(medida.realizado)} de ${num(medida.previsto)}`}
          </>
        )}
      </p>
    </div>
  );
}
