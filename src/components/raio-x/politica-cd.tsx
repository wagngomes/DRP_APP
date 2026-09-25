import type { PoliticaCd } from "@/lib/sop/consultas";
import { parseRotaCompra } from "@/utils/rota-compra";
import { num } from "./formato";

/** Política e rota de um CD, em uma linha só. */
export function PoliticaDoCd({
  politica: p,
  rotulos,
}: {
  politica: PoliticaCd;
  rotulos: Record<string, string>;
}) {
  const rotulo = (codigo: string) => rotulos[codigo] ?? codigo;
  const percurso = parseRotaCompra(p.rotaCompra);
  // Plano diferente da política é o que se quer notar; iguais, não há nada a
  // destacar e a cor só faria barulho.
  const divergente =
    p.politicaPlano !== null &&
    p.politica !== null &&
    p.politicaPlano !== p.politica;

  return (
    <div className="flex items-center gap-2.5 text-[11px]">
      {/* Largura mínima, não fixa: as siglas dos CDs virtuais ("CAJ·11") são
          mais longas que as normais e eram cortadas nas laterais. */}
      <span className="inline-flex min-w-14 shrink-0 justify-center rounded bg-(--brand-petrol) px-1.5 py-0.5 font-mono leading-none font-bold whitespace-nowrap text-white dark:bg-(--brand-turquoise) dark:text-(--brand-petrol)">
        {rotulo(p.filial)}
      </span>
      {/* A rota em siglas: "1036->1039->1006" não diz nada a quem lê,
          "DF2 › CTL2 › CAJ" diz o caminho. */}
      <span className="flex-1 truncate pr-2 font-mono text-muted-foreground">
        {percurso.length > 0 ? percurso.map(rotulo).join(" › ") : "sem rota"}
      </span>
      <span className="shrink-0 font-mono tabular-nums">
        {p.politica === null ? "—" : num(p.politica)}
        <span className="text-muted-foreground"> / </span>
        <span
          className={
            divergente ? "font-semibold text-amber-700 dark:text-amber-400" : ""
          }
        >
          {p.politicaPlano === null ? "—" : num(p.politicaPlano)}
        </span>
      </span>
    </div>
  );
}
