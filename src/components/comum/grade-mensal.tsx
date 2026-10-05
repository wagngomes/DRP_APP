"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Warehouse,
} from "lucide-react";

/**
 * Grade mensal de dois níveis: grupo por linha, dia por coluna.
 *
 * Nasceu na tela de recebimentos e foi extraída quando a de colocação de
 * pedidos precisou da mesma leitura. As duas olham pontas opostas do mesmo
 * ciclo — o que foi pedido e o que chegou — e mostrar uma diferente da outra
 * seria um obstáculo gratuito para quem compara as duas.
 *
 * Os tipos são definidos aqui, e não importados de um módulo de consulta: a
 * grade não deve conhecer a origem dos números, e importar de `recebimentos`
 * amarraria a tela de colocação àquele domínio sem motivo.
 *
 * Componente cliente por causa da dica que segue o cursor. O `title` nativo
 * daria o texto, mas não a abertura em forma de tabela — e é ela que responde
 * "de onde veio esse número", que era o motivo de existir a dica.
 */

export type CelulaDia = { dia: number; valor: number; quantidade: number };

/** Ícones aceitos no pé da dica, por nome. */
export type IconeRodape = "armazem" | "pedido";

const ICONES = { armazem: Warehouse, pedido: ClipboardList } as const;

/** Primeiro nível: o que cada linha agrupa. */
export type LinhaGrupo = {
  /** Identifica a linha e é a chave do mapa de URLs. */
  chave: string;
  rotulo: string;
  dias: CelulaDia[];
  total: number;
  quantidadeTotal: number;
  /** Até dois contadores de apoio, exibidos ao lado do nome. */
  apoio?: string;
};

/** Segundo nível: o detalhe que abre sob a linha. */
export type LinhaDetalhe = {
  chave: string;
  rotulo: string;
  descricao: string | null;
  dias: CelulaDia[];
  total: number;
  quantidadeTotal: number;
};

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

