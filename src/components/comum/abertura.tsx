/**
 * A abertura de um número em suas partes, em colunas.
 *
 * Nasceu no card de filial da tela de produto, para mostrar o estoque de chão
 * por armazém, e foi extraída quando a tabela de cobertura precisou da mesma
 * leitura. Duplicá-la deixaria as duas telas parecidas hoje e diferentes no
 * primeiro ajuste de qualquer uma — e "igual ao card de produto" era o pedido.
 *
 * **Mostra todas as partes, inclusive as zeradas.** Omitir as vazias faria a
 * abertura mudar de forma a cada item, e um armazém sem estoque é informação:
 * saber que não há nada em Q40 é diferente de não saber quanto há.
 */

function numero(v: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

export function Abertura({
  itens,
  /** Classe de cor do valor, quando a tela separa números por natureza. */
  tom,
}: {
  itens: { rotulo: string; quantidade: number | null }[];
  tom?: string;
}) {
  if (itens.length === 0) return null;

  return (
    <dl className="mt-2 flex gap-x-1 border-t pt-2">
      {itens.map((i) => (
        <div key={i.rotulo} className="min-w-0 flex-1 text-center">
          <dt className="truncate text-[10px] leading-tight font-medium text-muted-foreground">
            {i.rotulo}
          </dt>
          <dd
            className={`truncate font-mono text-xs leading-tight font-medium tabular-nums ${
              tom ?? "text-foreground/80"
            }`}
          >
            {i.quantidade === null ? "—" : numero(i.quantidade)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
