"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Route } from "lucide-react";

import type { FatiaFiscal, RotaAbastecimento } from "@/lib/visao-geral/consultas";
import { moeda, moedaCurta, percentual } from "@/lib/visao-geral/formato";
import { MAX_FATIAS } from "@/components/visao-geral/paleta";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ROTULO_OUTRAS = "Outras tributações";

/** Abaixo disso o segmento não sobrevive ao gap de 2px entre as fatias. */
const FATIA_MINIMA = 0.01;

/**
 * Largura mínima para o rótulo caber dentro do segmento. Abaixo disso o texto
 * seria cortado; o percentual continua disponível no tooltip e na tabela.
 */
const LARGURA_MINIMA_ROTULO = 0.06;

type Fatia = { tributacao: string; chave: string; valor: number; corIndice: number };

/**
 * Composição tributária do estoque dentro de cada CD.
 *
 * Barra empilhada 100%: a pergunta é participação relativa, não valor
 * absoluto — o valor em reais vem na tabela e no tooltip. A cauda além de
 * MAX_FATIAS vira "Outras tributações" em cinza, porque gerar cores novas
 * quebraria a separação para daltônicos.
 */
export function PerfilFiscal({
  fatias,
  rotas,
  totaisPorCd,
}: {
  fatias: FatiaFiscal[];
  rotas: RotaAbastecimento[];
  totaisPorCd: { filial: string; estoque: number }[];
}) {
  const [cdSelecionado, setCdSelecionado] = useState<string>(
    totaisPorCd[0]?.filial ?? ""
  );
  const [ativo, setAtivo] = useState<string | null>(null);
  // Rotas visíveis por padrão: a Task pede que apareçam abaixo de cada
  // tributação, não atrás de um clique. O conjunto guarda apenas as que o
  // usuário fechou.
  const [recolhidas, setRecolhidas] = useState<Set<string>>(new Set());

  // As tributações com cor própria são as maiores no total geral, e não por CD:
  // assim a mesma cor significa a mesma tributação em todas as barras.
  const { ordem, corDe } = useMemo(() => {
    const porTributacao = new Map<string, number>();
    for (const f of fatias) {
      porTributacao.set(f.tributacao, (porTributacao.get(f.tributacao) ?? 0) + f.valor);
    }
    const ordenadas = [...porTributacao.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([nome]) => nome);
    const mapa = new Map<string, number>();
    ordenadas.slice(0, MAX_FATIAS).forEach((nome, i) => mapa.set(nome, i));
    return { ordem: ordenadas, corDe: mapa };
  }, [fatias]);

  const porCd = useMemo(() => {
    const mapa = new Map<string, Fatia[]>();
    for (const f of fatias) {
      const indice = corDe.get(f.tributacao);
      const nome = indice === undefined ? ROTULO_OUTRAS : f.tributacao;
      const lista = mapa.get(f.filial) ?? [];
      const existente = lista.find((x) => x.tributacao === nome);
      if (existente) existente.valor += f.valor;
      else lista.push({ tributacao: nome, chave: f.chave, valor: f.valor, corIndice: indice ?? -1 });
      mapa.set(f.filial, lista);
    }
    for (const lista of mapa.values()) {
      // "Outras" sempre por último; o resto pela ordem global de cor.
      lista.sort((a, b) =>
        a.corIndice === -1 ? 1 : b.corIndice === -1 ? -1 : a.corIndice - b.corIndice
      );
    }
    return mapa;
  }, [fatias, corDe]);

  /**
   * Versão da composição usada na barra. Fatias abaixo de FATIA_MINIMA somem
   * atrás do gap de 2px entre segmentos, então são dobradas em "Outras" — a
   * barra continua somando 100% e sem slivers invisíveis. A tabela abaixo
   * mostra a lista completa, sem dobra.
   */
  const porCdBarra = useMemo(() => {
    const mapa = new Map<string, Fatia[]>();
    for (const [filial, lista] of porCd) {
      const total = lista.reduce((s, f) => s + f.valor, 0);
      const visiveis: Fatia[] = [];
      let resto = 0;
      for (const f of lista) {
        if (f.corIndice !== -1 && f.valor / total >= FATIA_MINIMA) visiveis.push(f);
        else resto += f.valor;
      }
      if (resto > 0)
        visiveis.push({ tributacao: ROTULO_OUTRAS, chave: "__outras__", valor: resto, corIndice: -1 });
      mapa.set(filial, visiveis);
    }
    return mapa;
  }, [porCd]);

  const legenda = [
    ...ordem.slice(0, MAX_FATIAS).map((nome, i) => ({ nome, corIndice: i })),
    ...(ordem.length > MAX_FATIAS ? [{ nome: ROTULO_OUTRAS, corIndice: -1 }] : []),
  ];

  const detalhe = porCd.get(cdSelecionado) ?? [];
  const totalDetalhe = detalhe.reduce((s, f) => s + f.valor, 0);

  /**
   * Rotas do CD selecionado, indexadas pela mesma chave normalizada de
   * tributação que a consulta de composição usa — é o que garante que rota e
   * fatia falem da mesma tributação apesar das variações de caixa na base.
   */
  const rotasPorChave = useMemo(() => {
    const mapa = new Map<string, RotaAbastecimento[]>();
    for (const r of rotas) {
      if (r.filial !== cdSelecionado) continue;
      const lista = mapa.get(r.chave) ?? [];
      lista.push(r);
      mapa.set(r.chave, lista);
    }
    for (const lista of mapa.values()) lista.sort((a, b) => b.valor - a.valor);
    return mapa;
  }, [rotas, cdSelecionado]);

  const cor = (indice: number) =>
    indice === -1 ? "var(--viz-outras)" : `var(--viz-cat-${indice + 1})`;

  return (
    <div className="space-y-5">
      {/* Legenda: identidade nunca depende só da cor. */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {legenda.map((item) => (
          <li key={item.nome} className="flex items-center gap-1.5 text-xs">
            <span
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ background: cor(item.corIndice) }}
            />
            <span className="text-muted-foreground">{item.nome}</span>
          </li>
        ))}
      </ul>

      <div className="space-y-1.5">
        {totaisPorCd.map((cd) => {
          const lista = porCdBarra.get(cd.filial) ?? [];
          const total = lista.reduce((s, f) => s + f.valor, 0);
          if (total === 0) return null;
          return (
            <div
              key={cd.filial}
              className={`grid cursor-pointer grid-cols-[3.5rem_1fr] items-center gap-3 rounded-md px-1 py-1 transition-colors ${
                cdSelecionado === cd.filial ? "bg-muted" : "hover:bg-muted/60"
              }`}
              onClick={() => {
                setCdSelecionado(cd.filial);
                setRecolhidas(new Set());
              }}
            >
              <span className="text-right font-mono text-xs text-muted-foreground">
                {cd.filial}
              </span>
              {/* gap de 2px entre segmentos: a separação é feita pela superfície */}
              <div className="flex h-5 gap-[2px] overflow-hidden">
                {lista.map((f) => {
                  const chave = `${cd.filial}-${f.tributacao}`;
                  return (
                    <div
                      key={chave}
                      className="relative h-full first:rounded-l-[4px] last:rounded-r-[4px]"
                      style={{
                        width: `${(f.valor / total) * 100}%`,
                        background: cor(f.corIndice),
                        filter: ativo === chave ? "brightness(1.15)" : undefined,
                      }}
                      onMouseEnter={() => setAtivo(chave)}
                      onMouseLeave={() => setAtivo(null)}
                    >
                      {f.valor / total >= LARGURA_MINIMA_ROTULO ? (
                        <span className="pointer-events-none flex h-full items-center justify-center text-[10px] font-semibold text-white tabular-nums drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]">
                          {`${Math.round((f.valor / total) * 100)}%`}
                        </span>
                      ) : null}

                      {ativo === chave ? (
                        <div className="pointer-events-none absolute top-full left-0 z-20 mt-0.5 w-max max-w-xs rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                          <p className="font-medium">CD {cd.filial}</p>
                          <p className="text-muted-foreground">{f.tributacao}</p>
                          <p className="text-muted-foreground">
                            {moeda(f.valor)} · {percentual(f.valor, total)} do CD
                          </p>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabela: o valor e o percentual exatos que a barra não consegue mostrar. */}
      <div>
        <p className="mb-2 text-sm font-medium text-(--brand-petrol) dark:text-foreground">
          {`Detalhamento do CD ${cdSelecionado}`}
          <span className="ml-2 font-normal text-muted-foreground">
            (clique numa barra para trocar de CD, ou numa linha para recolher as rotas)
          </span>
        </p>
        <div className="max-h-72 overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tributação</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">% do CD</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detalhe.map((f) => {
                const rotasDaFatia = rotasPorChave.get(f.chave) ?? [];
                const somaRotas = rotasDaFatia.reduce((s, r) => s + r.valor, 0);
                // O que sobra são itens sem forecast na filial — sem rota
                // definida. Exibir explicitamente evita a soma "não fechar".
                const semRota = f.valor - somaRotas;
                const aberta = !recolhidas.has(f.chave) && rotasDaFatia.length > 0;
                return (
                  <Fragment key={f.chave}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() =>
                        setRecolhidas((atual) => {
                          const proximo = new Set(atual);
                          if (proximo.has(f.chave)) proximo.delete(f.chave);
                          else proximo.add(f.chave);
                          return proximo;
                        })
                      }
                    >
                      <TableCell>
                        <span className="flex items-center gap-2">
                          {aberta ? (
                            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <span
                            className="size-2.5 shrink-0 rounded-[2px]"
                            style={{ background: cor(f.corIndice) }}
                          />
                          {f.tributacao}
                          <span className="text-xs text-muted-foreground">
                            {`(${rotasDaFatia.length} rota${rotasDaFatia.length === 1 ? "" : "s"})`}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {moedaCurta(f.valor)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {percentual(f.valor, totalDetalhe)}
                      </TableCell>
                    </TableRow>

                    {aberta
                      ? [
                          ...rotasDaFatia.map((r) => (
                            <TableRow key={`${f.chave}-${r.rota}`} className="bg-muted/40">
                              <TableCell className="py-1.5 pl-10">
                                <span className="flex items-center gap-2 text-xs">
                                  <Route className="size-3.5 shrink-0 text-(--brand-turquoise)" />
                                  <span className="font-mono">{r.rota}</span>
                                  <span className="text-muted-foreground">
                                    {`${r.itens} ${r.itens === 1 ? "item" : "itens"}`}
                                  </span>
                                </span>
                              </TableCell>
                              <TableCell className="py-1.5 text-right font-mono text-xs tabular-nums">
                                {moedaCurta(r.valor)}
                              </TableCell>
                              <TableCell className="py-1.5 text-right font-mono text-xs tabular-nums">
                                {percentual(r.valor, f.valor)}
                              </TableCell>
                            </TableRow>
                          )),
                          ...(semRota > 1
                            ? [
                                <TableRow key={`${f.chave}-sem-rota`} className="bg-muted/40">
                                  <TableCell className="py-1.5 pl-10 text-xs text-muted-foreground">
                                    Sem rota definida no forecast
                                  </TableCell>
                                  <TableCell className="py-1.5 text-right font-mono text-xs tabular-nums text-muted-foreground">
                                    {moedaCurta(semRota)}
                                  </TableCell>
                                  <TableCell className="py-1.5 text-right font-mono text-xs tabular-nums text-muted-foreground">
                                    {percentual(semRota, f.valor)}
                                  </TableCell>
                                </TableRow>,
                              ]
                            : []),
                        ]
                      : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
