"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ShoppingCart, Truck } from "lucide-react";

import type { CelulaTabela, DadosTabela } from "@/lib/disponibilidade/tabela";
import { Abertura } from "@/components/comum/abertura";
import type { Reposicao } from "@/lib/fornecedores/agregacao";
import {
  COLUNA_CIA,
  COLUNAS_ESTOQUE_CHAO,
  ROTULO_ARMAZEM,
} from "@/utils/dias-estoque";

/**
 * A grade item × CD, no formato de tabela periódica.
 *
 * Cada posição é um "elemento", e os quatro números ocupam os lugares que a
 * tabela periódica consagrou — não por enfeite, mas porque a convenção já ensina
 * onde olhar: o grande no meio é o que identifica, o canto superior é o índice, o
 * rodapé é a massa.
 *
 *   dias de chão      no lugar do símbolo    (o número que decide)
 *   dias totais       no lugar do número     (canto superior)
 *   estoque de chão   no lugar do nome       (abaixo)
 *   % do forecast     no lugar da massa      (rodapé)
 *
 * A cor vem da faixa de cobertura, como no gráfico de disponibilidade — mesma
 * escala, definida num lugar só no CSS, para quem passa de uma tela à outra não
 * reaprender.
 */

/**
 * Separação da coluna Cia das filiais.
 *
 * Tracejado claro em vez de borda cheia, e folga de `pr-3` contra o
 * `border-spacing-1` das demais — o dobro do espaço, para a coluna ler como
 * outra coisa sem precisar de título ou moldura.
 */
function separador(ehCia: boolean): string {
  return ehCia ? "border-r border-dashed border-muted-foreground/25 pr-3" : "";
}

function num(v: number): string {
  return Math.round(v).toLocaleString("pt-BR");
}

