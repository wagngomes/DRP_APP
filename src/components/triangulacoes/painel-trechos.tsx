"use client";

import { useState } from "react";
import {
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Package,
  ShoppingCart,
  Truck,
} from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type {
  ItemNoTrecho,
  ResumoTrecho,
  RotaNoTrecho,
  Trecho,
} from "@/lib/triangulacoes/trechos";
import { parseRota } from "@/utils/projecao-transferencias";

/**
 * Os trechos das triangulações, com o que está neles agora e o que ainda vem.
 *
 * Cada trecho traz duas leituras que nunca se somam. **Agora** é o que está
 * percorrendo aquele par de CDs neste momento: cada documento cai em um trecho
 * só, e por isso a soma reproduz o total da tela de triangulações. **Vai
 * passar** é a carga futura — o mesmo documento aparece em vários trechos, de
 * propósito, porque a pergunta é "o que vem por este corredor".
 *
 * Somá-las daria capital contado duas vezes. A tela mostra isso pela cor: o
 * presente em cor, o futuro em cinza tracejado.
 */

function moeda(v: number): string {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function num(v: number): string {
  return Math.round(v).toLocaleString("pt-BR");
}

function dataBr(d: Date | string | null): string {
  if (!d) return "—";
  const data = typeof d === "string" ? new Date(d) : d;
  return data.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/**
 * Barra da divisão entre as duas origens.
 *
 * Teal para transferência, âmbar para compra — a mesma convenção da tela por
 * produto, para quem passa de uma à outra não ter de reaprender a cor. Um
 * pedido de compra ainda vai chegar de fora; uma transferência já está rodando
 * entre CDs, e a diferença muda o que se pode fazer a respeito.
 */
function DivisaoOrigem({
  transferencia,
  compra,
}: {
  transferencia: number;
  compra: number;
}) {
  const total = transferencia + compra;
  if (total <= 0) return null;

  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="bg-teal-500"
          style={{ width: `${(transferencia / total) * 100}%` }}
        />
        <div
          className="bg-amber-500"
          style={{ width: `${(compra / total) * 100}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 font-mono text-[10px] tabular-nums">
        {transferencia > 0 ? (
          <span className="flex items-center gap-1 text-teal-700 dark:text-teal-300">
            <Truck className="size-2.5" />
            {`${moeda(transferencia)} rodando`}
          </span>
        ) : null}
        {compra > 0 ? (
          <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
            <ShoppingCart className="size-2.5" />
            {`${moeda(compra)} a chegar`}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Bloco de números de um lado do trecho. */
function Resumo({
  resumo,
  futuro,
}: {
  resumo: ResumoTrecho;
  /** Muda a cor: presente em cor, futuro em cinza. */
  futuro?: boolean;
}) {
  const vazio = resumo.documentos === 0;

  return (
    <div
      className={`rounded-lg border p-3 ${
        futuro
          ? "border-dashed bg-muted/40 text-muted-foreground"
          : "border-(--brand-turquoise)/40 bg-(--brand-turquoise)/5"
      } ${vazio ? "opacity-50" : ""}`}
    >
      <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase">
        {futuro ? <Clock className="size-3" /> : <Truck className="size-3" />}
        {futuro ? "Vai passar" : "Em trânsito agora"}
      </p>

      <p
        className={`mt-1 font-mono text-xl font-semibold tabular-nums ${
          futuro ? "" : "text-(--brand-petrol) dark:text-(--brand-turquoise)"
        }`}
      >
        {moeda(resumo.valor)}
      </p>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
        <span className="flex items-center gap-1">
          <Package className="size-3" />
          {`${num(resumo.produtos)} produto(s)`}
        </span>
        <span className="tabular-nums">{`${num(resumo.quantidade)} un`}</span>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1">
        {resumo.notas > 0 ? (
          <Badge
            variant="outline"
            className="gap-1 font-mono text-[10px] font-normal"
          >
            <FileText className="size-2.5" />
            {`${num(resumo.notas)} NF`}
          </Badge>
        ) : null}
        {resumo.pedidos > 0 ? (
          <Badge
            variant="outline"
            className="gap-1 font-mono text-[10px] font-normal"
          >
            <ShoppingCart className="size-2.5" />
            {`${num(resumo.pedidos)} pedido(s)`}
          </Badge>
        ) : null}
        {resumo.agendados > 0 ? (
          <Badge
            variant="outline"
            className="gap-1 font-mono text-[10px] font-normal"
          >
            <CalendarCheck className="size-2.5" />
            {`${num(resumo.agendados)} agendado(s)`}
          </Badge>
        ) : null}
      </div>

      {/* Só no presente: no futuro a divisão entre as origens não muda nada que
          se possa fazer hoje, e a barra viraria enfeite. */}
      {futuro ? null : (
        <DivisaoOrigem
          transferencia={resumo.valorTransferencia}
          compra={resumo.valorCompra}
        />
      )}

      {resumo.proximaChegada ? (
        <p className="mt-1.5 font-mono text-[11px]">
          {`próxima chegada ${dataBr(resumo.proximaChegada)}`}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Uma rota inteira, com a perna deste trecho destacada nela.
 *
 * É o que responde "este trecho é o começo, o meio ou o fim do caminho" — que
 * o par de CDs sozinho não diz. As paradas já cumpridas ficam sólidas em cinza,
 * a perna atual em cor, e o que falta em cinza claro tracejado.
 *
 * A cor da perna atual vem da origem que mais pesa nela: teal quando é
 * transferência já rodando, âmbar quando é compra a chegar.
 */
function TrilhaRota({ rota }: { rota: RotaNoTrecho }) {
  const dominaCompra = rota.valorCompra > rota.valorTransferencia;
  const corAtual = dominaCompra
    ? "bg-amber-500 text-white"
    : "bg-teal-600 text-white dark:bg-teal-500";

  return (
    <span className="flex flex-wrap items-center gap-0.5">
      {rota.paradas.map((parada, i) => {
        // `posicao` é o índice da parada de chegada da perna atual; a perna
        // ocupa, portanto, as paradas i-1 e i.
        const naPerna =
          rota.posicao >= 0 && (i === rota.posicao || i === rota.posicao - 1);
        const cumprida = rota.posicao >= 0 && i < rota.posicao - 1;

        return (
          <span key={`${parada}-${i}`} className="flex items-center gap-0.5">
            {i > 0 ? (
              <span
                className={`text-[10px] ${
                  i === rota.posicao
                    ? dominaCompra
                      ? "text-amber-600"
                      : "text-teal-600"
                    : cumprida
                      ? "text-muted-foreground"
                      : "text-muted-foreground/30"
                }`}
              >
                ›
              </span>
            ) : null}
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] leading-none ${
                naPerna
                  ? `${corAtual} font-bold`
                  : cumprida
                    ? "bg-muted text-muted-foreground"
                    : "border border-dashed border-muted-foreground/25 text-muted-foreground/50"
              }`}
            >
              {parada}
            </span>
          </span>
        );
      })}
      <span className="ml-1 font-mono text-[10px] text-muted-foreground tabular-nums">
        {`${rota.documentos} doc · ${moeda(rota.valor)}`}
      </span>
    </span>
  );
}

