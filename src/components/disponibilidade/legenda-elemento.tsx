import { FAIXAS } from "@/utils/dias-estoque";

/**
 * O que cada número do elemento quer dizer.
 *
 * A primeira versão punha um quadrado cinza com as palavras "total", "chão",
 * "qtd" e "%" dentro, e a explicação numa lista ao lado — o leitor tinha de
 * casar quatro posições com quatro linhas de texto, de cabeça.
 *
 * Aqui o exemplo é um elemento de verdade, com números reais e a cor de uma
 * faixa, e cada número é apontado por uma legenda numerada. Casar "①" com "①"
 * não exige esforço nenhum.
 */

const PARTES = [
  { n: "1", onde: "centro", oque: "dias de cobertura do estoque chão" },
  { n: "2", onde: "topo", oque: "dias contando o que está a caminho" },
  { n: "3", onde: "abaixo", oque: "unidades em chão" },
  { n: "4", onde: "rodapé", oque: "forecast do mês | quanto dele já saiu" },
] as const;

function Marca({ n }: { n: string }) {
  return (
    <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-foreground/80 text-[10px] font-bold text-background">
      {n}
    </span>
  );
}

export function LegendaElemento() {
  return (
    <div className="grid gap-4 rounded-lg border bg-muted/20 p-3 lg:grid-cols-[auto_1fr_auto] lg:gap-6">
      {/* O exemplo usa a cor de "adequado" e números plausíveis: um elemento
          cinza com palavras dentro não se parece com o que está na grade. */}
      <div className="flex items-center gap-3">
        <div
          className="flex size-20 shrink-0 flex-col justify-between rounded-md p-1.5"
          style={{
            backgroundColor: "var(--faixa-adequado)",
            color: "var(--faixa-adequado-ink)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -2px 3px rgba(0,0,0,0.18), 0 1px 2px rgba(0,0,0,0.18)",
          }}
        >
          <span className="text-right font-mono text-[11px] leading-none font-bold opacity-90">
            42
          </span>
          <span className="text-center font-mono text-2xl leading-none font-bold">
            23
          </span>
          <span className="text-center font-mono text-[10px] leading-none opacity-90">
            29k
          </span>
          <span className="text-center font-mono text-[10px] leading-none opacity-75">
            1,2k<span className="mx-0.5 opacity-50">|</span>34%
          </span>
        </div>

        {/* As marcas ficam fora do elemento, alinhadas à altura de cada número:
            dentro, elas competiriam com o que estão explicando. */}
        <div className="flex h-20 flex-col justify-between py-0.5 text-muted-foreground">
          <Marca n="2" />
          <Marca n="1" />
          <Marca n="3" />
          <Marca n="4" />
        </div>
      </div>

      <dl className="grid content-center gap-1 text-xs">
        {PARTES.map((p) => (
          <div key={p.n} className="flex items-center gap-2">
            <Marca n={p.n} />
            <dt className="w-14 shrink-0 text-muted-foreground">{p.onde}</dt>
            <dd>{p.oque}</dd>
          </div>
        ))}
      </dl>

      <div className="border-t pt-3 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
        <p className="mb-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          Cor · cobertura do chão
        </p>
        <div className="grid gap-1 text-xs sm:grid-cols-2 lg:grid-cols-1">
          {FAIXAS.map((f) => (
            <span key={f.id} className="flex items-center gap-1.5">
              <span
                className="size-3 shrink-0 rounded-sm"
                style={{ backgroundColor: `var(--faixa-${f.id})` }}
              />
              {f.rotulo}
            </span>
          ))}
          {/* A célula neutra não pertence à escala, e por isso vem depois de
              todas, separada: é estoque que existe sem previsão para dividir,
              então a cobertura não é alta nem baixa — é incalculável. Sem esta
              linha, o tracejado na grade viraria adivinhação. */}
          <span className="flex items-center gap-1.5">
            <span
              className="size-3 shrink-0 rounded-sm bg-muted"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(135deg, transparent 0 3px, rgba(0,0,0,0.12) 3px 4px)",
              }}
            />
            Sem previsão no mês
          </span>
        </div>
      </div>
    </div>
  );
}
