"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

/**
 * Aceleração contra cobertura, um ponto por item.
 *
 * Existe para responder de relance a pergunta que a tabela só responde linha a
 * linha: *quais acelerações importam*. Acelerar não é problema quando há
 * estoque; o que exige ação é acelerar **e** estar sem cobertura, e isso é uma
 * região do plano, não uma ordenação. Por isso o canto inferior direito recebe
 * fundo próprio — é a leitura da tela inteira em um lugar só.
 *
 * O tamanho da bolha é o excedente, então um ponto grande no canto crítico é
 * volume de verdade e não um item de giro pequeno com percentual alto.
 */

export type PontoQuadrante = {
  codigo: string;
  descricao: string | null;
  indice: number;
  dias: number | null;
  excedente: number;
  clientesFora: number;
};

const LARGURA = 720;
const ALTURA = 320;
const MARGEM = { topo: 16, direita: 20, baixo: 34, esquerda: 52 };

/** Tetos dos eixos: acima disso o ponto encosta na borda, com o valor no tooltip. */
const INDICE_MAX = 4;
const DIAS_MAX = 60;

function num(v: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

export function Quadrantes({
  pontos,
  selecionado,
  diasRisco,
  /**
   * Query string dos filtros atuais, sem `item`. Vem como texto e não como
   * função: props de componente cliente atravessam serializadas, e uma função
   * passaria no typecheck para falhar só em runtime.
   */
  filtros,
}: {
  pontos: PontoQuadrante[];
  selecionado?: string;
  diasRisco: number;
  filtros: string;
}) {
  const [dica, setDica] = useState<{ p: PontoQuadrante; x: number; y: number } | null>(null);
  const router = useRouter();

  const hrefItem = (codigo: string) => {
    const p = new URLSearchParams(filtros);
    p.set("item", codigo);
    return `/aceleracao?${p.toString()}`;
  };

  const visiveis = pontos.filter((p) => p.dias !== null);
  if (visiveis.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nenhum item para posicionar neste recorte.
      </p>
    );
  }

  const larguraUtil = LARGURA - MARGEM.esquerda - MARGEM.direita;
  const alturaUtil = ALTURA - MARGEM.topo - MARGEM.baixo;

  const x = (indice: number) =>
    MARGEM.esquerda + (Math.min(indice, INDICE_MAX) / INDICE_MAX) * larguraUtil;
  const y = (dias: number) =>
    MARGEM.topo + alturaUtil - (Math.min(dias, DIAS_MAX) / DIAS_MAX) * alturaUtil;

  // Raio pela raiz do excedente: área proporcional ao volume, que é como o olho
  // compara círculos. Piso de 3px para o item sem excedente continuar clicável.
  const maxExc = Math.max(...visiveis.map((p) => p.excedente), 1);
  const raio = (exc: number) => 3 + Math.sqrt(Math.max(exc, 0) / maxExc) * 11;

  const xCorte = x(1.5);
  const yCorte = y(diasRisco);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} className="h-[320px] w-full min-w-[560px]">
          {/* Região crítica: acelerando forte e com pouca cobertura. */}
          <rect
            x={xCorte}
            y={yCorte}
            width={LARGURA - MARGEM.direita - xCorte}
            height={ALTURA - MARGEM.baixo - yCorte}
            className="fill-red-500/8"
          />

          {[0, 15, 30, 45, 60].map((d) => (
            <g key={d}>
              <line
                x1={MARGEM.esquerda}
                x2={LARGURA - MARGEM.direita}
                y1={y(d)}
                y2={y(d)}
                stroke="currentColor"
                className="text-border"
              />
              <text
                x={MARGEM.esquerda - 8}
                y={y(d) + 4}
                textAnchor="end"
                className="fill-muted-foreground text-[10px] tabular-nums"
              >
                {d === DIAS_MAX ? `${d}+` : d}
              </text>
            </g>
          ))}

          {[1, 2, 3, 4].map((i) => (
            <text
              key={i}
              x={x(i)}
              y={ALTURA - 14}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px] tabular-nums"
            >
              {i === INDICE_MAX ? `${i}x+` : `${i}x`}
            </text>
          ))}

          {/* Divisórias dos quadrantes. */}
          <line
            x1={xCorte}
            x2={xCorte}
            y1={MARGEM.topo}
            y2={ALTURA - MARGEM.baixo}
            stroke="currentColor"
            className="text-muted-foreground/50"
            strokeDasharray="4 4"
          />
          <line
            x1={MARGEM.esquerda}
            x2={LARGURA - MARGEM.direita}
            y1={yCorte}
            y2={yCorte}
            stroke="currentColor"
            className="text-muted-foreground/50"
            strokeDasharray="4 4"
          />

          <text
            x={LARGURA - MARGEM.direita - 6}
            y={ALTURA - MARGEM.baixo - 8}
            textAnchor="end"
            className="fill-red-700 text-[11px] font-semibold dark:fill-red-400"
          >
            acelerando sem cobertura
          </text>

          {visiveis.map((p) => {
            const ativo = p.codigo === selecionado;
            return (
              <circle
                key={p.codigo}
                cx={x(p.indice)}
                cy={y(p.dias!)}
                r={raio(p.excedente) + (ativo ? 3 : 0)}
                className={`cursor-pointer transition-opacity ${
                  ativo
                    ? "fill-(--brand-petrol) dark:fill-(--brand-turquoise)"
                    : p.clientesFora >= 2
                      ? "fill-red-500/60"
                      : "fill-slate-400/50"
                }`}
                stroke={ativo ? "currentColor" : "none"}
                strokeWidth={2}
                onMouseMove={(e) => setDica({ p, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setDica(null)}
                onClick={() => router.push(hrefItem(p.codigo), { scroll: false })}
              />
            );
          })}

          <text
            x={MARGEM.esquerda + larguraUtil / 2}
            y={ALTURA - 1}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            índice de aceleração (realizado ÷ esperado)
          </text>
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Eixo vertical: dias de cobertura no ritmo real</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full bg-red-500/60" />
          2+ clientes fora do padrão
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full bg-slate-400/50" />
          demais
        </span>
        <span>Tamanho da bolha: excedente em unidades</span>
      </div>

      {dica
        ? createPortal(
            <div
              className="pointer-events-none fixed z-50 w-max max-w-72 rounded-md border bg-popover px-3 py-2 text-xs shadow-md"
              style={{
                left: dica.x + (dica.x + 300 > window.innerWidth ? -12 : 12),
                top: dica.y + 12,
                transform: dica.x + 300 > window.innerWidth ? "translateX(-100%)" : undefined,
              }}
            >
              <p className="font-mono font-semibold">{dica.p.codigo}</p>
              {dica.p.descricao ? (
                <p className="mb-1 truncate text-muted-foreground">{dica.p.descricao}</p>
              ) : null}
              <p className="tabular-nums">
                {`índice ${dica.p.indice.toFixed(2)}x · ${dica.p.dias!.toFixed(1)} dias de cobertura`}
              </p>
              <p className="tabular-nums text-muted-foreground">
                {`${dica.p.clientesFora} cliente(s) fora do padrão · +${num(dica.p.excedente)} un`}
              </p>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
