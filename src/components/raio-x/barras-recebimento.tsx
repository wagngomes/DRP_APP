import type { RecebimentoDia } from "@/lib/sop/consultas";

/**
 * Entrada e saída do produto, dia a dia do mês.
 *
 * Quantidade do dia, não acumulada — a curva logo acima já responde "como o mês
 * foi indo"; esta responde "o que aconteceu naquele dia". Entradas para cima em
 * violeta, vendas para baixo em verde, com o zero no meio: a leitura de estar
 * repondo no ritmo, ou de ter recebido tudo depois de a venda já ter acontecido,
 * salta sem precisar de número nenhum.
 *
 * O eixo traz **todos** os dias, inclusive os sem movimento. Um eixo que pulasse
 * de 13 para 27 mostraria duas barras lado a lado e esconderia o que mais
 * importa: as duas semanas em que nada entrou. O vão é a informação.
 *
 * SVG na mão, como as outras curvas desta base: são retângulos e uma linha de
 * base, e uma biblioteca de gráfico pesaria mais que o desenho inteiro. Sem
 * `"use client"` — o `<title>` dá a dica ao passar o mouse sem nenhum script.
 */

const ALTURA = 230;
const LARGURA = 720;
const MARGEM = { topo: 14, direita: 12, baixo: 24, esquerda: 56 };

function num(v: number): string {
  return Math.round(v).toLocaleString("pt-BR");
}

export function BarrasRecebimento({ dias }: { dias: RecebimentoDia[] }) {
  const maxEntrada = Math.max(...dias.map((d) => d.quantidade), 0);
  const maxSaida = Math.max(...dias.map((d) => d.vendido), 0);

  if (maxEntrada <= 0 && maxSaida <= 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nenhum movimento deste produto no mês.
      </p>
    );
  }

  const util = {
    largura: LARGURA - MARGEM.esquerda - MARGEM.direita,
    altura: ALTURA - MARGEM.topo - MARGEM.baixo,
  };

  // Escalas independentes para cima e para baixo.
  //
  // Uma escala só faria o lado menor sumir: neste item as entradas chegam a
  // 5.257 num dia e a venda diária raramente passa de 700 — as barras verdes
  // virariam riscos de um pixel. O preço é que as alturas dos dois lados não se
  // comparam entre si, e por isso cada lado tem o seu eixo rotulado.
  const alturaCima = maxSaida > 0 ? util.altura * 0.6 : util.altura;
  const alturaBaixo = util.altura - alturaCima;
  const zero = MARGEM.topo + alturaCima;

  const yCima = (v: number) => (maxEntrada > 0 ? zero - (v / maxEntrada) * alturaCima : zero);
  const alturaSaida = (v: number) => (maxSaida > 0 ? (v / maxSaida) * alturaBaixo : 0);

  const passo = util.largura / dias.length;
  // Folga de um ponto entre barras: encostadas, 31 delas viram um bloco só.
  const larguraBarra = Math.max(2, passo - 3);

  const comEntrada = dias.filter((d) => d.quantidade > 0).length;
  const comVenda = dias.filter((d) => d.vendido > 0).length;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} className="h-[230px] w-full min-w-[520px]">
          {/* Topo de cada escala, para as duas alturas serem interpretáveis. */}
          {maxEntrada > 0 ? (
            <text
              x={MARGEM.esquerda - 8}
              y={yCima(maxEntrada) + 4}
              textAnchor="end"
              className="fill-muted-foreground text-[10px]"
            >
              {num(maxEntrada)}
            </text>
          ) : null}
          {maxSaida > 0 ? (
            <text
              x={MARGEM.esquerda - 8}
              y={zero + alturaBaixo}
              textAnchor="end"
              className="fill-muted-foreground text-[10px]"
            >
              {`-${num(maxSaida)}`}
            </text>
          ) : null}

          {/* A linha do zero é a referência que dá sentido aos dois lados. */}
          <line
            x1={MARGEM.esquerda}
            x2={LARGURA - MARGEM.direita}
            y1={zero}
            y2={zero}
            stroke="currentColor"
            className="text-muted-foreground"
            strokeWidth={1}
          />

          {dias.map((d, i) => {
            const x = MARGEM.esquerda + i * passo + (passo - larguraBarra) / 2;
            const parado = d.quantidade <= 0 && d.vendido <= 0;
            return (
              <g key={d.dia}>
                {d.quantidade > 0 ? (
                  <rect
                    x={x}
                    y={yCima(d.quantidade)}
                    width={larguraBarra}
                    height={Math.max(1, zero - yCima(d.quantidade))}
                    rx={2}
                    className="fill-violet-500"
                  >
                    <title>{`Dia ${d.dia}: +${num(d.quantidade)} un em ${d.notas} nota(s)`}</title>
                  </rect>
                ) : null}

                {d.vendido > 0 ? (
                  <rect
                    x={x}
                    y={zero}
                    width={larguraBarra}
                    height={Math.max(1, alturaSaida(d.vendido))}
                    rx={2}
                    className="fill-emerald-500"
                  >
                    <title>{`Dia ${d.dia}: −${num(d.vendido)} un vendidas`}</title>
                  </rect>
                ) : null}

                {/* Dia sem nada ganha um traço no zero em vez do vazio: mostra
                    que o dia existe e não teve movimento, que é diferente de o
                    dia não estar no gráfico. */}
                {parado ? (
                  <rect x={x} y={zero - 1} width={larguraBarra} height={1} className="fill-border">
                    <title>{`Dia ${d.dia}: sem movimento`}</title>
                  </rect>
                ) : null}
              </g>
            );
          })}

          {/* Só os múltiplos de 5 recebem rótulo: 31 números não cabem. */}
          {dias
            .filter((d) => d.dia === 1 || d.dia % 5 === 0)
            .map((d) => (
              <text
                key={d.dia}
                x={MARGEM.esquerda + (d.dia - 1) * passo + passo / 2}
                y={ALTURA - 8}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {d.dia}
              </text>
            ))}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px] bg-violet-500" />
          {`Entradas · ${num(dias.reduce((a, d) => a + d.quantidade, 0))} un em ${comEntrada} dia(s)`}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px] bg-emerald-500" />
          {`Vendas · ${num(dias.reduce((a, d) => a + d.vendido, 0))} un em ${comVenda} dia(s)`}
        </span>
        {/* As escalas são independentes, e dizer isso evita a leitura errada de
            comparar a altura de um lado com a do outro. */}
        <span className="ml-auto">escalas independentes por lado</span>
      </div>
    </div>
  );
}