/**
 * O percurso completo do item, com o já andado separado do que falta.
 *
 * É o que responde "até onde vai este produto" sem abrir outra tela. A parte
 * cumprida fica sólida e a que falta, cinza tracejada — a mesma convenção que
 * separa presente de futuro no resto da tela.
 */
function Percurso({
  item,
  trecho,
  sigla,
}: {
  item: ItemNoTrecho;
  trecho: Trecho;
  sigla: (codigo: string) => string;
}) {
  const paradas = parseRota(item.rota);
  const siglaAtual = sigla(trecho.para);
  // A posição sai da sigla do destino deste trecho. Quando a rota não pode ser
  // lida (sigla fora do cadastro), o índice vem -1 e tudo aparece como futuro,
  // que é a leitura conservadora.
  const indiceAtual = paradas.indexOf(siglaAtual);

  if (paradas.length === 0) {
    return (
      <span className="font-mono text-[11px] text-muted-foreground">
        rota não resolvida
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-0.5">
      {paradas.map((parada, i) => {
        const cumprida = indiceAtual >= 0 && i < indiceAtual;
        const atual = i === indiceAtual;
        return (
          <span key={`${parada}-${i}`} className="flex items-center gap-0.5">
            {i > 0 ? (
              <span
                className={`px-0.5 text-[10px] ${
                  cumprida || atual
                    ? "text-(--brand-turquoise)"
                    : "text-muted-foreground/40"
                }`}
              >
                ›
              </span>
            ) : null}
            <span
              className={`rounded px-1 py-0.5 font-mono text-[10px] leading-none ${
                atual
                  ? "bg-(--brand-petrol) font-bold text-white dark:bg-(--brand-turquoise) dark:text-(--brand-petrol)"
                  : cumprida
                    ? "bg-(--brand-turquoise)/20 text-(--brand-petrol) dark:text-(--brand-turquoise)"
                    : "border border-dashed border-muted-foreground/30 text-muted-foreground/60"
              }`}
            >
              {parada}
            </span>
          </span>
        );
      })}
    </span>
  );
}

function TabelaItens({
  itens,
  trecho,
  sigla,
}: {
  itens: ItemNoTrecho[];
  trecho: Trecho;
  sigla: (codigo: string) => string;
}) {
  if (itens.length === 0) {
    return (
      <p className="p-4 text-center text-sm text-muted-foreground">
        Nenhum documento aqui.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-2 py-1.5 text-left font-medium">Produto</th>
            <th className="px-2 py-1.5 text-left font-medium">Documento</th>
            <th className="px-2 py-1.5 text-right font-medium">Qtde</th>
            <th className="px-2 py-1.5 text-right font-medium">Valor</th>
            <th className="px-2 py-1.5 text-left font-medium">Chega aqui</th>
            <th className="px-2 py-1.5 text-left font-medium">
              Percurso e destino
            </th>
          </tr>
        </thead>
        <tbody>
          {itens.map((i, k) => (
            <tr
              key={`${i.documento}-${i.codigo}-${k}`}
              className="border-b hover:bg-muted/40"
            >
              <td className="px-2 py-1.5">
                {/* O código leva à tela de produto, que é onde se resolve o
                    caso concreto depois de a visão gerencial apontar onde olhar. */}
                <Link
                  href={`/produto/${i.codigo}`}
                  className="font-mono font-medium text-(--brand-petrol) underline-offset-2 hover:underline dark:text-(--brand-turquoise)"
                >
                  {i.codigo}
                </Link>
                <span className="ml-1.5 text-muted-foreground">
                  {i.descricao ?? "—"}
                </span>
              </td>
              <td className="px-2 py-1.5">
                <span className="flex items-center gap-1 font-mono">
                  {i.origem === "transferencia" ? (
                    <FileText className="size-3 text-muted-foreground" />
                  ) : (
                    <ShoppingCart className="size-3 text-muted-foreground" />
                  )}
                  {i.documento ?? "—"}
                </span>
                {i.statusLogistica ? (
                  <span className="text-[10px] text-muted-foreground">
                    {i.statusLogistica}
                  </span>
                ) : null}
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                {num(i.quantidade)}
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                {moeda(i.valor)}
              </td>
              <td className="px-2 py-1.5 font-mono whitespace-nowrap">
                {dataBr(i.chegadaNoTrecho)}
                {/* Reprojetada significa que a data da origem já passou e vale a
                    recalculada pelo prazo do parâmetro — dizer isso evita que a
                    data seja lida como promessa do fornecedor. */}
                {i.reprojetada ? (
                  <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400">
                    reprojetada
                  </span>
                ) : null}
                {/* Data marcada quando existe; quando não, o motivo que a
                    origem dá ("Não faturado", "S/AGENDAMENTO") — que explica a
                    ausência melhor do que um traço. */}
                {i.agendamento.data ? (
                  <span className="block text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                    {`agendado ${dataBr(i.agendamento.data)}`}
                  </span>
                ) : i.agendamento.rotulo ? (
                  <span className="block text-[10px] text-muted-foreground">
                    {i.agendamento.rotulo}
                  </span>
                ) : null}
              </td>
              <td className="px-2 py-1.5">
                <Percurso item={i} trecho={trecho} sigla={sigla} />
                <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                  {`destino ${i.cdFinal ? sigla(i.cdFinal) : "—"} · ${dataBr(i.chegadaFinal)}`}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PainelTrechos({
  trechos,
  rotulos,
}: {
  trechos: Trecho[];
  rotulos: Record<string, string>;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [aba, setAba] = useState<"agora" | "depois">("agora");
  const sigla = (codigo: string) => rotulos[codigo] ?? codigo;

  if (trechos.length === 0) {
    return (
      <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        Nenhuma triangulação em aberto no recorte escolhido.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {trechos.map((t) => {
        const estaAberto = aberto === t.id;
        const resumo = aba === "agora" ? t.agora : t.depois;

        return (
          <div key={t.id} className="overflow-hidden rounded-xl border bg-card">
            <button
              type="button"
              onClick={() => setAberto(estaAberto ? null : t.id)}
              className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/40"
            >
              {estaAberto ? (
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              )}

              {/* O trecho em si: par de CDs, que é o eixo desta tela. */}
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="rounded-md bg-(--brand-petrol) px-2 py-1 font-mono text-xs leading-none font-bold text-white dark:bg-(--brand-turquoise) dark:text-(--brand-petrol)">
                  {sigla(t.de)}
                </span>
                <span className="text-muted-foreground">→</span>
                <span className="rounded-md bg-(--brand-petrol) px-2 py-1 font-mono text-xs leading-none font-bold text-white dark:bg-(--brand-turquoise) dark:text-(--brand-petrol)">
                  {sigla(t.para)}
                </span>
              </span>

              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                <Resumo resumo={t.agora} />
                <Resumo resumo={t.depois} futuro />
              </div>
            </button>

            {/* As rotas que passam por aqui, na capa e não só no detalhe: sem
                elas o par de CDs não diz se a carga está saindo ou chegando.
                Três é o corte — 19 dos 40 trechos têm uma rota só, mas o maior
                tem doze, e listar todas viraria parede de texto. */}
            {t.rotas.length > 0 ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t bg-muted/20 px-3 py-2">
                <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                  {t.rotas.length === 1 ? "Rota" : `Rotas · ${t.rotas.length}`}
                </span>
                {t.rotas.slice(0, 3).map((r) => (
                  <TrilhaRota key={r.rota} rota={r} />
                ))}
                {t.rotas.length > 3 ? (
                  <span className="text-[10px] text-muted-foreground">
                    {`+${t.rotas.length - 3} outras`}
                  </span>
                ) : null}
              </div>
            ) : null}

            {estaAberto ? (
              <div className="border-t">
                {/* Duas abas em vez das duas listas empilhadas: o trecho mais
                    carregado tem centenas de linhas de cada lado, e mostrá-las
                    juntas esconderia a divisão que a tela existe para fazer. */}
                <div className="flex gap-1 border-b bg-muted/30 px-3 py-2">
                  {(["agora", "depois"] as const).map((chave) => (
                    <button
                      key={chave}
                      type="button"
                      onClick={() => setAba(chave)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                        aba === chave
                          ? "bg-(--brand-petrol) text-white dark:bg-(--brand-turquoise) dark:text-(--brand-petrol)"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {chave === "agora"
                        ? `Em trânsito agora · ${num(t.agora.documentos)}`
                        : `Vai passar · ${num(t.depois.documentos)}`}
                    </button>
                  ))}
                </div>
                <TabelaItens itens={resumo.itens} trecho={t} sigla={sigla} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
