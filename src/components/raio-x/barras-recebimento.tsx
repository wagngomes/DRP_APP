"use client";

import { useState } from "react";

import type { RecebimentoDia } from "@/lib/sop/consultas";

/**
 * Entrada e saída do produto, dia a dia do mês.
 *
 * Quantidade do dia, não acumulada — a curva logo acima já responde "como o mês
 * foi indo"; esta responde "o que aconteceu naquele dia". Entradas para cima em
 * violeta, vendas para baixo em verde, com o zero no meio: a leitura de estar
 * repondo no ritmo, ou de ter recebido tudo depois de a venda já ter
 * acontecido, salta sem precisar de número nenhum.
 *
 * O eixo traz **todos** os dias, inclusive os sem movimento. Um eixo que
 * pulasse de 13 para 27 mostraria duas barras lado a lado e esconderia o que
 * mais importa: as duas semanas em que nada entrou. O vão é a informação.
 *
 * SVG na mão, como as outras curvas desta base: são retângulos, uma malha e uma
 * linha de base. Uma biblioteca de gráfico pesaria mais que o desenho inteiro.
 */

const ALTURA = 260;
const LARGURA = 760;
const MARGEM = { topo: 18, direita: 12, baixo: 24, esquerda: 60 };

function num(v: number): string {
  return Math.round(v).toLocaleString("pt-BR");
}

