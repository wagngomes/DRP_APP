"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronDown, ChevronRight, Warehouse } from "lucide-react";

import type { CelulaDia, LinhaFornecedor, LinhaProduto } from "@/lib/recebimentos/consultas";

/**
 * Grade de recebimentos: fornecedor por linha, dia por coluna.
 *
 * Componente cliente por causa da dica que segue o cursor. O `title` nativo
 * daria o texto, mas não a abertura por CD em forma de tabela — e é ela que
 * responde "de onde veio esse número", que era o motivo de existir a dica.
 */

const AZUL = "text-sky-600 dark:text-sky-400";

/**
 * Abreviação no padrão americano: K, M, B.
 *
 * Um mês passa de um bilhão de reais e não há largura para o número cheio em
 * 31 colunas. O valor exato fica na dica — a abreviação serve para ler o
 * padrão, não para conferir contabilidade.
 */
function curto(v: number): string {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toFixed(0);
}

function moeda(v: number): string {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function inteiro(v: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/**
 * Intensidade do fundo, proporcional ao maior valor da tela.
 *
 * Raiz quadrada e não linear: o maior valor é ordens de grandeza acima da
 * mediana, e numa escala linear todo o resto viraria o mesmo tom quase branco.
 */
function intensidade(valor: number, maximo: number): number {
  if (valor <= 0 || maximo <= 0) return 0;
  return Math.min(1, Math.sqrt(valor / maximo));
}

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Data em UTC: o dia do mês é rótulo, não instante — fuso aqui só atrapalha. */
function diaSemanaIndice(mes: string, dia: number): number {
  const [ano, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(ano, m - 1, dia)).getUTCDay();
}

function diaDaSemana(mes: string, dia: number): string {
  return SEMANA[diaSemanaIndice(mes, dia)];
}

function ehFimDeSemana(mes: string, dia: number): boolean {
  const d = diaSemanaIndice(mes, dia);
  return d === 0 || d === 6;
}

type Dica = {
  titulo: string;
  dia: number;
  celula: CelulaDia;
  x: number;
  y: number;
};

export function GradeRecebimentos({
  linhas,
  produtos,
  colunas,
  mes,
  maximo,
  fornecedorAberto,
  href,
  cdAtivo,
}: {
  linhas: LinhaFornecedor[];
  produtos: LinhaProduto[];
  colunas: number[];
  /** Mês em yyyy-mm, para saber qual coluna é fim de semana. */
  mes: string;
  maximo: number;
  fornecedorAberto?: string;
  /** URL de cada linha, já montada no servidor — função não atravessa a fronteira. */
  href: Record<string, string>;
  /** Rótulo do CD escolhido no filtro da página, quando há um. */
  cdAtivo?: string;
}) {
  const [dica, setDica] = useState<Dica | null>(null);

  const mapaDias = (lista: CelulaDia[]) => new Map(lista.map((d) => [d.dia, d]));

  /** Célula de valor, com a dica e o fundo proporcional. */
  function Celula({
    c,
    titulo,
    dia,
    pintar,
    pequena,
  }: {
    c: CelulaDia | undefined;
    titulo: string;
    dia: number;
    pintar: boolean;
    pequena?: boolean;
  }) {
    const fds = ehFimDeSemana(mes, dia);
    // Risco vertical na segunda-feira: dá ritmo semanal a uma faixa de 31
    // colunas iguais, e é o que permite achar "a terceira semana" sem contar.
    const inicioSemana = diaSemanaIndice(mes, dia) === 1 ? "border-l border-l-border" : "";
    if (!c) {
      // Vazio, não zero: com 31 colunas um mar de zeros esconde o movimento.
      return (
        <td className={`border-b border-border/40 p-1 ${inicioSemana} ${fds ? "bg-muted/30" : ""}`} />
      );
    }
    return (
      <td
        onMouseMove={(e) => setDica({ titulo, dia, celula: c, x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setDica(null)}
        className={`cursor-default border-b border-border/40 p-1 text-center font-mono tabular-nums transition-[filter] hover:brightness-95 ${inicioSemana} ${
          pequena ? "text-[10px]" : "text-[11px]"
        }`}
        style={
          pintar
            ? {
                background: `color-mix(in srgb, var(--brand-turquoise) ${
                  intensidade(c.valor, maximo) * 65
                }%, transparent)`,
              }
            : undefined
        }
      >
        <span className="block font-semibold">{curto(c.valor)}</span>
        <span className={`block text-[9px] font-bold ${AZUL}`}>{inteiro(c.quantidade)}</span>
      </td>
    );
  }

  return (
    <>
      {/* A rolagem é inevitável com 31 dias. O que a torna utilizável é o que
          fica parado: o cabeçalho ao descer, a coluna do fornecedor ao ir para
          o lado. Sem os dois, no dia 25 da centésima linha não se sabe mais nem
          que dia é nem de quem. */}
      <div className="max-h-[70vh] overflow-auto rounded-xl border">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-30 min-w-56 border-b bg-background p-2.5 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Fornecedor
              </th>
              {colunas.map((d) => {
                // Fim de semana em tom apagado: explica a coluna vazia sem
                // legenda nenhuma. Sem isso, sete brancos espalhados pelo mês
                // parecem falha de dado.
                const fds = ehFimDeSemana(mes, d);
                return (
                  <th
                    key={d}
                    className={`sticky top-0 z-20 min-w-16 border-b bg-background p-1.5 text-center font-mono text-xs font-semibold tabular-nums ${
                      diaSemanaIndice(mes, d) === 1 ? "border-l border-l-border" : ""
                    } ${fds ? "text-muted-foreground/40" : "text-foreground"}`}
                  >
                    <span className="block">{d}</span>
                    <span className="block text-[9px] font-normal text-muted-foreground/60">
                      {diaDaSemana(mes, d)}
                    </span>
                  </th>
                );
              })}
              <th className="sticky top-0 z-20 min-w-28 border-b border-l-2 border-l-(--brand-turquoise) bg-background p-2.5 text-right text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const aberto = fornecedorAberto === l.fornecedor;
              const mapa = mapaDias(l.dias);
              return [
                <tr
                  key={l.fornecedor}
                  className={`group ${aberto ? "bg-muted/60" : "hover:bg-muted/30"}`}
                >
                  <td className="sticky left-0 z-10 border-b border-border/40 bg-background p-0 group-hover:bg-muted/30">
                    <Link
                      href={href[l.fornecedor]}
                      scroll={false}
                      className={`flex items-center gap-1.5 p-2.5 font-medium ${
                        aberto ? "bg-muted/60" : ""
                      }`}
                    >
                      {aberto ? (
                        <ChevronDown className="size-3.5 shrink-0 text-(--brand-turquoise)" />
                      ) : (
                        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">{l.fornecedor}</span>
                    </Link>
                  </td>
                  {colunas.map((d) => (
                    <Celula
                      key={d}
                      c={mapa.get(d)}
                      titulo={l.fornecedor}
                      dia={d}
                      pintar
                    />
                  ))}
                  <td className="border-b border-border/40 border-l-2 border-l-(--brand-turquoise)/40 p-2.5 text-right font-mono tabular-nums">
                    <span className="block text-xs font-bold">{curto(l.total)}</span>
                    <span className={`block text-[10px] font-bold ${AZUL}`}>
                      {inteiro(l.quantidadeTotal)}
                    </span>
                  </td>
                </tr>,

                /* Segundo nível: os produtos, na mesma grade de dias — manter a
                   leitura na mesma direção permite descer a coluna de um dia do
                   total até o item que o explica. */
                ...(aberto
                  ? produtos.map((p) => {
                      const mp = mapaDias(p.dias);
                      return (
                        <tr key={`${l.fornecedor}-${p.codigo}`} className="bg-muted/20">
                          <td className="sticky left-0 z-10 border-b border-border/40 bg-muted/40 p-2 pl-8">
                            <Link
                              href={`/produto/${encodeURIComponent(p.codigo)}`}
                              className="font-mono text-xs font-semibold text-(--brand-petrol) underline underline-offset-2 dark:text-(--brand-turquoise)"
                            >
                              {p.codigo}
                            </Link>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {p.descricao ?? "—"}
                            </span>
                          </td>
                          {colunas.map((d) => (
                            <Celula
                              key={d}
                              c={mp.get(d)}
                              titulo={`${p.codigo} · ${p.descricao ?? ""}`}
                              dia={d}
                              pintar={false}
                              pequena
                            />
                          ))}
                          <td className="border-b border-border/40 border-l-2 border-l-(--brand-turquoise)/40 p-2 text-right font-mono tabular-nums">
                            <span className="block text-[11px] font-semibold">
                              {curto(p.total)}
                            </span>
                            <span className={`block text-[10px] font-bold ${AZUL}`}>
                              {inteiro(p.quantidadeTotal)}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  : []),
              ];
            })}
          </tbody>
        </table>
      </div>

      {dica ? <DicaFlutuante dica={dica} cdAtivo={cdAtivo} /> : null}
    </>
  );
}

/**
 * A dica, fora da árvore da tabela.
 *
 * Por portal porque a tabela rola e tem `overflow` — dentro dela, a dica seria
 * cortada na borda ou empurraria a própria célula. Posicionada pelo cursor, e
 * deslocada para a esquerda quando está perto da borda direita da janela.
 */
function DicaFlutuante({ dica, cdAtivo }: { dica: Dica; cdAtivo?: string }) {
  if (typeof document === "undefined") return null;

  const perto = dica.x > window.innerWidth - 280;

  return createPortal(
    <div
      className="pointer-events-none fixed z-50 w-64 rounded-lg border bg-popover p-3 text-xs shadow-lg"
      style={{
        left: perto ? dica.x - 272 : dica.x + 16,
        top: Math.min(dica.y + 16, window.innerHeight - 140),
      }}
    >
      <p className="truncate font-semibold text-(--brand-petrol) dark:text-foreground">
        {dica.titulo}
      </p>
      <p className="mt-0.5 text-muted-foreground">{`Dia ${dica.dia}`}</p>

      <div className="mt-2 flex items-baseline justify-between border-b pb-1.5">
        <span className="font-mono font-bold">{moeda(dica.celula.valor)}</span>
        <span className={`font-mono font-bold ${AZUL}`}>
          {`${inteiro(dica.celula.quantidade)} un`}
        </span>
      </div>

      {/* O recorte de CD vem do filtro da página, não da célula: escolhido um
          CD, todo número da tela já é dele, e repetir aqui seria ruído. */}
      <p className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
        <Warehouse className="size-3 shrink-0" />
        {cdAtivo ? `Somente ${cdAtivo}` : "Todos os CDs"}
      </p>
    </div>,
    document.body
  );
}
