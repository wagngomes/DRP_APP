"use client";

import { createContext, useContext, useMemo, useState, useTransition } from "react";
import { Check } from "lucide-react";

import { marcarTarefa } from "@/app/actions/tarefa-cockpit";
import type { TipoAcao } from "@/lib/riscos/acao";

/**
 * Estado do checklist no cliente.
 *
 * Marcar uma tarefa não pode custar uma volta ao servidor: a tela roda os
 * motores de risco sobre seis mil posições a cada renderização, e revalidar a
 * rota a cada clique faria o analista pagar mais de um segundo de banco por
 * item de uma fila de cem. A gravação acontece em segundo plano; o contador, a
 * barra de progresso e o "ocultar tratadas" reagem na hora, aqui.
 *
 * A fonte de verdade continua sendo o banco — recarregar a página lê de lá. Este
 * estado é só o eco imediato do clique.
 */

type Estado = {
  feitas: Set<string>;
  ocultando: boolean;
  alternarOcultar: () => void;
  alternar: (t: {
    chave: string;
    codigo: string;
    filial: string;
    acao: TipoAcao;
  }) => void;
  /** Quem tratou cada tarefa, para a linha mostrar o nome sem recarregar. */
  autores: Map<string, string>;
};

const Ctx = createContext<Estado | null>(null);

function usarChecklist(): Estado {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("Componente do checklist usado fora do ChecklistProvider");
  return ctx;
}

export type TarefaInicial = {
  chave: string;
  secao: string;
  feitoPor: string | null;
};

export function ChecklistProvider({
  tarefas,
  children,
}: {
  tarefas: TarefaInicial[];
  children: React.ReactNode;
}) {
  const [feitas, setFeitas] = useState(
    () => new Set(tarefas.filter((t) => t.feitoPor !== null).map((t) => t.chave))
  );
  const [autores, setAutores] = useState(
    () =>
      new Map(
        tarefas.filter((t) => t.feitoPor !== null).map((t) => [t.chave, t.feitoPor!])
      )
  );
  const [ocultando, setOcultando] = useState(false);
  const [, iniciar] = useTransition();

  const valor = useMemo<Estado>(
    () => ({
      feitas,
      autores,
      ocultando,
      alternarOcultar: () => setOcultando((o) => !o),
      alternar: ({ chave, codigo, filial, acao }) => {
        const alvo = !feitas.has(chave);

        setFeitas((atual) => {
          const proximo = new Set(atual);
          if (alvo) proximo.add(chave);
          else proximo.delete(chave);
          return proximo;
        });

        iniciar(async () => {
          const r = await marcarTarefa({ codigo, filial, acao, feito: alvo });
          if (r.ok) {
            setAutores((atual) => {
              const proximo = new Map(atual);
              if (alvo) proximo.set(chave, r.por);
              else proximo.delete(chave);
              return proximo;
            });
          } else {
            // Falhou: desfaz, senão a tela afirma um "feito" que não existe.
            setFeitas((atual) => {
              const proximo = new Set(atual);
              if (alvo) proximo.delete(chave);
              else proximo.add(chave);
              return proximo;
            });
          }
        });
      },
    }),
    [feitas, autores, ocultando]
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/** Uma linha da fila: caixa de marcar + o conteúdo renderizado no servidor. */
export function LinhaTarefa({
  chave,
  codigo,
  filial,
  acao,
  children,
}: {
  chave: string;
  codigo: string;
  filial: string;
  acao: TipoAcao;
  children: React.ReactNode;
}) {
  const { feitas, autores, ocultando, alternar } = usarChecklist();
  const feito = feitas.has(chave);
  const por = autores.get(chave);

  return (
    <div
      hidden={feito && ocultando}
      className={`flex gap-3 rounded-lg border bg-card p-3 transition-opacity ${
        feito ? "opacity-45" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => alternar({ chave, codigo, filial, acao })}
        aria-pressed={feito}
        aria-label={feito ? "Desmarcar tarefa" : "Marcar tarefa como feita"}
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--brand-turquoise) ${
          feito
            ? "border-(--brand-green) bg-(--brand-green) text-white"
            : "border-foreground/25 hover:border-(--brand-green)"
        }`}
      >
        {feito ? <Check className="size-3.5" strokeWidth={3} /> : null}
      </button>

      <div className="min-w-0 flex-1">
        <div className={feito ? "line-through decoration-foreground/30" : ""}>{children}</div>
        {feito && por ? (
          <p className="mt-1.5 text-xs text-(--brand-green)">{`Tratado por ${por}`}</p>
        ) : null}
      </div>
    </div>
  );
}

/** Quanto da fila do dia já foi tratado. */
export function Progresso({
  tarefas,
  totalPosicoes,
  secoes,
}: {
  tarefas: TarefaInicial[];
  totalPosicoes: number;
  secoes: { id: string; rotulo: string; cor: string }[];
}) {
  const { feitas, ocultando, alternarOcultar } = usarChecklist();

  const total = tarefas.length;
  const tratadas = tarefas.filter((t) => feitas.has(t.chave)).length;
  const pct = total > 0 ? Math.round((tratadas / total) * 100) : 0;

  const porSecao = secoes
    .map((s) => {
      const da = tarefas.filter((t) => t.secao === s.id);
      return { ...s, total: da.length, feitas: da.filter((t) => feitas.has(t.chave)).length };
    })
    .filter((s) => s.total > 0);

  return (
    <div className="grid gap-3 rounded-xl border bg-card p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm">
          <span className="font-mono text-2xl font-semibold tabular-nums">{tratadas}</span>
          <span className="text-muted-foreground">{` de ${total.toLocaleString("pt-BR")} ações tratadas`}</span>
        </p>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {`${totalPosicoes.toLocaleString("pt-BR")} posições avaliadas`}
          </span>
          <button
            type="button"
            onClick={alternarOcultar}
            className="text-sm font-medium text-(--brand-petrol) underline underline-offset-2 dark:text-(--brand-turquoise)"
          >
            {ocultando ? "Mostrar tratadas" : "Ocultar tratadas"}
          </button>
        </div>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-(--brand-green) transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {porSecao.map((s) => (
          <span key={s.id} className="flex items-center gap-1.5 text-sm">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: s.cor }}
              aria-hidden
            />
            {s.rotulo}
            <span className="font-mono tabular-nums text-muted-foreground">
              {`${s.feitas}/${s.total}`}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