/** Abreviação para caber dentro da barra: 5257 -> "5,3k". */
function curto(v: number): string {
  const n = Math.round(Math.abs(v));
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".", ",")}k`;
  return String(n);
}

export function BarrasRecebimento({
  dias,
  rotulos,
}: {
  dias: RecebimentoDia[];
  /** Código da filial -> sigla, para o tooltip falar "CAJ" e não "1006". */
  rotulos: Record<string, string>;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);

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
  // comparam entre si, e por isso a legenda diz que as escalas são separadas.
  const alturaCima = maxSaida > 0 ? util.altura * 0.58 : util.altura;
  const alturaBaixo = util.altura - alturaCima;
  const zero = MARGEM.topo + alturaCima;

  const yCima = (v: number) => (maxEntrada > 0 ? zero - (v / maxEntrada) * alturaCima : zero);
  const alturaSaida = (v: number) => (maxSaida > 0 ? (v / maxSaida) * alturaBaixo : 0);

  const passo = util.largura / dias.length;
  // Folga de um ponto entre barras: encostadas, 31 delas viram um bloco só.
  const larguraBarra = Math.max(2, passo - 3);
  const x = (i: number) => MARGEM.esquerda + i * passo + (passo - larguraBarra) / 2;

  const comEntrada = dias.filter((d) => d.quantidade > 0).length;
  const comVenda = dias.filter((d) => d.vendido > 0).length;
  const diaAtivo = ativo === null ? null : dias[ativo];

  const rotulo = (filial: string) => rotulos[filial] ?? filial;

  return (
    <div className="space-y-2">
      <div className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${LARGURA} ${ALTURA}`}
          className="h-[260px] w-full min-w-[560px]"
          onMouseLeave={() => setAtivo(null)}
        >
          <defs>
            {/* Malha da área de plotagem. Em `pattern` e não em linhas soltas:
                são trinta e uma colunas, e desenhá-las uma a uma encheria o DOM
                de nós que ninguém vai consultar. */}
            <pattern id="malha-mov" width="24" height="22" patternUnits="userSpaceOnUse">
              <path
                d="M 24 0 L 0 0 0 22"
                fill="none"
                stroke="currentColor"
                className="text-border"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
            </pattern>
          </defs>

          <rect
            x={MARGEM.esquerda}
            y={MARGEM.topo}
            width={util.largura}
            height={util.altura}
            fill="url(#malha-mov)"
            opacity={0.8}
          />

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
            const parado = d.quantidade <= 0 && d.vendido <= 0;
            const alturaEntrada = Math.max(1, zero - yCima(d.quantidade));
            const hSaida = Math.max(1, alturaSaida(d.vendido));
            return (
              <g key={d.dia}>
                {/* Faixa invisível cobrindo a coluna inteira: com o alvo só na
                    barra, acertar um dia de 2px com o mouse é sorte. */}
                <rect
                  x={MARGEM.esquerda + i * passo}
                  y={MARGEM.topo}
                  width={passo}
                  height={util.altura}
                  fill="transparent"
                  onMouseEnter={() => setAtivo(i)}
                />

                {ativo === i ? (
                  <rect
                    x={MARGEM.esquerda + i * passo}
                    y={MARGEM.topo}
                    width={passo}
                    height={util.altura}
                    className="fill-muted"
                    opacity={0.5}
                    pointerEvents="none"
                  />
                ) : null}

                {d.quantidade > 0 ? (
                  <>
                    <rect
                      x={x(i)}
                      y={yCima(d.quantidade)}
                      width={larguraBarra}
                      height={alturaEntrada}
                      rx={2}
                      className="fill-violet-500"
                      pointerEvents="none"
                    />
                    <text
                      x={x(i) + larguraBarra / 2}
                      y={yCima(d.quantidade) - 4}
                      textAnchor="middle"
                      className="fill-violet-700 text-[9px] font-semibold dark:fill-violet-300"
                      pointerEvents="none"
                    >
                      {curto(d.quantidade)}
                    </text>
                  </>
                ) : null}

                {d.vendido > 0 ? (
                  <>
                    <rect
                      x={x(i)}
                      y={zero}
                      width={larguraBarra}
                      height={hSaida}
                      rx={2}
                      className="fill-emerald-500"
                      pointerEvents="none"
                    />
                    <text
                      x={x(i) + larguraBarra / 2}
                      y={zero + hSaida + 9}
                      textAnchor="middle"
                      className="fill-emerald-700 text-[9px] font-semibold dark:fill-emerald-300"
                      pointerEvents="none"
                    >
                      {curto(d.vendido)}
                    </text>
                  </>
                ) : null}

                {/* Dia sem nada ganha um traço no zero em vez do vazio: mostra
                    que o dia existe e não teve movimento, que é diferente de o
                    dia não estar no gráfico. */}
                {parado ? (
                  <rect
                    x={x(i)}
                    y={zero - 1}
                    width={larguraBarra}
                    height={1}
                    className="fill-border"
                    pointerEvents="none"
                  />
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
                pointerEvents="none"
              >
                {d.dia}
              </text>
            ))}
        </svg>
      </div>

      {/* O detalhe fica abaixo do gráfico, em altura fixa, em vez de flutuar
          sobre as barras: uma caixa que segue o mouse tapa justamente as barras
          vizinhas que se está comparando, e o pulo de layout ao aparecer e
          sumir é pior que a distância até aqui. */}
      <div className="min-h-[76px] rounded-md border bg-muted/20 p-2.5 text-xs">
        {diaAtivo === null ? (
          <p className="text-muted-foreground">
            Passe o mouse sobre um dia para ver a abertura por CD.
          </p>
        ) : (
          <div className="space-y-1.5">
            <p className="font-medium">{`Dia ${diaAtivo.dia}`}</p>
            {diaAtivo.entradasPorCd.length === 0 && diaAtivo.vendasPorCd.length === 0 ? (
              <p className="text-muted-foreground">Sem movimento neste dia.</p>
            ) : null}
            {diaAtivo.entradasPorCd.length > 0 ? (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="flex items-center gap-1.5 text-violet-700 dark:text-violet-400">
                  <span className="size-2.5 rounded-[2px] bg-violet-500" />
                  {`+${num(diaAtivo.quantidade)} entrada`}
                </span>
                {diaAtivo.entradasPorCd.map((c) => (
                  <span key={c.filial} className="rounded bg-violet-500/10 px-1.5 py-0.5 font-mono">
                    {`${rotulo(c.filial)} ${num(c.quantidade)}`}
                    <span className="ml-1 text-muted-foreground">{`(${c.notas} NF)`}</span>
                  </span>
                ))}
              </p>
            ) : null}
            {diaAtivo.vendasPorCd.length > 0 ? (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                  <span className="size-2.5 rounded-[2px] bg-emerald-500" />
                  {`−${num(diaAtivo.vendido)} venda`}
                </span>
                {diaAtivo.vendasPorCd.map((c) => (
                  <span
                    key={c.filial}
                    className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono"
                  >
                    {`${rotulo(c.filial)} ${num(c.quantidade)}`}
                  </span>
                ))}
              </p>
            ) : null}
          </div>
        )}
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
