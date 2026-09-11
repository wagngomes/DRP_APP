"use client";

import { useState, useTransition } from "react";
import { Check, ShieldCheck, TriangleAlert, User } from "lucide-react";

import { trocarPapel } from "@/app/actions/usuarios";
import { ROTULO_PAPEL, type Papel } from "@/utils/papeis";

const ICONE: Record<Papel, typeof User> = {
  admin: ShieldCheck,
  user: User,
};

/**
 * Troca o papel de uma conta, com os dois estados que importam: o que está
 * valendo agora e o que o servidor recusou.
 *
 * A recusa aparece na própria linha, e não como alerta global: quem clicou
 * precisa ver a explicação ao lado da pessoa que tentou alterar — em especial
 * na recusa de rebaixar o último administrador, que parece um erro do sistema
 * até se ler o motivo.
 */
export function SeletorPapel({
  id,
  papel,
  ehVoce,
}: {
  id: string;
  papel: Papel;
  /** Marca a própria conta: não dá para se rebaixar. */
  ehVoce: boolean;
}) {
  const [atual, setAtual] = useState<Papel>(papel);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function escolher(novo: Papel) {
    if (novo === atual || pendente) return;
    const anterior = atual;
    setAtual(novo);
    setErro(null);

    iniciar(async () => {
      const r = await trocarPapel({ id, papel: novo });
      if (!r.ok) {
        setAtual(anterior);
        setErro(r.erro);
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div
        className={`inline-flex rounded-lg bg-muted p-0.5 ${pendente ? "opacity-60" : ""}`}
        role="group"
        aria-label="Papel da conta"
      >
        {(["admin", "user"] as Papel[]).map((p) => {
          const Icone = ICONE[p];
          const ativo = atual === p;
          const bloqueado = ehVoce && p === "user";

          return (
            <button
              key={p}
              type="button"
              onClick={() => escolher(p)}
              disabled={bloqueado || pendente}
              title={
                bloqueado ? "Você não pode remover o próprio acesso de administrador" : undefined
              }
              aria-pressed={ativo}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                ativo
                  ? "bg-(--brand-petrol) text-white shadow-sm dark:bg-(--brand-turquoise) dark:text-(--brand-petrol)"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {ativo ? <Check className="size-3.5" strokeWidth={3} /> : <Icone className="size-3.5" />}
              {ROTULO_PAPEL[p]}
            </button>
          );
        })}
      </div>

      {erro ? (
        <p className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 size-3 shrink-0" />
          {erro}
        </p>
      ) : null}
    </div>
  );
}
