"use client";

import { useId, useState } from "react";

import { faixasSemEstoque } from "@/lib/diagnostico-ruptura/serie";
import type { SerieItem } from "@/lib/diagnostico-ruptura/serie";

/**
 * O dente de serra: estoque caindo pelo consumo, subindo a cada entrada.
 *
 * Dois painéis sobre o mesmo eixo de tempo. Em cima, o estoque — medido até o
 * dia de referência, projetado daí até o fim do mês. Embaixo, o **ritmo**: a
 * venda acumulada contra a previsão acumulada, reiniciada a cada mês, que é
 * onde se vê se o mês está andando mais rápido ou mais devagar que o planejado.
 *
 * SVG à mão, sem biblioteca de gráficos. É a convenção do projeto, e aqui vale
 * mais que o de costume: as faixas de ruptura, a fronteira entre medido e
 * projetado e os marcadores de entrada prevista seriam contorno numa biblioteca
 * genérica.
 *
 * Três convenções de desenho, todas sobre a mesma ideia — **o traço diz o grau
 * de certeza**:
 *
 *   linha cheia      o que foi medido
 *   tracejado        o que é projeção, ou trecho sem carga do simulador
 *   marcador vazado  entrada que ainda não aconteceu
 *
 * Buraco de carga é desenhado como buraco. O simulador não é importado todo dia
 * e ligar os pontos com reta cheia afirmaria um consumo que ninguém observou.
 */

/** Geometria, em unidades do viewBox. */
const LARGURA = 1000;
const L = 58;
const R = 14;
const TOPO_A = 30;
const ALT_A = 176;
const BASE_A = TOPO_A + ALT_A;
const LINHA_ENTRADAS = BASE_A + 40;
const TOPO_B = BASE_A + 74;
const ALT_B = 86;
const BASE_B = TOPO_B + ALT_B;
const ALTURA = BASE_B + 24;

