import { faixaDe, faixaPorId } from "@/utils/dias-estoque";

/**
 * Badge de cobertura, nas mesmas faixas e cores do gráfico de Disponibilidade —
 * assim o vermelho significa a mesma coisa nas duas telas.
 *
 * O texto traz sempre o número de dias e a faixa fica no `title`, então a
 * leitura nunca depende só da cor.
 */
export function BadgeDias({ dias, rotulo }: { dias: number | null; rotulo: string }) {
  if (dias === null) {
    return (
      <span className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm text-muted-foreground">
        {rotulo}: sem forecast
      </span>
    );
  }

  const faixa = faixaDe(dias);
  const info = faixa ? faixaPorId(faixa) : undefined;

  return (
    <span
      className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5"
      title={info ? `${rotulo} — ${info.rotulo}` : rotulo}
    >
      <span
        className="size-3 shrink-0 rounded-[2px]"
        style={{ background: `var(--faixa-${faixa})` }}
      />
      <span className="text-sm text-muted-foreground">{rotulo}:</span>
      <span className="font-mono text-lg font-semibold tabular-nums">
        {dias.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
      </span>
      <span className="text-sm text-muted-foreground">dias</span>
    </span>
  );
}
