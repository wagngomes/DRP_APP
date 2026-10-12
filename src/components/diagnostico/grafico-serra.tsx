"use client";

import { useState } from "react";

import type { SerieItem } from "@/lib/diagnostico-ruptura/serie";

/**
 * O dente de serra: estoque caindo pelo consumo, subindo a cada entrada.
 *
 * O desenho que os livros de MRP usam para explicar reposição, aplicado a um
 * item × CD de verdade — com as faixas em que a prateleira ficou vazia, a linha
 * da política, as entradas de compra e de transferência, e a venda realizada
 * contra a prevista.
 *
 * SVG à mão, sem biblioteca de gráficos. É a convenção do projeto (o gráfico de
 * faixas da Disponibilidade também é), e aqui vale mais que o de costume: as
 * faixas de ruptura e os marcadores de entrada não são features de uma
 * biblioteca genérica, seriam contorno nela.
 *
 * **Buraco de carga é desenhado como buraco.** O simulador não é importado
 * todo dia — em agosto há sequências de dez dias sem carga —, e ligar os
 * pontos com uma reta cheia afirmaria um consumo linear que ninguém observou.
 * O trecho sem dado sai tracejado e mais claro: a leitura continua, a certeza
 * não.
 */

/** Geometria, em unidades do viewBox. */
const L = 56; // margem esquerda, para os rótulos do eixo Y
const R = 12;
const TOPO = 14;
const ALTURA_AREA = 190;
const LARGURA = 1000;
const BASE = TOPO + ALTURA_AREA;
const LINHA_ENTRADAS = BASE + 34;
const LINHA_PEDIDOS = BASE + 62;
const ALTURA = LINHA_PEDIDOS + 26;