const curto = (v: number) =>
  Math.abs(v) >= 1_000_000
    ? `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`
    : Math.abs(v) >= 1000
      ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`
      : v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const MES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const mesPorExtenso = (iso: string) => MES[Number(iso.slice(5, 7)) - 1];

export function GraficoSerra({
  serie,
  /** Dia em que a ruptura diagnosticada começou, para a marca de referência. */
  inicioDaRuptura,
}: {
  serie: SerieItem;
  inicioDaRuptura?: string;
}) {
  const [cursor, setCursor] = useState<number | null>(null);
  // Ids únicos: dois gráficos na mesma página compartilhariam o gradiente e o
  // padrão de pontos se o id fosse fixo, e o segundo herdaria a escala do
  // primeiro.
  const uid = useId().replace(/:/g, "");

  const pontos = serie.pontos;
  if (pontos.length < 2) return null;

  const medidos = pontos.filter((p) => p.estoque !== null);
  const teto =
    Math.max(
      0,
      ...medidos.map((p) => p.estoque ?? 0),
      ...pontos.map((p) => p.projetado ?? 0),
      serie.politicaUnidades,
      1,
    ) * 1.14;

  const x = (i: number) => L + (i / (pontos.length - 1)) * (LARGURA - L - R);
  const yA = (v: number) => BASE_A - (v / teto) * ALT_A;
  const indiceDe = (data: string) => pontos.findIndex((p) => p.data === data);

  // Trechos contínuos de dias com carga: cada um vira linha cheia, o vão entre
  // dois vira tracejado.
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

  const projecao = pontos
    .map((p, i) => ({ i, v: p.projetado }))
    .filter((p): p is { i: number; v: number } => p.v !== null);

  const faixas = faixasSemEstoque(pontos, serie.referencia);

  /**
   * Quais faixas ganham rótulo.
   *
   * Duas rupturas próximas escreviam "3d sem estoque" e "9d sem estoque" uma
   * por cima da outra, e as duas ficavam ilegíveis. A varredura é gulosa, da
   * esquerda para a direita: quem chega primeiro fica, e quem invadiria o
   * espaço do anterior perde o rótulo — a faixa continua pintada, e o número
   * aparece no tooltip.
   *
   * A largura do texto é estimada em 5,6 unidades por caractere, que é o que
   * 11px rende neste viewBox de mil unidades.
   */
  const comRotulo = new Set<number>();
  let ocupadoAte = -Infinity;
  for (const f of faixas) {
    const texto = `${f.ate - f.de + 1}d sem estoque`;
    const meio = (x(f.de) + x(f.ate)) / 2;
    const metade = (texto.length * 5.6) / 2;
    if (meio - metade < ocupadoAte + 6) continue;
    comRotulo.add(f.de);
    ocupadoAte = meio + metade;
  }

  const traco = (t: { i: number; v: number }[], escala: (v: number) => number) =>
    t.map((p, k) => `${k === 0 ? "M" : "L"} ${x(p.i)} ${escala(p.v)}`).join(" ");

  // ---- painel de baixo: ritmo acumulado, reiniciado a cada mês -------------
  const ritmo: { mes: string; real: { i: number; v: number }[]; previsto: { i: number; v: number }[] }[] = [];
  for (const m of serie.meses) {
    let real = 0;
    let previsto = 0;
    const serieReal: { i: number; v: number }[] = [];
    const seriePrevisto: { i: number; v: number }[] = [];
    pontos.forEach((p, i) => {
      if (p.data.slice(0, 7) !== m.mes || p.data > serie.referencia) return;
      real += p.venda;
      previsto += m.consumoDiario;
      serieReal.push({ i, v: real });
      seriePrevisto.push({ i, v: previsto });
    });
    if (serieReal.length > 0) {
      ritmo.push({ mes: m.mes, real: serieReal, previsto: seriePrevisto });
    }
  }
  const tetoRitmo =
    Math.max(
      1,
      ...ritmo.flatMap((r) => [
        r.real.at(-1)?.v ?? 0,
        r.previsto.at(-1)?.v ?? 0,
      ]),
    ) * 1.15;
  const yB = (v: number) => BASE_B - (v / tetoRitmo) * ALT_B;

  // ---- divisas de mês e dia de referência ---------------------------------
  const divisas = pontos
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.data.slice(8, 10) === "01" && p.data !== serie.de);
  const iReferencia = indiceDe(serie.referencia);
  const iInicio = inicioDaRuptura ? indiceDe(inicioDaRuptura) : -1;

  const marcasX = pontos
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) => i === 0 || i === pontos.length - 1 || p.data.slice(8, 10) === "01" || p.data.slice(8, 10) === "15");

  const p = cursor !== null ? pontos[cursor] : null;
  const larguraDia = (LARGURA - L - R) / (pontos.length - 1);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        className="w-full"
        role="img"
        aria-label="Estoque dia a dia, entradas e ritmo de venda"
        onMouseLeave={() => setCursor(null)}
      >
        <defs>
          {/* Grade de pontos: marca o espaço sem desenhar linhas que competem
              com a curva. */}
          <pattern
            id={`pontilhado-${uid}`}
            width={16}
            height={16}
            patternUnits="userSpaceOnUse"
          >
            <circle cx={1} cy={1} r={1} className="fill-muted-foreground/25" />
          </pattern>
          <linearGradient id={`area-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand-green)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--brand-green)" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id={`futuro-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand-turquoise)" stopOpacity={0.2} />
            <stop offset="100%" stopColor="var(--brand-turquoise)" stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <rect
          x={L}
          y={TOPO_A}
          width={LARGURA - L - R}
          height={ALT_A}
          fill={`url(#pontilhado-${uid})`}
        />

        {/* O futuro, com fundo próprio: a fronteira entre medido e projetado é
            a informação mais importante do gráfico, e uma linha sozinha some. */}
        {iReferencia >= 0 && iReferencia < pontos.length - 1 ? (
          <rect
            x={x(iReferencia)}
            y={TOPO_A}
            width={LARGURA - R - x(iReferencia)}
            height={ALT_A}
            className="fill-muted/40"
          />
        ) : null}

        {/* Eixo Y */}
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={L}
              x2={LARGURA - R}
              y1={yA(teto * f)}
              y2={yA(teto * f)}
              className="stroke-border"
              strokeWidth={1}
            />
            <text
              x={L - 8}
              y={yA(teto * f) + 4}
              textAnchor="end"
              className="fill-muted-foreground text-[11px] tabular-nums"
            >
              {curto(teto * f)}
            </text>
          </g>
        ))}

        {/* Nome dos meses, no topo */}
        {serie.meses.map((m) => {
          const dias = pontos
            .map((ponto, i) => ({ ponto, i }))
            .filter(({ ponto }) => ponto.data.slice(0, 7) === m.mes);
          if (dias.length === 0) return null;
          const meio = (x(dias[0].i) + x(dias.at(-1)!.i)) / 2;
          return (
            <text
              key={m.mes}
              x={meio}
              y={TOPO_A - 12}
              textAnchor="middle"
              className={`text-[12px] font-medium tracking-wide uppercase ${
                m.corrente
                  ? "fill-(--brand-petrol) dark:fill-(--brand-turquoise)"
                  : "fill-muted-foreground"
              }`}
            >
              {mesPorExtenso(m.mes)}
            </text>
          );
        })}
        {divisas.map(({ i, p: ponto }) => (
          <line
            key={ponto.data}
            x1={x(i)}
            x2={x(i)}
            y1={TOPO_A - 6}
            y2={BASE_B}
            className="stroke-border"
            strokeWidth={1}
          />
        ))}

        {/* Faixas sem estoque, por baixo da curva */}
        {faixas.map((f) => (
          <g key={`r${f.de}`}>
            <rect
              x={x(f.de) - larguraDia / 2}
              y={TOPO_A}
              width={Math.max(x(f.ate) - x(f.de) + larguraDia, 3)}
              height={ALT_A}
              className="fill-rose-500/12"
            >
              <title>{`${f.ate - f.de + 1} dias sem estoque, de ${dataBr(pontos[f.de].data)} a ${dataBr(pontos[f.ate].data)}`}</title>
            </rect>
            {comRotulo.has(f.de) ? (
              <text
                x={(x(f.de) + x(f.ate)) / 2}
                y={TOPO_A + 13}
                textAnchor="middle"
                className="fill-rose-600 text-[11px] font-medium dark:fill-rose-400"
              >
                {`${f.ate - f.de + 1}d sem estoque`}
              </text>
            ) : null}
          </g>
        ))}

        {/* Estoque mínimo pela política */}
        {serie.politicaUnidades > 0 && serie.politicaUnidades <= teto ? (
          <g>
            <line
              x1={L}
              x2={LARGURA - R}
              y1={yA(serie.politicaUnidades)}
              y2={yA(serie.politicaUnidades)}
              className="stroke-amber-500"
              strokeWidth={1.5}
              strokeDasharray="6 4"
            />
            <text
              x={LARGURA - R}
              y={yA(serie.politicaUnidades) - 6}
              textAnchor="end"
              className="fill-amber-600 text-[11px] dark:fill-amber-400"
            >
              {`política ${curto(serie.politicaDias)} dias · ${curto(serie.politicaUnidades)} un.`}
            </text>
          </g>
        ) : null}

        {/* Projeção: área e linha tracejada, do último dia medido ao fim do mês */}
        {projecao.length > 1 ? (
          <g>
            <path
              d={`${traco(projecao, yA)} L ${x(projecao.at(-1)!.i)} ${BASE_A} L ${x(projecao[0].i)} ${BASE_A} Z`}
              fill={`url(#futuro-${uid})`}
            />
            <path
              d={traco(projecao, yA)}
              fill="none"
              className="stroke-(--brand-turquoise)"
              strokeWidth={2}
              strokeDasharray="6 5"
              strokeLinecap="round"
            />
          </g>
        ) : null}

        {/* Vão entre trechos medidos */}
        {trechos.slice(0, -1).map((t, k) => {
          const fim = t.at(-1)!;
          const inicio = trechos[k + 1][0];
          return (
            <line
              key={`v${k}`}
              x1={x(fim.i)}
              y1={yA(fim.v)}
              x2={x(inicio.i)}
              y2={yA(inicio.v)}
              className="stroke-(--brand-green)/35"
              strokeWidth={2}
              strokeDasharray="3 4"
            />
          );
        })}

        {/* A curva medida */}
        {trechos.map((t, k) => (
          <g key={`t${k}`}>
            {t.length > 1 ? (
              <path
                d={`${traco(t, yA)} L ${x(t.at(-1)!.i)} ${BASE_A} L ${x(t[0].i)} ${BASE_A} Z`}
                fill={`url(#area-${uid})`}
              />
            ) : null}
            <path
              d={traco(t, yA)}
              fill="none"
              className="stroke-(--brand-green)"
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
        ))}

        {/* Pontos medidos: sem eles, um dia isolado entre dois buracos some. */}
        {medidos.map((ponto) => (
          <circle
            key={ponto.data}
            cx={x(indiceDe(ponto.data))}
            cy={yA(ponto.estoque ?? 0)}
            r={2.5}
            className="fill-(--brand-green)"
          />
        ))}

        {/* Hoje */}
        {iReferencia >= 0 ? (
          <g>
            <line
              x1={x(iReferencia)}
              x2={x(iReferencia)}
              y1={TOPO_A}
              y2={BASE_B}
              className="stroke-(--brand-petrol) dark:stroke-(--brand-turquoise)"
              strokeWidth={1.5}
            />
            <rect
              x={x(iReferencia) - 26}
              y={TOPO_A - 2}
              width={52}
              height={16}
              rx={8}
              className="fill-(--brand-petrol) dark:fill-(--brand-turquoise)"
            />
            <text
              x={x(iReferencia)}
              y={TOPO_A + 9}
              textAnchor="middle"
              className="fill-white text-[10px] font-medium dark:fill-slate-900"
            >
              {dataBr(serie.referencia)}
            </text>
          </g>
        ) : null}

        {/* Início da ruptura diagnosticada */}
        {iInicio >= 0 ? (
          <line
            x1={x(iInicio)}
            x2={x(iInicio)}
            y1={TOPO_A}
            y2={BASE_A}
            className="stroke-rose-500"
            strokeWidth={1.5}
            strokeDasharray="2 3"
          />
        ) : null}

        <line
          x1={L}
          x2={LARGURA - R}
          y1={BASE_A}
          y2={BASE_A}
          className="stroke-border"
          strokeWidth={1}
        />
        {marcasX.map(({ p: ponto, i }) => (
          <text
            key={ponto.data}
            x={x(i)}
            y={BASE_A + 15}
            textAnchor="middle"
            className="fill-muted-foreground text-[11px] tabular-nums"
          >
            {dataBr(ponto.data)}
          </text>
        ))}

        {/* Entradas: o que fez (ou fará) a serra subir. */}
        <text
          x={L - 8}
          y={LINHA_ENTRADAS + 4}
          textAnchor="end"
          className="fill-muted-foreground text-[11px]"
        >
          entradas
        </text>
        <line
          x1={L}
          x2={LARGURA - R}
          y1={LINHA_ENTRADAS}
          y2={LINHA_ENTRADAS}
          className="stroke-border"
          strokeWidth={1}
          strokeDasharray="2 4"
        />
        {serie.chegadas.map((c, k) => {
          const i = indiceDe(c.data);
          if (i < 0) return null;
          const compra = c.tipo === "compra";
          const vencida = Boolean(c.prometidaPara);
          // Classes escritas por extenso: o Tailwind varre o código-fonte, e
          // `fill-${cor}-500` nunca entra no CSS gerado — o marcador sairia
          // sem cor nenhuma, em produção, sem erro em lugar nenhum.
          //
          // Três estados, três aparências: cheio é o que entrou, vazado é o
          // que vem, e âmbar tracejado é o que já era para ter entrado. Sem o
          // terceiro, as entradas vencidas — 19 das 21 medidas nas maiores
          // rupturas — ficavam com cara de boa notícia.
          const tom = vencida
            ? "fill-amber-500/20 stroke-amber-500"
            : c.prevista
              ? compra
                ? "fill-background stroke-emerald-500"
                : "fill-background stroke-sky-500"
              : compra
                ? "fill-emerald-500 stroke-emerald-500"
                : "fill-sky-500 stroke-sky-500";
          const corTexto = vencida
            ? "fill-amber-600 dark:fill-amber-400"
            : compra
              ? "fill-emerald-600 dark:fill-emerald-400"
              : "fill-sky-600 dark:fill-sky-400";
          return (
            <g key={`${c.tipo}${c.data}${k}`}>
              <circle
                cx={x(i)}
                cy={LINHA_ENTRADAS}
                r={5.5}
                strokeWidth={2}
                strokeDasharray={vencida ? "3 2" : undefined}
                // Vazado quando é previsão: a forma diz o grau de certeza, sem
                // depender de ler a legenda.
                className={tom}
              >
                <title>
                  {[
                    compra ? "Compra" : "Transferência",
                    dataBr(c.data),
                    `${curto(c.quantidade)} un.`,
                    c.notas && c.notas > 1 ? `${c.notas} notas` : null,
                    c.prometidaPara
                      ? `era para ter entrado em ${dataBr(c.prometidaPara)}`
                      : c.prevista
                        ? `previsto · ${c.origem}`
                        : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </title>
              </circle>
              <text
                x={x(i)}
                y={LINHA_ENTRADAS - 11}
                textAnchor="middle"
                className={`text-[10px] tabular-nums ${corTexto}`}
              >
                {`+${curto(c.quantidade)}`}
              </text>
              {vencida ? (
                <text
                  x={x(i)}
                  y={LINHA_ENTRADAS + 17}
                  textAnchor="middle"
                  className="fill-amber-600 text-[9px] dark:fill-amber-400"
                >
                  {`venc. ${dataBr(c.prometidaPara!)}`}
                </text>
              ) : null}
            </g>
          );
        })}
        {serie.marcos.map((m, k) => {
          const i = indiceDe(m.data);
          if (i < 0) return null;
          return (
            <g key={`m${m.data}${k}`}>
              <path
                d={`M ${x(i)} ${LINHA_ENTRADAS + 14} l 4 7 l -8 0 Z`}
                className="fill-violet-500"
              >
                <title>{`${m.rotulo} · emitido ${dataBr(m.data)} · ${curto(m.quantidade)} un.`}</title>
              </path>
            </g>
          );
        })}

        {/* ---- painel de ritmo ---- */}
        <rect
          x={L}
          y={TOPO_B}
          width={LARGURA - L - R}
          height={ALT_B}
          fill={`url(#pontilhado-${uid})`}
        />
        <text
          x={L - 8}
          y={TOPO_B + 12}
          textAnchor="end"
          className="fill-muted-foreground text-[11px]"
        >
          ritmo
        </text>
        <text
          x={L - 8}
          y={BASE_B + 4}
          textAnchor="end"
          className="fill-muted-foreground text-[11px] tabular-nums"
        >
          0
        </text>
        <line
          x1={L}
          x2={LARGURA - R}
          y1={BASE_B}
          y2={BASE_B}
          className="stroke-border"
          strokeWidth={1}
        />
        {ritmo.map((r) => (
          <g key={r.mes}>
            <path
              d={traco(r.previsto, yB)}
              fill="none"
              className="stroke-muted-foreground/70"
              strokeWidth={1.5}
            />
            <path
              d={traco(r.real, yB)}
              fill="none"
              className="stroke-(--brand-petrol) dark:stroke-(--brand-turquoise)"
              strokeWidth={2.5}
              strokeDasharray="4 3"
              strokeLinecap="round"
            />
            {/* O acumulado do mês, na ponta da linha: é o número que a pessoa
                procura, e procurá-lo no eixo custa um passo a mais. */}
            {r.real.length > 0 ? (
              <text
                x={x(r.real.at(-1)!.i) + 5}
                y={yB(r.real.at(-1)!.v) + 3}
                className="fill-(--brand-petrol) text-[10px] tabular-nums dark:fill-(--brand-turquoise)"
              >
                {curto(r.real.at(-1)!.v)}
              </text>
            ) : null}
          </g>
        ))}

        {/* Faixa invisível por dia: é o que captura o mouse. */}
        {pontos.map((ponto, i) => (
          <rect
            key={`h${ponto.data}`}
            x={x(i) - larguraDia / 2}
            y={TOPO_A}
            width={larguraDia}
            height={BASE_B - TOPO_A}
            fill="transparent"
            onMouseEnter={() => setCursor(i)}
          />
        ))}

        {cursor !== null ? (
          <line
            x1={x(cursor)}
            x2={x(cursor)}
            y1={TOPO_A}
            y2={BASE_B}
            className="stroke-foreground/25"
            strokeWidth={1}
          />
        ) : null}
      </svg>

      {/* O tooltip em HTML, e não em SVG: texto em SVG não quebra linha nem
          herda a tipografia do resto da tela. */}
      {p ? (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border bg-popover/95 px-2.5 py-1.5 text-xs shadow-lg backdrop-blur"
          style={{
            left: `${Math.min(92, Math.max(8, (x(cursor!) / LARGURA) * 100))}%`,
            top: 0,
          }}
        >
          <p className="font-medium">{dataBr(p.data)}</p>
          <p className="text-muted-foreground">
            {p.estoque !== null
              ? `estoque ${curto(p.estoque)} un.`
              : p.data > serie.referencia
                ? `projetado ${curto(p.projetado ?? 0)} un.`
                : "sem carga do simulador"}
          </p>
          {p.venda > 0 ? (
            <p className="text-muted-foreground">{`venda ${curto(p.venda)} un.`}</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-5 rounded bg-(--brand-green)" />
          estoque medido
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-5 rounded border-t-2 border-dashed border-(--brand-turquoise)" />
          projetado até o fim do mês
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-emerald-500" />
          compra
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-sky-500" />
          transferência
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border-2 border-muted-foreground bg-background" />
          entrada prevista
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border-2 border-dashed border-amber-500 bg-amber-500/20" />
          prevista e vencida
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-rose-500/20" />
          sem estoque
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-5 rounded bg-muted-foreground/70" />
          ritmo previsto
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-5 rounded border-t-2 border-dashed border-(--brand-petrol) dark:border-(--brand-turquoise)" />
          ritmo realizado
        </span>
        {/* O aviso precisa estar na legenda, não escondido num tooltip: a
            projeção inteira muda de sentido se o ritmo é emprestado. */}
        {serie.forecastHerdado ? (
          <span className="text-amber-600 dark:text-amber-400">
            forecast do mês ainda não importado — projeção no ritmo do mês
            anterior
          </span>
        ) : null}
      </div>

      {/* O fechamento de cada mês, em números. */}
      <div className="mt-2 flex flex-wrap gap-2">
        {serie.meses.map((m) => {
          const desvio = m.previsto > 0 ? (m.real / m.previsto - 1) * 100 : null;
          return (
            <div
              key={m.mes}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs ${
                m.corrente ? "border-(--brand-petrol)/30 bg-muted/40" : ""
              }`}
            >
              <span className="font-medium capitalize">
                {mesPorExtenso(m.mes)}
              </span>
              {m.corrente ? (
                <span className="text-[10px] text-muted-foreground">
                  até aqui
                </span>
              ) : null}
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
    </div>
  );
}
