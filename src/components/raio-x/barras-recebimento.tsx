import type { RecebimentoDia } from "@/lib/sop/consultas";

/**
 * Entradas do produto, dia a dia do mês.
 *
 * O eixo traz **todos** os dias, inclusive os sem recebimento. Um eixo que
 * pulasse de 13 para 27 mostraria duas barras lado a lado e esconderia o que
 * mais importa: as duas semanas em que nada entrou. O vão é a informação.
 *
 * SVG na mão, como as outras curvas desta base: são retângulos e uma linha de
 * base, e uma biblioteca de gráfico pesaria mais que o desenho inteiro. Sem
 * `"use client"` — o `<title>` dá a dica ao passar o mouse sem nenhum script.
 */

const ALTURA = 200;
const LARGURA = 720;
const MARGEM = { topo: 14, direita: 12, baixo: 24, esquerda: 52 };

function num(v: number): string {
  return Math.round(v).toLocaleString("pt-BR");
}

export function BarrasRecebimento({ dias }: { dias: RecebimentoDia[] }) {
  const maximo = Math.max(...dias.map((d) => d.quantidade), 0);

  if (maximo <= 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nenhuma entrada deste produto no mês.
      </p>
    );
  }

  const util = {
    largura: LARGURA - MARGEM.esquerda - MARGEM.direita,
    altura: ALTURA - MARGEM.topo - MARGEM.baixo,
  };
  const passo = util.largura / dias.length;
  // Folga de um ponto entre barras: encostadas, 31 delas viram um bloco só.
  const larguraBarra = Math.max(2, passo - 3);
  const y = (v: number) => MARGEM.topo + util.altura * (1 - v / maximo);

  const marcas = [0, 0.5, 1].map((f) => f * maximo);
  const comEntrada = dias.filter((d) => d.quantidade > 0);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} className="h-[200px] w-full min-w-[520px]">
          {marcas.map((v, i) => (
            <g key={i}>
              <line
                x1={MARGEM.esquerda}
                x2={LARGURA - MARGEM.direita}
                y1={y(v)}
                y2={y(v)}
                stroke="currentColor"
                className="text-border"
                strokeWidth={1}
                strokeDasharray="2 4"
              />
              <text
                x={MARGEM.esquerda - 8}
                y={y(v) + 4}
                textAnchor="end"
                className="fill-muted-foreground text-[10px]"
              >
                {num(v)}
              </text>
            </g>
          ))}

          {dias.map((d, i) => {
            const x = MARGEM.esquerda + i * passo + (passo - larguraBarra) / 2;
            const vazio = d.quantidade <= 0;
            return (
              <g key={d.dia}>
                {/* Dia sem entrada ganha um traço rente à base em vez de nada:
                    mostra que o dia existe e não teve movimento, que é
                    diferente de o dia não estar no gráfico. */}
                <rect
                  x={x}
                  y={vazio ? y(0) - 1 : y(d.quantidade)}
                  width={larguraBarra}
                  height={vazio ? 1 : Math.max(1, y(0) - y(d.quantidade))}
                  rx={vazio ? 0 : 2}
                  className={vazio ? "fill-border" : "fill-violet-500"}
                >
                  <title>
                    {vazio
                      ? `Dia ${d.dia}: sem entrada`
                      : `Dia ${d.dia}: ${num(d.quantidade)} un em ${d.notas} nota(s)`}
                  </title>
                </rect>
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

      <p className="text-xs text-muted-foreground">
        {`${comEntrada.length} dia(s) com entrada em ${dias.length} · ` +
          `${num(dias.reduce((a, d) => a + d.quantidade, 0))} un em ` +
          `${dias.reduce((a, d) => a + d.notas, 0)} nota(s)`}
      </p>
    </div>
  );
}