export function GradeMensal({
  linhas,
  produtos,
  colunas,
  mes,
  maximo,
  fornecedorAberto,
  href,
  rodapeDica,
}: {
  linhas: LinhaGrupo[];
  produtos: LinhaDetalhe[];
  colunas: number[];
  /** Mês em yyyy-mm, para saber qual coluna é fim de semana. */
  mes: string;
  maximo: number;
  fornecedorAberto?: string;
  /** URL de cada linha, já montada no servidor — função não atravessa a fronteira. */
  href: Record<string, string>;
  /**
   * Linha de contexto no pé da dica: o recorte que vale para aquele número.
   *
   * O ícone vem como **nome**, não como componente. Componente é função, e
   * função não atravessa a fronteira servidor→cliente: passá-lo daqui derrubava
   * a página inteira com erro de servidor, sem mensagem útil. O mapa fica deste
   * lado, que é onde o React já está.
   */
  rodapeDica?: { icone: IconeRodape; texto: string };
}) {
  const [dica, setDica] = useState<Dica | null>(null);

  const mapaDias = (lista: CelulaDia[]) =>
    new Map(lista.map((d) => [d.dia, d]));

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
    const inicioSemana =
      diaSemanaIndice(mes, dia) === 1 ? "border-l border-l-border" : "";
    if (!c) {
      // Vazio, não zero: com 31 colunas um mar de zeros esconde o movimento.
      return (
        <td
          className={`border-b border-border/40 p-1 ${inicioSemana} ${fds ? "bg-muted/30" : ""}`}
        />
      );
    }
    return (
      <td
        onMouseMove={(e) =>
          setDica({ titulo, dia, celula: c, x: e.clientX, y: e.clientY })
        }
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
        <span className={`block text-[9px] font-bold ${AZUL}`}>
          {inteiro(c.quantidade)}
        </span>
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
              {/* `w-56` e não `min-w-56`: a coluna do total fica presa em
                  `left-56`, e um deslocamento fixo só funciona se a largura da
                  coluna anterior também for fixa. */}
              <th className="sticky top-0 left-0 z-30 w-56 min-w-56 border-b bg-background p-2.5 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Fornecedor
              </th>
              {/* O total vem antes dos dias: é o número que se procura primeiro,
                  e no fim da linha exigia rolar 31 colunas para lê-lo. Fixo
                  junto com o fornecedor, senão sumiria na rolagem e o ganho de
                  tê-lo movido se perderia. */}
              <th className="sticky top-0 left-56 z-30 w-28 min-w-28 border-r-2 border-b border-r-(--brand-turquoise) bg-background p-2.5 text-right text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Total
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
                      diaSemanaIndice(mes, d) === 1
                        ? "border-l border-l-border"
                        : ""
                    } ${fds ? "text-muted-foreground/40" : "text-foreground"}`}
                  >
                    <span className="block">{d}</span>
                    <span className="block text-[9px] font-normal text-muted-foreground/60">
                      {diaDaSemana(mes, d)}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const aberto = fornecedorAberto === l.chave;
              const mapa = mapaDias(l.dias);
              return [
                <tr
                  key={l.chave}
                  className={`group ${aberto ? "bg-muted/60" : "hover:bg-muted/30"}`}
                >
                  <td className="sticky left-0 z-10 border-b border-border/40 bg-background p-0 group-hover:bg-muted/30">
                    <Link
                      href={href[l.chave]}
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
                      <span className="truncate">{l.rotulo}</span>
                      {l.apoio ? (
                        <span className="shrink-0 text-[10px] font-normal text-muted-foreground">
                          {l.apoio}
                        </span>
                      ) : null}
                    </Link>
                  </td>
                  <td className="sticky left-56 z-10 border-r-2 border-b border-border/40 border-r-(--brand-turquoise)/40 bg-background p-2.5 text-right font-mono tabular-nums group-hover:bg-muted/30">
                    <span className="block text-xs font-bold">
                      {curto(l.total)}
                    </span>
                    <span className={`block text-[10px] font-bold ${AZUL}`}>
                      {inteiro(l.quantidadeTotal)}
                    </span>
                  </td>
                  {colunas.map((d) => (
                    <Celula
                      key={d}
                      c={mapa.get(d)}
                      titulo={l.rotulo}
                      dia={d}
                      pintar
                    />
                  ))}
                </tr>,

                /* Segundo nível: os produtos, na mesma grade de dias — manter a
                   leitura na mesma direção permite descer a coluna de um dia do
                   total até o item que o explica. */
                ...(aberto
                  ? produtos.map((p) => {
                      const mp = mapaDias(p.dias);
                      return (
                        <tr
                          key={`${l.chave}-${p.chave}`}
                          className="bg-muted/20"
                        >
                          <td className="sticky left-0 z-10 border-b border-border/40 bg-muted/40 p-2 pl-8">
                            <Link
                              href={`/produto/${encodeURIComponent(p.chave)}`}
                              className="font-mono text-xs font-semibold text-(--brand-petrol) underline underline-offset-2 dark:text-(--brand-turquoise)"
                            >
                              {p.rotulo}
                            </Link>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {p.descricao ?? "—"}
                            </span>
                          </td>
                          <td className="sticky left-56 z-10 border-r-2 border-b border-border/40 border-r-(--brand-turquoise)/40 bg-muted/40 p-2 text-right font-mono tabular-nums">
                            <span className="block text-[11px] font-semibold">
                              {curto(p.total)}
                            </span>
                            <span
                              className={`block text-[10px] font-bold ${AZUL}`}
                            >
                              {inteiro(p.quantidadeTotal)}
                            </span>
                          </td>
                          {colunas.map((d) => (
                            <Celula
                              key={d}
                              c={mp.get(d)}
                              titulo={`${p.chave} · ${p.descricao ?? ""}`}
                              dia={d}
                              pintar={false}
                              pequena
                            />
                          ))}
                        </tr>
                      );
                    })
                  : []),
              ];
            })}
          </tbody>
        </table>
      </div>

      {dica ? <DicaFlutuante dica={dica} rodape={rodapeDica} /> : null}
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
function DicaFlutuante({
  dica,
  rodape,
}: {
  dica: Dica;
  rodape?: { icone: IconeRodape; texto: string };
}) {
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
        {rodape ? <Icone nome={rodape.icone} /> : null}
        {rodape?.texto ?? ""}
      </p>
    </div>,
    document.body,
  );
}

function Icone({ nome }: { nome: IconeRodape }) {
  const C = ICONES[nome];
  return <C className="size-3 shrink-0" />;
}
