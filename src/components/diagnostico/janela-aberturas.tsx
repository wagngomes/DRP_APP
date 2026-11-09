"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, MoveRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * As duas datas que delimitam a janela de novas aberturas.
 *
 * **Compara cargas, não dias.** O usuário escolhe uma data qualquer e o
 * servidor cai na carga de forecast mais recente até ela — por isso a tela
 * mostra, embaixo de cada campo, qual carga foi de fato usada. Sem esse aviso,
 * quem escolhesse um sábado veria o resultado da sexta sem entender por quê.
 *
 * `min` e `max` vêm das cargas existentes: escolher uma data fora do intervalo
 * só produziria uma lista vazia, e é melhor o calendário não deixar.
 */
export function JanelaAberturas({
  de,
  ate,
  cargaDe,
  cargaAte,
  primeira,
  ultima,
}: {
  /** O que está na URL, ou a carga escolhida como padrão. */
  de: string;
  ate: string;
  /** A carga em que cada data caiu, para a tela poder dizer. */
  cargaDe: string | null;
  cargaAte: string | null;
  primeira: string;
  ultima: string;
}) {
  const router = useRouter();
  const parametros = useSearchParams();
  const [inicio, setInicio] = useState(de);
  const [fim, setFim] = useState(ate);

  const alterado = inicio !== de || fim !== ate;
  const invertido = Boolean(inicio && fim && inicio >= fim);

  function aplicar() {
    const p = new URLSearchParams(parametros.toString());
    p.set("de", inicio);
    p.set("ate", fim);
    // Volta para a primeira página: a janela nova tem outra contagem, e manter
    // a página 7 de uma lista que agora tem três linhas mostra o vazio.
    p.delete("pgAb");
    router.push(`/diagnostico-ruptura?${p.toString()}#novas-aberturas`, {
      scroll: false,
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Campo
        id="aberturas-de"
        rotulo="Carga inicial"
        valor={inicio}
        aoMudar={setInicio}
        min={primeira}
        max={ultima}
        caiuEm={cargaDe}
      />
      <MoveRight className="mb-2.5 size-4 shrink-0 text-muted-foreground" />
      <Campo
        id="aberturas-ate"
        rotulo="Carga final"
        valor={fim}
        aoMudar={setFim}
        min={primeira}
        max={ultima}
        caiuEm={cargaAte}
      />
      <Button
        onClick={aplicar}
        disabled={!alterado || invertido}
        className="bg-(--brand-turquoise) text-(--brand-petrol) hover:bg-(--brand-turquoise)/90"
      >
        Comparar
      </Button>
      {invertido ? (
        <p className="mb-2 text-xs text-rose-600 dark:text-rose-400">
          A carga inicial precisa ser anterior à final.
        </p>
      ) : null}
    </div>
  );
}

function Campo({
  id,
  rotulo,
  valor,
  aoMudar,
  min,
  max,
  caiuEm,
}: {
  id: string;
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  min: string;
  max: string;
  caiuEm: string | null;
}) {
  // Só avisa quando a data escolhida não é uma carga: no caso normal o aviso
  // seria ruído repetindo o que o campo já mostra.
  const divergente = caiuEm !== null && caiuEm !== valor;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {rotulo}
      </Label>
      <div className="relative">
        <CalendarDays className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          type="date"
          value={valor}
          min={min}
          max={max}
          onChange={(e) => aoMudar(e.target.value)}
          className="w-44 pl-8"
        />
      </div>
      <p className="h-4 text-[11px] text-muted-foreground">
        {divergente ? `carga usada: ${dataBr(caiuEm)}` : ""}
      </p>
    </div>
  );
}

function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
