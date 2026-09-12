"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import type { ContagemFaixa } from "@/lib/disponibilidade/consultas";
import { FILIAL_CIA } from "@/lib/disponibilidade/constantes";
import { FAIXAS, type FaixaId } from "@/utils/dias-estoque";
import { inteiro } from "@/lib/visao-geral/formato";

/** Abaixo disso o rótulo de percentual não cabe dentro do segmento. */
const ALTURA_MINIMA_ROTULO = 0.07;
/**
 * Altura mínima de um segmento, em pixels. Sem isto, uma faixa com poucos itens
 * vira uma linha de meio pixel: some da tela e não dá para acertar o mouse nela.
 * Distorce a proporção em alguns pixels, mas é o que torna a fatia curta
 * consultável — que é justamente onde o tooltip importa.
 */
const ALTURA_MINIMA_PX = 5;

/** Conteúdo do tooltip, junto da posição do cursor. */
type Dica = {
  chave: string;
  titulo: string;
  faixa: string;
  detalhe: string;
  x: number;
  y: number;
};

export function GraficoFaixas({
  contagens,
  filialAtiva,
  faixaAtiva,
  curvaAtiva,
  curva,
  bu,
  cia,
  fornecedor,
}: {
  contagens: ContagemFaixa[];
  filialAtiva?: string;
  faixaAtiva?: FaixaId;
  curvaAtiva?: string;
  /** Curva deste gráfico — vai junto no clique para a tabela filtrar certo. */
  curva: string;
  /** BU da guia ativa — mantida no clique para o recorte não se perder. */
  bu?: string;
  /** Somatório das posições item × CD da curva, sem abertura por filial. */
  cia: Map<FaixaId, number>;
  fornecedor?: string;
}) {
  const [dica, setDica] = useState<Dica | null>(null);
  const router = useRouter();
  const hover = dica?.chave ?? null;

  const porCd = new Map<string, Map<FaixaId, number>>();
  for (const c of contagens) {
    const mapa = porCd.get(c.filial) ?? new Map<FaixaId, number>();
    mapa.set(c.faixa, (mapa.get(c.faixa) ?? 0) + c.itens);
    porCd.set(c.filial, mapa);
  }

  // CDs ordenados por volume: o leitor encontra os relevantes primeiro.
  const cds = [...porCd.entries()]
    .map(([filial, mapa]) => ({
      filial,
      mapa,
      total: [...mapa.values()].reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => b.total - a.total);

  const totalCia = [...cia.values()].reduce((a, b) => a + b, 0);

  function selecionar(filial: string, faixa: FaixaId) {
    const params = new URLSearchParams();
    if (fornecedor) params.set("fornecedor", fornecedor);
    if (bu) params.set("bu", bu);
    // Clicar de novo no mesmo segmento fecha a tabela.
    if (!(filialAtiva === filial && faixaAtiva === faixa && curvaAtiva === curva)) {
      params.set("filial", filial);
      params.set("faixa", faixa);
      params.set("curva", curva);
    }
    const qs = params.toString();
    // `scroll: false`: por padrão o App Router rola para o topo a cada
    // navegação, e aqui a "navegação" é só abrir a tabela ao lado da barra —
    // jogar o leitor para o topo faria ele perder de vista o que clicou.
    router.push(qs ? `/disponibilidade?${qs}` : "/disponibilidade", { scroll: false });
  }

  function coluna({
    chaveCd,
    rotulo,
    mapa,
    total,
    destaque,
  }: {
    chaveCd: string;
    rotulo: string;
    mapa: Map<FaixaId, number>;
    total: number;
    destaque?: boolean;
  }) {
    if (total === 0) return null;
    return (
      <div
        key={chaveCd}
        className="flex min-w-0 flex-1 flex-col items-center gap-1 md:w-16 md:flex-none md:gap-1.5"
      >
        {/* O total some no celular: com as colunas dividindo a largura da tela,
            sobra menos de 15px por barra e "1.234" não cabe de jeito nenhum.
            
            A dica que aparece no desktop depende de `onMouseMove`, que não
            existe no toque — então no celular o número vem pelo caminho
            natural dali: tocar na faixa filtra a tabela abaixo, que lista os
            itens daquele CD naquela faixa. */}
        <span
          className={`hidden font-mono text-xs font-medium tabular-nums md:block ${
            destaque
              ? "text-(--brand-turquoise)"
              : "text-(--brand-petrol) dark:text-foreground"
          }`}
        >
          {inteiro(total)}
        </span>

        {/* flex-col-reverse: a severidade cresce de baixo para cima, então
            a primeira faixa (sem estoque) fica na base da coluna. */}
        <div className="flex h-72 w-full flex-col-reverse gap-[1px] overflow-hidden rounded-[3px] md:h-96 md:gap-[2px] md:rounded-[4px]">
          {FAIXAS.map((faixa) => {
            const itens = mapa.get(faixa.id) ?? 0;
            if (itens === 0) return null;
            const fracao = itens / total;

            const chave = `${chaveCd}-${faixa.id}`;
            const selecionado =
              filialAtiva === chaveCd && faixaAtiva === faixa.id && curvaAtiva === curva;
            const outroSelecionado = Boolean(filialAtiva) && !selecionado;

            return (
              <button
                key={chave}
                type="button"
                onClick={() => selecionar(chaveCd, faixa.id)}
                onMouseMove={(e) =>
                  setDica({
                    chave,
                    titulo: destaque ? "Visão Cia (todos os CDs)" : `CD ${rotulo}`,
                    faixa: faixa.rotulo,
                    detalhe: `${inteiro(itens)} ${destaque ? "posições" : "itens"} · ${(fracao * 100).toFixed(1)}%`,
                    x: e.clientX,
                    y: e.clientY,
                  })
                }
                onMouseLeave={() => setDica(null)}
                aria-label={`Curva ${curva}, ${rotulo}, ${faixa.rotulo}, ${itens} itens`}
                className="relative flex w-full cursor-pointer items-center justify-center transition-opacity"
                style={{
                  height: `${fracao * 100}%`,
                  minHeight: `${ALTURA_MINIMA_PX}px`,
                  background: `var(--faixa-${faixa.id})`,
                  opacity: outroSelecionado ? 0.35 : 1,
                  outline: selecionado ? "2px solid var(--brand-petrol)" : undefined,
                  outlineOffset: "-2px",
                  filter: hover === chave ? "brightness(1.15)" : undefined,
                }}
              >
                {fracao >= ALTURA_MINIMA_ROTULO ? (
                  <span
                    className="pointer-events-none hidden text-[10px] font-semibold tabular-nums md:inline"
                    /* Tinta por faixa: o amarelo puro exige texto escuro. */
                    style={{
                      color: `var(--faixa-${faixa.id}-ink)`,
                      textShadow: `var(--faixa-${faixa.id}-sombra)`,
                    }}
                  >
                    {`${Math.round(fracao * 100)}%`}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Na vertical no celular: "1006" na horizontal precisa de ~28px e a
            coluna tem metade disso. Girado, continua legível e mantém a ligação
            entre barra e CD — sem ele o gráfico viraria um desenho anônimo. */}
        <span
          className={`font-mono text-[10px] [writing-mode:vertical-rl] md:text-xs md:[writing-mode:horizontal-tb] ${
            destaque ? "font-semibold text-(--brand-turquoise)" : "text-muted-foreground"
          }`}
        >
          {rotulo}
        </span>
      </div>
    );
  }

  return (
    <div>
      {/* `min-w-max` só a partir de `md`: no desktop garante a largura fixa das
          colunas e a rolagem horizontal quando há CDs demais; no celular ele é
          justamente o que forçava a rolagem, então sai e as colunas dividem a
          largura disponível. */}
      <div className="overflow-x-auto pb-2">
        <div className="flex items-end gap-px md:min-w-max md:gap-3">
          {/* Visão da empresa: empilha as posições item × CD de todos os CDs,
              cada uma na faixa do seu próprio CD — o total desta coluna é a
              soma dos totais das demais. Fica à esquerda, separada, como
              referência para a leitura das outras. */}
          <div className="mr-1 flex items-end border-r pr-1 md:mr-6 md:gap-3 md:pr-6">
            {coluna({
              chaveCd: FILIAL_CIA,
              rotulo: "Cia",
              mapa: cia,
              total: totalCia,
              destaque: true,
            })}
          </div>
          {cds.map((cd) =>
            coluna({ chaveCd: cd.filial, rotulo: cd.filial, mapa: cd.mapa, total: cd.total })
          )}
        </div>
      </div>

      {/* Renderizado em `document.body` via portal, e não aqui dentro.
          Dois motivos: o `overflow-hidden` das barras e o `overflow-x-auto` do
          scroll recortavam o tooltip, e um elemento a mais dentro do gráfico
          mexia no fluxo do bloco a cada movimento do mouse — era o que fazia a
          área abaixo "pular". Fora da árvore, ele não pode afetar layout
          nenhum, nem ser capturado por transform/filter de algum ancestral. */}
      {dica ? createPortal(<Tooltip dica={dica} />, document.body) : null}
    </div>
  );
}

function Tooltip({ dica }: { dica: Dica }) {
  // Perto da borda direita o tooltip vira para a esquerda do cursor.
  const larguraEstimada = 200;
  const viraEsquerda =
    typeof window !== "undefined" && dica.x + larguraEstimada + 24 > window.innerWidth;

  return (
    <div
      className="pointer-events-none fixed z-50 w-max max-w-56 rounded-md border bg-popover px-3 py-2 text-left text-xs shadow-md"
      style={{
        left: dica.x + (viraEsquerda ? -12 : 12),
        top: dica.y + 12,
        transform: viraEsquerda ? "translateX(-100%)" : undefined,
      }}
    >
      <p className="font-medium">{dica.titulo}</p>
      <p className="text-muted-foreground">{dica.faixa}</p>
      <p className="text-muted-foreground">{dica.detalhe}</p>
    </div>
  );
}
