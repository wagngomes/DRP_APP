"use client";

import { useState } from "react";

import type { CurvaMes } from "@/lib/aceleracao/consultas";

/**
 * Venda acumulada dentro do mês, uma linha por mês.
 *
 * A leitura que este gráfico permite não depende de nenhum limiar: no mesmo dia
 * do mês, ou a linha do mês corrente descola das outras, ou não descola. É a
 * forma visual da mesma comparação por janela que a regra usa — por isso não há
 * risco de o gráfico contar uma história e o alerta contar outra.
 *
 * SVG na mão em vez de biblioteca: são polilinhas e uma guia vertical, e uma
 * dependência de gráfico custaria mais peso do que o desenho inteiro.
 */

const ALTURA = 260;
const LARGURA = 720;
const MARGEM = { topo: 16, direita: 16, baixo: 28, esquerda: 56 };

/** Tons dos meses anteriores, do mais antigo ao mais recente. */
const TONS_ANTERIORES = ["#cbd5e1", "#a8b6c6", "#8b9bb0", "#6f8098", "#54677f"];

function nomeMes(mes: string): string {
  const [ano, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(ano, m - 1, 1))
    .toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" })
    .replace(".", "");
}

function num(v: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

export function CurvaAcumulada({
  curvas,
  mesCorrente,
  diaCorte,
}: {
  curvas: CurvaMes[];
  mesCorrente: string;
  diaCorte: number;
}) {
  const [diaAtivo, setDiaAtivo] = useState<number | null>(null);

  const comDados = curvas.filter((c) => c.pontos.length > 0);
  if (comDados.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Sem histórico de venda para este item.
      </p>
    );
  }

  const maxDia = Math.max(...comDados.flatMap((c) => c.pontos.map((p) => p.dia)), 31);
  const maxValor = Math.max(...comDados.flatMap((c) => c.pontos.map((p) => p.acumulado)), 1);

  const larguraUtil = LARGURA - MARGEM.esquerda - MARGEM.direita;
  const alturaUtil = ALTURA - MARGEM.topo - MARGEM.baixo;
  const x = (dia: number) => MARGEM.esquerda + ((dia - 1) / (maxDia - 1)) * larguraUtil;
  const y = (v: number) => MARGEM.topo + alturaUtil - (v / maxValor) * alturaUtil;

  const anteriores = comDados.filter((c) => c.mes !== mesCorrente);
  const corrente = comDados.find((c) => c.mes === mesCorrente);

  /** Acumulado de um mês num dia — o último ponto até ali. */
  const acumuladoEm = (c: CurvaMes, dia: number) => {
    let v: number | null = null;
    for (const p of c.pontos) {
      if (p.dia > dia) break;
      v = p.acumulado;
    }
    return v;
  };

  const linhas = [
    ...anteriores.map((c, i) => ({
      curva: c,
      cor: TONS_ANTERIORES[Math.min(i, TONS_ANTERIORES.length - 1)],
      atual: false,
    })),
    ...(corrente ? [{ curva: corrente, cor: "#e11d48", atual: true }] : []),
  ];

  // Referências horizontais em quartos da escala: dão noção de grandeza sem
  // poluir o desenho com uma grade cheia.
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxValor);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${LARGURA} ${ALTURA}`}
          className="h-[260px] w-full min-w-[520px]"
          onMouseLeave={() => setDiaAtivo(null)}
          onMouseMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - box.left) / box.width) * LARGURA;
            const dia = Math.round(((px - MARGEM.esquerda) / larguraUtil) * (maxDia - 1) + 1);
            setDiaAtivo(dia >= 1 && dia <= maxDia ? dia : null);
          }}
        >
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
              />
              <text
                x={MARGEM.esquerda - 8}
                y={y(v) + 4}
                textAnchor="end"
                className="fill-muted-foreground text-[10px] tabular-nums"
              >
                {num(v)}
              </text>
            </g>
          ))}

          {[1, 5, 10, 15, 20, 25, 31].filter((d) => d <= maxDia).map((d) => (
            <text
              key={d}
              x={x(d)}
              y={ALTURA - 8}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px] tabular-nums"
            >
              {d}
            </text>
          ))}

          {/* Onde o mês corrente pára: tudo à direita disso é só histórico. */}
          <line
            x1={x(diaCorte)}
            x2={x(diaCorte)}
            y1={MARGEM.topo}
            y2={ALTURA - MARGEM.baixo}
            stroke="currentColor"
            className="text-muted-foreground/40"
            strokeWidth={1}
            strokeDasharray="4 4"
          />

          {linhas.map(({ curva, cor, atual }) => (
            <polyline
              key={curva.mes}
              points={curva.pontos.map((p) => `${x(p.dia)},${y(p.acumulado)}`).join(" ")}
              fill="none"
              stroke={cor}
              strokeWidth={atual ? 3 : 1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={atual ? 1 : 0.85}
            />
          ))}

          {diaAtivo !== null ? (
            <>
              <line
                x1={x(diaAtivo)}
                x2={x(diaAtivo)}
                y1={MARGEM.topo}
                y2={ALTURA - MARGEM.baixo}
                stroke="currentColor"
                className="text-foreground/30"
                strokeWidth={1}
              />
              {linhas.map(({ curva, cor }) => {
                const v = acumuladoEm(curva, diaAtivo);
                return v === null ? null : (
                  <circle key={curva.mes} cx={x(diaAtivo)} cy={y(v)} r={3.5} fill={cor} />
                );
              })}
            </>
          ) : null}
        </svg>
      </div>

      {/* Legenda com o valor no dia sob o cursor — evita tooltip flutuante
          sobre um gráfico que já é estreito. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="text-muted-foreground">
          {diaAtivo === null ? `Acumulado até o dia ${diaCorte}` : `Dia ${diaAtivo}`}
        </span>
        {linhas.map(({ curva, cor, atual }) => {
          const v = acumuladoEm(curva, diaAtivo ?? diaCorte);
          return (
            <span key={curva.mes} className="flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-4 rounded"
                style={{ backgroundColor: cor, height: atual ? 3 : 2 }}
              />
              <span className={atual ? "font-semibold" : "text-muted-foreground"}>
                {nomeMes(curva.mes)}
              </span>
              <span className="font-mono tabular-nums">{v === null ? "—" : num(v)}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