const curto = (v: number) =>
  Math.abs(v) >= 1000
    ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`
    : v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const MES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];
const mesBr = (iso: string) => `${MES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;

type Dica = { i: number; x: number; y: number };

export function GraficoSerra({
  serie,
  /** Dia em que a ruptura diagnosticada começou, para a marca de referência. */
  inicioDaRuptura,
}: {
  serie: SerieItem;
  inicioDaRuptura?: string;
}) {
  const [dica, setDica] = useState<Dica | null>(null);

  const pontos = serie.pontos;
  if (pontos.length < 2) return null;

  const comCarga = pontos.filter((p) => p.estoque !== null);
  const maiorEstoque = Math.max(0, ...comCarga.map((p) => p.estoque ?? 0));
  // A política entra no teto para a linha tracejada não sair do quadro quando
  // o estoque ficou muito abaixo dela — que é justamente o caso interessante.
  const teto = Math.max(maiorEstoque, serie.politicaUnidades, 1) * 1.12;

  const x = (i: number) =>
    L + (i / (pontos.length - 1)) * (LARGURA - L - R);
  const y = (v: number) => BASE - (v / teto) * ALTURA_AREA;
  const indiceDe = (data: string) => pontos.findIndex((p) => p.data === data);

  // Trechos contínuos de dias com carga. Cada um vira uma linha cheia; o vão
  // entre dois vira o tracejado.
  const trechos: { i: number; v: number }[][] = [];
  let atual: { i: number; v: number }[] = [];
  pontos.forEach((p, i) => {
    if (p.estoque === null) {
      if (atual.length > 0) trechos.push(atual);
      atual = [];
    } else {
      atual.push({ i, v: p.estoque });
    }
  });
  if (atual.length > 0) trechos.push(atual);

  // Faixas de ruptura: dias com carga e estoque zerado, agrupados em blocos.
  const faixas: { de: number; ate: number }[] = [];
  pontos.forEach((p, i) => {
    if (p.estoque !== 0) return;
    const ultima = faixas.at(-1);
    if (ultima && i <= ultima.ate + 1) ultima.ate = i;
    else faixas.push({ de: i, ate: i });
  });

  const linha = (t: { i: number; v: number }[]) =>
    t.map((p, k) => `${k === 0 ? "M" : "L"} ${x(p.i)} ${y(p.v)}`).join(" ");

  // Eixo X: uma marca por semana, para não virar um borrão de sessenta datas.
  const marcasX = pontos
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i % 7 === 0 || i === pontos.length - 1);

  const iInicio = inicioDaRuptura ? indiceDe(inicioDaRuptura) : -1;
  const p = dica ? pontos[dica.i] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        className="w-full"
        role="img"
        aria-label="Estoque dia a dia, entradas e períodos sem estoque"
        onMouseLeave={() => setDica(null)}
      >
        {/* Grade e eixo Y */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              x1={L}
              x2={LARGURA - R}
              y1={y(teto * f)}
              y2={y(teto * f)}
              className="stroke-border"
              strokeWidth={1}
            />
            <text
              x={L - 8}
              y={y(teto * f) + 4}
              textAnchor="end"
              className="fill-muted-foreground text-[11px] tabular-nums"
            >
              {curto(teto * f)}
            </text>
          </g>
        ))}

        {/* Faixas sem estoque. Desenhadas antes da curva para ficarem por baixo. */}
        {faixas.map((f) => (
          <g key={`r${f.de}`}>
            <rect
              x={x(f.de)}
              y={TOPO}
              width={Math.max(x(f.ate) - x(f.de), 3)}
              height={ALTURA_AREA}
              className="fill-rose-500/10"
            />
            <text
              x={(x(f.de) + x(f.ate)) / 2}
              y={TOPO + 12}
              textAnchor="middle"
              className="fill-rose-600 text-[11px] font-medium dark:fill-rose-400"
            >
              {`${f.ate - f.de + 1}d sem estoque`}
            </text>
          </g>
        ))}

        {/* Estoque mínimo pela política */}
        {serie.politicaUnidades > 0 ? (
          <g>
            <line
              x1={L}
              x2={LARGURA - R}
              y1={y(serie.politicaUnidades)}
              y2={y(serie.politicaUnidades)}
              className="stroke-muted-foreground"
              strokeWidth={1}
              strokeDasharray="5 4"
            />
            <text
              x={L + 6}
              y={y(serie.politicaUnidades) - 5}
              className="fill-muted-foreground text-[11px]"
            >
              {`política ${curto(serie.politicaDias)} dias · ${curto(serie.politicaUnidades)} un.`}
            </text>
          </g>
        ) : null}

        {/* O vão entre trechos: tracejado, porque não houve carga para afirmar
            o caminho. */}
        {trechos.slice(0, -1).map((t, k) => {
          const fim = t.at(-1)!;
          const inicio = trechos[k + 1][0];
          return (
            <line
              key={`v${k}`}
              x1={x(fim.i)}
              y1={y(fim.v)}
              x2={x(inicio.i)}
              y2={y(inicio.v)}
              className="stroke-(--brand-green)/40"
              strokeWidth={2}
              strokeDasharray="4 4"
            />
          );
        })}

        {/* A curva, trecho a trecho, com a área sombreada sob ela. */}
        {trechos.map((t, k) => (
          <g key={`t${k}`}>
            {t.length > 1 ? (
              <path
                d={`${linha(t)} L ${x(t.at(-1)!.i)} ${BASE} L ${x(t[0].i)} ${BASE} Z`}
                className="fill-(--brand-green)/10"
              />
            ) : null}
            <path
              d={linha(t)}
              fill="none"
              className="stroke-(--brand-green)"
              strokeWidth={2}
              strokeLinejoin="round"
            />
          </g>
        ))}

        {/* Os pontos medidos. Sem eles, um dia isolado entre dois buracos
            desaparece: uma linha de um ponto só não desenha nada. */}
        {comCarga.map((ponto) => {
          const i = indiceDe(ponto.data);
          return (
            <circle
              key={ponto.data}
              cx={x(i)}
              cy={y(ponto.estoque ?? 0)}
              r={2}
              className="fill-(--brand-green)"
            />
          );
        })}

        {/* Início da ruptura diagnosticada */}
        {iInicio >= 0 ? (
          <line
            x1={x(iInicio)}
            x2={x(iInicio)}
            y1={TOPO}
            y2={BASE}
            className="stroke-rose-500"
            strokeWidth={1.5}
            strokeDasharray="3 3"
          />
        ) : null}

        {/* Eixo X */}
        <line
          x1={L}
          x2={LARGURA - R}
          y1={BASE}
          y2={BASE}
          className="stroke-border"
          strokeWidth={1}
        />
        {marcasX.map(({ p: ponto, i }) => (
          <text
            key={ponto.data}
            x={x(i)}
            y={BASE + 14}
            textAnchor="middle"
            className="fill-muted-foreground text-[11px] tabular-nums"
          >
            {dataBr(ponto.data)}
          </text>
        ))}

        {/* Entradas: o que fez a serra subir. */}
        <text
          x={L - 8}
          y={LINHA_ENTRADAS + 4}
          textAnchor="end"
          className="fill-muted-foreground text-[11px]"
        >
          entradas
        </text>
        {serie.chegadas.map((c) => {
          const i = indiceDe(c.data);
          if (i < 0) return null;
          const compra = c.tipo === "compra";
          return (
            <g key={`${c.tipo}${c.data}`}>
              <circle
                cx={x(i)}
                cy={LINHA_ENTRADAS}
                r={4}
                className={compra ? "fill-emerald-500" : "fill-sky-500"}
              >
                <title>
                  {`${compra ? "Compra" : "Transferência"} · ${dataBr(c.data)} · ${curto(c.quantidade)} un.`}
                </title>
              </circle>
              <text
                x={x(i)}
                y={LINHA_ENTRADAS - 8}
                textAnchor="middle"
                className={`text-[10px] tabular-nums ${compra ? "fill-emerald-600 dark:fill-emerald-400" : "fill-sky-600 dark:fill-sky-400"}`}
              >
                {`+${curto(c.quantidade)}`}
              </text>
            </g>
          );
        })}

        {/* Pedido de compra: quando saiu e para quando foi prometido. */}
        <text
          x={L - 8}
          y={LINHA_PEDIDOS + 4}
          textAnchor="end"
          className="fill-muted-foreground text-[11px]"
        >
          pedido
        </text>
        {serie.marcos.map((m) => {
          const i = indiceDe(m.data);
          if (i < 0) return null;
          const emitido = m.tipo === "emitido";
          return (
            <g key={`${m.tipo}${m.data}`}>
              <rect
                x={x(i) - 3}
                y={LINHA_PEDIDOS - 4}
                width={6}
                height={8}
                rx={1}
                className={emitido ? "fill-violet-500" : "fill-amber-500"}
              >
                <title>{`${m.rotulo} · ${dataBr(m.data)} · ${curto(m.quantidade)} un.`}</title>
              </rect>
              <text
                x={x(i)}
                y={LINHA_PEDIDOS + 18}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {`${emitido ? "emitido" : "prometido"} ${dataBr(m.data)}`}
              </text>
            </g>
          );
        })}

        {/* Faixa invisível por dia: é o que captura o mouse. Uma por ponto, e
            não um handler no SVG inteiro, para a leitura ser exata. */}
        {pontos.map((ponto, i) => (
          <rect
            key={`h${ponto.data}`}
            x={x(i) - (LARGURA - L - R) / (pontos.length - 1) / 2}
            y={TOPO}
            width={(LARGURA - L - R) / (pontos.length - 1)}
            height={ALTURA_AREA}
            fill="transparent"
            onMouseEnter={() =>
              setDica({ i, x: x(i), y: y(ponto.estoque ?? 0) })
            }
          />
        ))}

        {dica ? (
          <line
            x1={dica.x}
            x2={dica.x}
            y1={TOPO}
            y2={BASE}
            className="stroke-foreground/30"
            strokeWidth={1}
          />
        ) : null}
      </svg>

      {/* O tooltip em HTML, e não em SVG: texto em SVG não quebra linha nem
          herda a tipografia do resto da tela. */}
      {p ? (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: `${(dica!.x / LARGURA) * 100}%`,
            top: `${(TOPO / ALTURA) * 100}%`,
          }}
        >
          <p className="font-medium">{dataBr(p.data)}</p>
          <p className="text-muted-foreground">
            {p.estoque === null
              ? "sem carga do simulador"
              : `estoque ${curto(p.estoque)} un.`}
          </p>
          {p.venda > 0 ? (
            <p className="text-muted-foreground">{`venda ${curto(p.venda)} un.`}</p>
          ) : null}
        </div>
      ) : null}

      {/* Forecast contra venda, por mês. O previsto de um mês parcial é
          proporcional aos dias desenhados — comparar nove dias de venda com o
          forecast de trinta diria que a venda desabou em todo item. */}
      <div className="mt-2 flex flex-wrap gap-2">
        {serie.meses.map((m) => {
          const desvio =
            m.previsto > 0 ? (m.real / m.previsto - 1) * 100 : null;
          return (
            <div
              key={m.mes}
              className="flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs"
            >
              <span className="font-medium">{mesBr(m.mes)}</span>
              <span className="text-muted-foreground">
                {`previsto ${curto(m.previsto)} · venda ${curto(m.real)}`}
              </span>
              {desvio !== null ? (
                <span
                  className={`font-mono font-medium tabular-nums ${
                    Math.abs(desvio) <= 20
                      ? "text-muted-foreground"
                      : desvio > 0
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-sky-600 dark:text-sky-400"
                  }`}
                >
                  {`${desvio > 0 ? "+" : ""}${desvio.toFixed(0)}%`}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-(--brand-green)" />
          estoque disponível
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-emerald-500" />
          compra
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-sky-500" />
          transferência
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-rose-500/20" />
          sem estoque
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded border-t border-dashed border-muted-foreground" />
          trecho sem carga do simulador
        </span>
      </div>
    </div>
  );
}
