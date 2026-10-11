import type { CausaNaLinha } from "@/lib/diagnostico-ruptura/consultas";
import type { Etapa } from "@/lib/diagnostico-ruptura/catalogo";

/**
 * A barra empilhada das causas de uma ruptura.
 *
 * Lê-se de uma vez: o comprimento é o peso, a cor é a etapa da cadeia, e o
 * texto embaixo nomeia as causas com o percentual. Sem o texto, a barra seria
 * bonita e ilegível — ninguém decora oito cores.
 *
 * **A cor é por etapa, não por causa.** Duas causas da mesma etapa dividem o
 * tom, e isso é intencional: a pergunta que a tela responde primeiro é "onde a
 * corrente quebrou", e só depois "qual regra exatamente".
 */

/** Um tom por etapa da cadeia, na paleta do sistema. */
const TOM: Record<Etapa, { barra: string; texto: string }> = {
  dados: { barra: "bg-slate-400", texto: "text-slate-600 dark:text-slate-300" },
  partida: {
    barra: "bg-(--brand-petrol)",
    texto: "text-(--brand-petrol) dark:text-(--brand-turquoise)",
  },
  demanda: { barra: "bg-amber-500", texto: "text-amber-700 dark:text-amber-400" },
  plano: { barra: "bg-violet-500", texto: "text-violet-700 dark:text-violet-400" },
  compra: { barra: "bg-rose-500", texto: "text-rose-700 dark:text-rose-400" },
  fornecedor: { barra: "bg-orange-500", texto: "text-orange-700 dark:text-orange-400" },
  movimentacao: { barra: "bg-sky-500", texto: "text-sky-700 dark:text-sky-400" },
};

export function tomDaEtapa(etapa: Etapa) {
  return TOM[etapa] ?? TOM.dados;
}

export function BarraCausas({ causas }: { causas: CausaNaLinha[] }) {
  // Só o que levou dias entra na barra. Observação — regra que falhou sem
  // causar nada — aparece no detalhe, não aqui: ela não ocupa dia nenhum, e
  // desenhá-la com largura zero só sujaria a leitura.
  const comDias = causas.filter((c) => c.papel === "causa" && c.dias > 0);
  if (comDias.length === 0) return null;

  const total = comDias.reduce((a, c) => a + c.percentual, 0);

  return (
    <div className="min-w-0">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {comDias.map((c) => (
          <div
            key={c.slug}
            className={tomDaEtapa(c.etapa).barra}
            style={{ width: `${(c.percentual / Math.max(total, 1)) * 100}%` }}
            title={`${c.rotulo} — ${Math.round(c.percentual)}% · ${c.dono}`}
          />
        ))}
      </div>
      <p className="mt-1 flex flex-wrap gap-x-1.5 gap-y-0.5 text-xs leading-tight">
        {comDias.map((c, i) => (
          <span key={c.slug} className={tomDaEtapa(c.etapa).texto}>
            {c.rotulo}
            {comDias.length > 1 ? (
              <span className="font-medium"> {Math.round(c.percentual)}%</span>
            ) : null}
            {i < comDias.length - 1 ? (
              <span className="text-muted-foreground/50"> +</span>
            ) : null}
          </span>
        ))}
      </p>
    </div>
  );
}