/** 314.684 vira "315k": a célula tem três centímetros. */
function curto(v: number): string {
  const n = Math.round(v);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1).replace(".", ",")}k`;
  return String(n);
}

function dias(v: number): string {
  if (!Number.isFinite(v)) return "∞";
  return v >= 100 ? "99+" : String(Math.round(v));
}

function dataBr(d: Date | string): string {
  const data = typeof d === "string" ? new Date(d) : d;
  return data.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/** O painel que abre ao passar o mouse. */
function Detalhe({
  celula: c,
  descricao,
  sigla,
  chegadas,
}: {
  celula: CelulaTabela;
  descricao: string | null;
  sigla: (codigo: string) => string;
  chegadas: Reposicao[];
}) {
  const aCaminho = chegadas.reduce((a, r) => a + r.quantidade, 0);
  const armazens = COLUNAS_ESTOQUE_CHAO.map((coluna) => ({
    rotulo: ROTULO_ARMAZEM[coluna],
    quantidade: c.porArmazem[coluna] ?? 0,
  }));

  return (
    <div className="w-72 space-y-2.5 text-left sm:w-80">
      <div>
        <p className="font-mono text-xs text-muted-foreground">{`${c.codigo} · ${sigla(c.filial)}`}</p>
        <p className="text-sm leading-tight font-medium">{descricao ?? "—"}</p>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <Campo
          rotulo="Estoque chão"
          valor={num(c.estoqueChao)}
          tom={TOM.estoque}
          destaque
        />
        <Campo
          rotulo="Estoque total"
          valor={num(c.estoqueTotal)}
          tom={TOM.estoque}
        />
        <Campo
          rotulo="Cobertura chão"
          valor={`${dias(c.diasChao)} dias`}
          destaque
        />
        <Campo rotulo="Cobertura total" valor={`${dias(c.diasTotal)} dias`} />
        <Campo
          rotulo="Forecast do mês"
          valor={num(c.forecast)}
          tom={TOM.previsao}
        />
        <Campo
          rotulo="Vendido no mês"
          valor={`${num(c.vendido)}${
            c.percentualVendido === null
              ? ""
              : ` · ${Math.round(c.percentualVendido * 100)}%`
          }`}
          tom={TOM.previsao}
        />
      </div>

      {/* O chão aberto por armazém, no mesmo formato do card da tela de
          produto — e literalmente o mesmo componente, para as duas não
          divergirem no primeiro ajuste de qualquer uma.

          Todos os armazéns aparecem, inclusive os zerados: saber que não há
          nada em Q40 é diferente de não saber quanto há. */}
      <div>
        <Abertura itens={armazens} tom={TOM.estoque} />
        <p className="mt-1 text-center text-[10px] text-muted-foreground">
          chão por armazém
        </p>
      </div>

      {/* O que vem chegando, com o percurso. É a diferença entre "está baixo" e
          "está baixo e ninguém mandou nada". */}
      <div className="border-t pt-2">
        <p className="flex items-center justify-between text-xs font-medium">
          <span>A caminho</span>
          <span className="font-mono tabular-nums">
            {chegadas.length === 0 ? "nada" : `${num(aCaminho)} un`}
          </span>
        </p>

        {chegadas.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Nenhum pedido ou transferência previsto para este CD.
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {chegadas.slice(0, 4).map((r, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs">
                {r.origem === "compra" ? (
                  <ShoppingCart className="mt-0.5 size-3 shrink-0 text-amber-600" />
                ) : (
                  <Truck className="mt-0.5 size-3 shrink-0 text-teal-600" />
                )}
                <span className="min-w-0">
                  <span
                    className={`font-mono font-medium tabular-nums ${
                      r.origem === "compra" ? TOM.compra : TOM.transferencia
                    }`}
                  >
                    {num(r.quantidade)}
                  </span>
                  <span className="text-muted-foreground">{` · ${dataBr(r.chegada)}`}</span>
                  {r.reprojetada ? (
                    <span className="text-amber-600 dark:text-amber-400">
                      {" "}
                      (reprojetada)
                    </span>
                  ) : null}
                  {/* O percurso em siglas: a rota explica por que a data é
                      aquela, e sem ela o número de dias parece arbitrário. */}
                  {r.etapas.length > 0 ? (
                    <span className="block font-mono text-[10px] text-muted-foreground">
                      {[r.etapas[0].de, ...r.etapas.map((e) => e.para)]
                        .map(sigla)
                        .join(" › ")}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
            {chegadas.length > 4 ? (
              <li className="text-xs text-muted-foreground">{`+${chegadas.length - 4} chegada(s)`}</li>
            ) : null}
          </ul>
        )}
      </div>

      <Link
        href={`/produto/${c.codigo}`}
        className="block text-xs text-(--brand-petrol) underline-offset-2 hover:underline dark:text-(--brand-turquoise)"
      >
        Abrir o produto →
      </Link>
    </div>
  );
}

/**
 * Cores por natureza do número, e não por status.
 *
 * As mesmas do resto do sistema: turquesa é o que está parado no CD, âmbar é
 * previsão e compra, teal é transferência em curso. Quem vem da tela de
 * triangulações já conhece as duas últimas, e não precisa reaprender aqui.
 */
const TOM = {
  estoque: "text-(--brand-petrol) dark:text-(--brand-turquoise)",
  previsao: "text-amber-700 dark:text-amber-400",
  transferencia: "text-teal-700 dark:text-teal-300",
  compra: "text-amber-700 dark:text-amber-400",
} as const;

function Campo({
  rotulo,
  valor,
  destaque,
  tom,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
  /** Classe de cor pela natureza do número — estoque, previsão, reposição. */
  tom?: string;
}) {
  return (
    <span>
      <span className="block text-[10px] text-muted-foreground">{rotulo}</span>
      <span
        className={`font-mono tabular-nums ${destaque ? "font-semibold" : ""} ${tom ?? ""}`}
      >
        {valor}
      </span>
    </span>
  );
}

export function TabelaPeriodica({
  dados,
  rotulos,
  chegadas,
}: {
  dados: DadosTabela;
  rotulos: Record<string, string>;
  /** Chave "codigo|filial" para as reposições previstas. */
  chegadas: Record<string, Reposicao[]>;
}) {
  /** Célula sob o cursor. No celular não existe cursor, e esta fica sempre nula. */
  const [sobMouse, setSobMouse] = useState<string | null>(null);
  /**
   * Célula aberta por clique ou toque.
   *
   * Sem ela a tela não funcionava no celular: `onMouseEnter` não existe em
   * toque, e o painel de detalhe simplesmente não abria. Fixada, ela também
   * sobrevive ao mouse sair — útil no desktop para ler com calma ou clicar no
   * link do produto.
   */
  const [fixada, setFixada] = useState<string | null>(null);
  const aberta = fixada ?? sobMouse;
  /**
   * A célula que abriu o painel, para ele se posicionar.
   *
   * Existe por causa do cabeçalho congelado. Para a linha dos CDs ficar presa,
   * a grade precisou virar sua própria área de rolagem — e área de rolagem
   * recorta o que transborda, o que cortaria o painel das últimas linhas pela
   * metade. Com `fixed` ele é posicionado contra a janela e escapa do corte,
   * mas aí precisa saber de onde saiu.
   *
   * Guarda o elemento, e não as coordenadas dele: `fixed` não acompanha o
   * scroll, e um painel fixado por clique ficaria parado no ar enquanto a
   * grade rola por baixo. Com o elemento, a posição é remedida a cada rolagem.
   */
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  const [, remedir] = useState(0);

  useEffect(() => {
    if (!ancora) return;
    const refazer = () => remedir((t) => t + 1);
    // Captura, porque quem rola é a grade por dentro, e evento de scroll de
    // elemento não sobe até a janela sem isso.
    window.addEventListener("scroll", refazer, true);
    window.addEventListener("resize", refazer);
    return () => {
      window.removeEventListener("scroll", refazer, true);
      window.removeEventListener("resize", refazer);
    };
  }, [ancora]);

  const abrir = (chave: string, alvo: HTMLElement) => {
    setAncora(alvo);
    setSobMouse(chave);
  };
  const sigla = (codigo: string) => rotulos[codigo] ?? codigo;

  // A célula aberta, resolvida uma vez: o painel agora é desenhado fora do laço
  // da tabela, então precisa reencontrar de que linha e de que CD ele veio.
  const painel = (() => {
    if (!aberta || !ancora) return null;
    const corte = aberta.indexOf("|");
    const codigo = aberta.slice(0, corte);
    const filial = aberta.slice(corte + 1);
    const linha = dados.linhas.find((l) => l.codigo === codigo);
    const celula = linha?.celulas.get(filial);
    if (!linha || !celula) return null;
    return { linha, celula, chave: aberta, onde: ancora };
  })();

  // A companhia primeiro: é a leitura que responde "o item está coberto?" antes
  // de "onde está o problema". Mesma ordem da tela de produto.
  const colunas = [COLUNA_CIA, ...dados.filiais];

  if (dados.linhas.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        Escolha um laboratório para montar a grade.
      </p>
    );
  }

  return (
    // A altura limitada é o que faz o cabeçalho congelar: `sticky` prende o
    // elemento à sua área de rolagem, e sem altura própria a área é a página
    // inteira — a linha dos CDs subiria junto com o resto. Com o teto, a grade
    // rola por dentro e a linha fica.
    <div className="relative max-h-[78vh] overflow-auto rounded-xl border bg-card">
      <table className="border-separate border-spacing-1 p-1">
        <thead>
          <tr>
            {/* O canto fica preso nos dois eixos — é a única célula que precisa
                sobreviver ao scroll horizontal e ao vertical ao mesmo tempo, e
                por isso tem a camada mais alta. */}
            <th className="sticky top-0 left-0 z-40 w-28 bg-card px-2 text-left text-xs font-medium text-muted-foreground shadow-[0_4px_0_0_var(--card)] sm:w-auto">
              Produto
            </th>
            {colunas.map((f) => (
              <th
                key={f}
                // A sombra chapada de 4px tapa a folga do `border-spacing`: sem
                // ela, as linhas aparecem passando por baixo do cabeçalho numa
                // fresta entre as duas.
                className={`sticky top-0 z-30 bg-card px-1 pb-1 text-center font-mono text-xs font-semibold whitespace-nowrap shadow-[0_4px_0_0_var(--card)] ${
                  f === COLUNA_CIA
                    ? // A Cia é outra natureza de leitura, não mais uma filial:
                      // o tracejado separa as duas sem o peso de uma borda
                      // cheia, e a folga dobrada dá o respiro que a linha
                      // sozinha não daria.
                      "border-r border-dashed border-muted-foreground/25 pr-3 text-(--brand-petrol) dark:text-(--brand-turquoise)"
                    : ""
                }`}
              >
                {f === COLUNA_CIA ? "CIA" : sigla(f)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dados.linhas.map((linha) => (
            <tr key={linha.codigo}>
              {/* Mais estreita no celular: 16rem de produto numa tela de 375px
                  deixaria menos de um elemento visível ao lado. */}
              {/* z-20 e não z-10: a célula sob o cursor sobe para z-10 ao
                  levantar, e empataria com a coluna presa — passando por cima
                  dela ao rolar na horizontal. */}
              <th className="sticky left-0 z-20 w-28 max-w-28 bg-card px-2 text-left font-normal sm:w-auto sm:max-w-64">
                <span className="block font-mono text-xs font-medium">
                  {linha.codigo}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {linha.descricao ?? "—"}
                </span>
              </th>

              {colunas.map((filial) => {
                const c = linha.celulas.get(filial);
                const chave = `${linha.codigo}|${filial}`;
                const ehCia = filial === COLUNA_CIA;

                if (!c) {
                  // Sem forecast neste CD: o item não é planejado ali, e um
                  // elemento vazio diz isso melhor que um zero, que pareceria
                  // ruptura.
                  return (
                    <td key={filial} className={`p-0 ${separador(ehCia)}`}>
                      <div className="size-20 rounded-md border border-dashed border-muted-foreground/15" />
                    </td>
                  );
                }

                return (
                  <td
                    key={filial}
                    className={`relative p-0 ${separador(ehCia)}`}
                  >
                    <div
                      onMouseEnter={(e) => abrir(chave, e.currentTarget)}
                      onMouseLeave={() => setSobMouse(null)}
                      onClick={(e) => {
                        setAncora(e.currentTarget);
                        setFixada((f) => (f === chave ? null : chave));
                      }}
                      className={`flex size-20 cursor-pointer flex-col justify-between rounded-md p-1.5 transition-all hover:z-10 hover:-translate-y-0.5 ${
                        ehCia ? "ring-2 ring-(--brand-petrol)/30" : ""
                      } ${
                        // No celular não há hover para indicar qual está aberta:
                        // o anel é o que diz de onde o painel saiu.
                        fixada === chave ? "ring-2 ring-foreground/50" : ""
                      }`}
                      style={{
                        backgroundColor: `var(--faixa-${c.faixa})`,
                        color: `var(--faixa-${c.faixa}-ink)`,
                        // Relevo de cubo, em três camadas: luz no topo, sombra
                        // na base e uma sombra projetada curta. Tudo em branco e
                        // preto translúcidos, para funcionar sobre as seis cores
                        // das faixas sem precisar de uma variante por cor.
                        boxShadow:
                          "inset 0 1px 0 rgba(255,255,255,0.35), " +
                          "inset 0 -2px 3px rgba(0,0,0,0.18), " +
                          "0 1px 2px rgba(0,0,0,0.18)",
                      }}
                    >
                      {/* Canto superior, no lugar do número atômico: cobertura
                          total, que é a mesma pergunta do número grande só que
                          contando o que ainda vai chegar. */}
                      <span className="text-right font-mono text-[11px] leading-none font-bold opacity-90">
                        {dias(c.diasTotal)}
                      </span>

                      <span className="text-center font-mono text-2xl leading-none font-bold">
                        {dias(c.diasChao)}
                      </span>

                      <span className="text-center font-mono text-[10px] leading-none opacity-90">
                        {curto(c.estoqueChao)}
                      </span>

                      {/* Rodapé, no lugar da massa atômica: quanto do forecast
                          já saiu. É o que diz se a cobertura é confortável ou se
                          o mês está correndo mais rápido que ela. */}
                      {/* Forecast e o quanto dele já saiu, juntos: a
                          porcentagem sozinha não diz se 34% são de trezentas ou
                          de trinta mil unidades. O forecast vai abreviado para
                          os dois caberem na largura do elemento. */}
                      <span className="text-center font-mono text-[10px] leading-none opacity-75">
                        {curto(c.forecast)}
                        <span className="mx-0.5 opacity-50">|</span>
                        {c.percentualVendido === null
                          ? "—"
                          : `${Math.round(c.percentualVendido * 100)}%`}
                      </span>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Fora da tabela, de propósito: aqui dentro da área de rolagem ele seria
          recortado nas últimas linhas. `fixed` o posiciona contra a janela, que
          nenhum `overflow` alcança. */}
      {painel ? (
        <div
          // Transparente ao mouse enquanto é só hover: se o painel receber o
          // cursor, a célula perde o hover e ele se fecha sozinho. Fixado por
          // clique volta a ser clicável, que é quando o link do produto importa.
          className={`fixed z-50 overflow-auto rounded-lg border bg-popover p-3 shadow-xl ${
            fixada === painel.chave ? "" : "pointer-events-none"
          }`}
          style={posicaoPainel(painel.onde.getBoundingClientRect(), {
            largura: window.innerWidth,
            altura: window.innerHeight,
          })}
        >
          <Detalhe
            celula={painel.celula}
            descricao={painel.linha.descricao}
            sigla={sigla}
            chegadas={chegadas[painel.chave] ?? []}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Largura mínima utilizável, só para escolher de que lado o painel abre. */
export const PAINEL_LARGURA = 320;

/**
 * Onde desenhar o painel, a partir da célula que o abriu.
 *
 * **Ancora a borda oposta, em vez de calcular a posição.** A primeira versão
 * estimava a altura do painel em 300px para decidir se ele cabia abaixo; quando
 * não cabia, subtraía esse chute do topo da célula. Com o painel mais alto que o
 * chute, a conta o colocava *em cima* da célula — e aí ele nascia debaixo do
 * cursor, roubava o hover, a célula disparava `onMouseLeave` e o painel fechava
 * no mesmo quadro. Por fora parecia tooltip que não abre.
 *
 * Ancorando `bottom` quando sobe e `right` quando vira para a esquerda, o painel
 * cresce para longe da célula seja qual for o tamanho dele, e nenhuma dimensão
 * precisa ser adivinhada. O `maxHeight` é o espaço real que resta daquele lado,
 * então o conteúdo rola por dentro em vez de vazar da tela.
 */
export function posicaoPainel(
  r: { top: number; bottom: number; left: number; right: number },
  /** Dimensões da janela. Parâmetro, e não `window`, para isto ser testável. */
  janela: { largura: number; altura: number },
): CSSProperties {
  const folga = 8;
  const vertical: CSSProperties =
    janela.altura - r.bottom >= r.top
      ? { top: r.bottom + 4, maxHeight: janela.altura - r.bottom - folga }
      : { bottom: janela.altura - r.top + 4, maxHeight: r.top - folga };

  // Espaço à direita medido a partir da borda esquerda da célula, que é onde o
  // painel começaria.
  const horizontal: CSSProperties =
    janela.largura - r.left >= PAINEL_LARGURA + folga
      ? { left: r.left }
      : { right: Math.max(folga, janela.largura - r.right) };

  return { ...vertical, ...horizontal };
}
