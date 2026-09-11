import Link from "next/link";
import {
  ArrowRight,
  CircleSlash,
  Clock,
  PhoneCall,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  Truck,
  Wallet,
} from "lucide-react";

import { exigirAdmin } from "@/lib/autorizacao";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BotaoGerar } from "@/components/cockpit/botao-gerar";
import { FiltroLista } from "@/components/ui/filtro-lista";
import {
  ChecklistProvider,
  LinhaTarefa,
  Progresso,
  type TarefaInicial,
} from "@/components/cockpit/checklist";
import { carregarCockpit, type LinhaCockpit } from "@/lib/cockpit/consultas";
import { lerAnalise } from "@/lib/ia/persistencia";
import { lerDataReferencia } from "@/lib/data-referencia.server";
import { lerCoberturas, lerParametros } from "@/lib/parametros.server";
import {
  EXPLICACAO_ACAO,
  ORDEM_ACOES,
  ROTULO_ACAO,
  type TipoAcao,
} from "@/lib/riscos/acao";
import { dataBr, inteiro } from "@/lib/visao-geral/formato";

export const dynamic = "force-dynamic";

/**
 * Quantas linhas de cada grupo aparecem antes do "ver todas".
 *
 * A tela existe para dirigir trabalho, não para inventariar risco: uma lista de
 * quinhentas ações não é mais informativa que uma de dez, é menos. A contagem
 * completa fica sempre visível no cabeçalho do grupo, então nada é escondido —
 * o que muda é o que disputa a atenção primeiro.
 */
const LIMITE_GRUPO = 6;

type SearchParams = {
  analista?: string | string[];
  bu?: string | string[];
  /** Grupos expandidos, no formato "faixa:acao". */
  ver?: string | string[];
};

const primeiro = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

const lista = (v: string | string[] | undefined) =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

/**
 * As quatro seções, na ordem em que o analista deve atacá-las.
 *
 * As três primeiras são as faixas da Disponibilidade — mesma régua, mesmas
 * cores. A quarta não vem da régua: são posições que o forecast diz estarem
 * confortáveis e a venda do mês desmente. Fica por último porque ainda há
 * estoque, e em primeiro lugar entre os avisos porque é a única que enxerga uma
 * ruptura antes de ela existir.
 */
const SECOES = [
  {
    id: "zero" as const,
    rotulo: "Sem estoque",
    sub: "CD parado hoje — cada dia aqui é venda perdida",
    icone: CircleSlash,
    cor: "var(--faixa-zero)",
  },
  {
    id: "critico" as const,
    rotulo: "Crítico",
    sub: "Até 10 dias de cobertura",
    icone: TriangleAlert,
    cor: "var(--faixa-critico)",
  },
  {
    id: "baixo" as const,
    rotulo: "Atenção",
    sub: "Entre 10 e 20 dias de cobertura",
    icone: Clock,
    cor: "var(--faixa-baixo)",
  },
  {
    id: "aceleracao" as const,
    rotulo: "Venda acelerada",
    sub: "Cobertura boa no forecast, apertada na venda real do mês",
    icone: TrendingUp,
    cor: "var(--brand-green)",
  },
];

type SecaoId = (typeof SECOES)[number]["id"];

const ICONE_ACAO: Record<TipoAcao, typeof PhoneCall> = {
  cobrar: PhoneCall,
  transferir: Truck,
  comprar: ShoppingCart,
  verba: Wallet,
};

function num(v: number | null | undefined, casas = 0): string {
  return v === null || v === undefined
    ? "—"
    : v.toLocaleString("pt-BR", { maximumFractionDigits: casas });
}

/** Em qual seção a linha aparece. */
function secaoDe(l: LinhaCockpit): SecaoId {
  return l.origem === "aceleracao" ? "aceleracao" : (l.faixa as SecaoId);
}

export default async function Cockpit({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sessao = await exigirAdmin();
  const params = await searchParams;

  const [data, parametros, coberturas] = await Promise.all([
    lerDataReferencia(),
    lerParametros(),
    lerCoberturas(),
  ]);

  const analista = primeiro(params.analista);
  const bu = primeiro(params.bu);
  const expandidos = new Set(lista(params.ver));

  const [{ linhas, totalPosicoes }, gravada] = await Promise.all([
    carregarCockpit(data, parametros, coberturas),
    lerAnalise(data),
  ]);

  /** URL preservando o recorte; `extra` sobrescreve ou remove (undefined). */
  const href = (extra: Record<string, string | string[] | undefined>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | string[] | undefined> = {
      analista,
      bu,
      ver: [...expandidos],
      ...extra,
    };
    for (const [k, v] of Object.entries(base)) {
      if (Array.isArray(v)) for (const x of v) p.append(k, x);
      else if (v) p.set(k, v);
    }
    const qs = p.toString();
    return qs ? `/cockpit?${qs}` : "/cockpit";
  };

  // Analistas sempre sobre o conjunto completo: escolher um não pode esvaziar o
  // próprio seletor.
  const analistasMapa = new Map<string, number>();
  for (const l of linhas) analistasMapa.set(l.analista, (analistasMapa.get(l.analista) ?? 0) + 1);
  const analistas = [...analistasMapa.entries()]
    .map(([valor, total]) => ({ valor, total }))
    .sort((a, b) => (a.valor === "—" ? 1 : b.valor === "—" ? -1 : b.total - a.total));

  const doAnalista = analista ? linhas.filter((l) => l.analista === analista) : linhas;

  const busMapa = new Map<string, number>();
  for (const l of doAnalista) busMapa.set(l.bu, (busMapa.get(l.bu) ?? 0) + 1);
  const bus = [...busMapa.entries()]
    .map(([valor, total]) => ({ valor, total }))
    .sort((a, b) => (a.valor === "—" ? 1 : b.valor === "—" ? -1 : b.total - a.total));

  const recorte = doAnalista.filter((l) => (bu ? l.bu === bu : true));

  const porSecao = new Map<SecaoId, LinhaCockpit[]>();
  const totalSecao = new Map<SecaoId, number>();
  for (const l of recorte) {
    const s = secaoDe(l);
    porSecao.set(s, [...(porSecao.get(s) ?? []), l]);
    totalSecao.set(s, (totalSecao.get(s) ?? 0) + 1);
  }

  // Só a chave e a seção atravessam para o cliente: é o bastante para contar o
  // progresso sem mandar as 1.340 linhas inteiras pelo fio.
  const tarefas: TarefaInicial[] = recorte.map((l) => ({
    chave: l.chave,
    secao: secaoDe(l),
    feitoPor: l.feito?.por ?? null,
  }));

  return (
    <DashboardShell
      user={{ name: sessao.usuario.name, email: sessao.usuario.email }}
      papel={sessao.usuario.papel}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-(--brand-petrol) dark:text-foreground">
              Cockpit
            </h1>
            <p className="text-muted-foreground">
              O que fazer hoje, na ordem em que perde valor se não for feito.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-sm">
              {`Referência: ${dataBr(data)}`}
            </Badge>
            <BotaoGerar temAnalise={gravada !== null} />
          </div>
        </div>

        {analistas.length > 1 || bus.length > 1 ? (
          <Card>
            <CardContent className="grid gap-3 pt-6">
              {analistas.length > 1 ? (
                <FiltroLista
                  rotulo="Analista"
                  atual={analista}
                  hrefTodos={href({ analista: undefined, bu: undefined })}
                  opcoes={analistas.map((a) => ({
                    valor: a.valor,
                    rotulo: a.valor === "—" ? "Sem analista" : a.valor,
                    href: href({ analista: a.valor, bu: undefined }),
                    total: a.total,
                  }))}
                />
              ) : null}
              {bus.length > 1 ? (
                <FiltroLista
                  rotulo="BU"
                  atual={bu}
                  hrefTodos={href({ bu: undefined })}
                  opcoes={bus.map((b) => ({
                    valor: b.valor,
                    rotulo: b.valor === "—" ? "Sem BU" : b.valor,
                    href: href({ bu: b.valor }),
                    total: b.total,
                  }))}
                />
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {/* O provider não emite elemento; o div interno é quem mantém o
            espaçamento vertical entre o progresso e as seções. */}
        <ChecklistProvider tarefas={tarefas}>
          <div className="space-y-5">
            <Progresso
              tarefas={tarefas}
              totalPosicoes={totalPosicoes}
              secoes={SECOES.map((s) => ({ id: s.id, rotulo: s.rotulo, cor: s.cor }))}
            />

        {recorte.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <p className="font-medium text-(--brand-petrol) dark:text-foreground">
                Nenhuma ação neste recorte
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {`Das ${inteiro(totalPosicoes)} posições avaliadas, nenhuma está descoberta aqui.`}
              </p>
            </CardContent>
          </Card>
        ) : null}

        {SECOES.map((s) => {
          const daSecao = porSecao.get(s.id) ?? [];
          const total = totalSecao.get(s.id) ?? 0;
          if (total === 0) return null;

          return (
            <section key={s.id} className="space-y-3">
              <div
                className="flex flex-wrap items-center gap-3 rounded-lg px-4 py-3"
                style={{ background: s.cor, color: `var(--faixa-${s.id}-ink, #fff)` }}
              >
                <s.icone className="size-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold">{s.rotulo}</p>
                  <p className="text-sm opacity-80">{s.sub}</p>
                </div>
                <p className="font-mono text-2xl font-bold tabular-nums">{inteiro(total)}</p>
              </div>

              {ORDEM_ACOES.map((acao) => {
                const doGrupo = daSecao.filter((l) => l.acao === acao);
                if (doGrupo.length === 0) return null;

                const chaveGrupo = `${s.id}:${acao}`;
                const aberto = expandidos.has(chaveGrupo);
                const mostradas = aberto ? doGrupo : doGrupo.slice(0, LIMITE_GRUPO);
                const Icone = ICONE_ACAO[acao];

                return (
                  <div key={acao} className="space-y-2 pl-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 border-b pb-1.5">
                      <Icone className="size-4 shrink-0 self-center text-(--brand-petrol) dark:text-(--brand-turquoise)" />
                      <p className="font-semibold text-(--brand-petrol) dark:text-foreground">
                        {ROTULO_ACAO[acao]}
                      </p>
                      <span className="font-mono text-sm tabular-nums text-muted-foreground">
                        {doGrupo.length}
                      </span>
                      <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                        {EXPLICACAO_ACAO[acao]}
                      </span>
                    </div>

                    <div className="grid gap-2">
                      {mostradas.map((l) => (
                        <LinhaTarefa
                          key={l.chave}
                          chave={l.chave}
                          codigo={l.codigo}
                          filial={l.filial}
                          acao={l.acao}
                        >
                          <Conteudo linha={l} critico={coberturas.critico} />
                        </LinhaTarefa>
                      ))}
                    </div>

                    {doGrupo.length > LIMITE_GRUPO ? (
                      <Link
                        href={href({
                          ver: aberto
                            ? [...expandidos].filter((x) => x !== chaveGrupo)
                            : [...expandidos, chaveGrupo],
                        })}
                        scroll={false}
                        className="inline-block text-sm font-medium text-(--brand-petrol) underline underline-offset-2 dark:text-(--brand-turquoise)"
                      >
                        {aberto
                          ? "Ver menos"
                          : `Ver as outras ${doGrupo.length - LIMITE_GRUPO}`}
                      </Link>
                    ) : null}
                  </div>
                );
              })}
            </section>
            );
          })}
          </div>
        </ChecklistProvider>

        {gravada ? <LeituraIa briefing={gravada.resultado.analise.briefing} /> : null}
      </div>
    </DashboardShell>
  );
}

/**
 * O conteúdo de uma linha: identificação, a ação em uma frase, e o número que a
 * justifica.
 *
 * Três camadas em ordem de leitura. Quem já conhece o item lê só a primeira; quem
 * vai agir lê a segunda; quem precisa justificar a decisão lê a terceira.
 */
function Conteudo({ linha: l, critico }: { linha: LinhaCockpit; critico: number }) {
  const acao = frase(l, critico);

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <Link
          href={`/produto/${encodeURIComponent(l.codigo)}`}
          className="font-mono text-sm font-semibold text-(--brand-petrol) underline underline-offset-2 dark:text-(--brand-turquoise)"
        >
          {l.codigo}
        </Link>
        <Badge variant="secondary" className="font-mono text-xs">
          {`CD ${l.filial}`}
        </Badge>
        <DiasBadge linha={l} />
        {l.acelerada && l.origem !== "aceleracao" ? (
          <Badge className="bg-(--brand-green)/15 text-xs font-medium text-(--brand-green)">
            {`Venda ${num(l.indiceRitmo, 1)}× o previsto`}
          </Badge>
        ) : null}
        {l.curva !== "—" ? (
          <Badge variant="outline" className="text-xs">{`Curva ${l.curva}`}</Badge>
        ) : null}
      </div>

      <p className="mt-1 truncate text-xs text-muted-foreground">
        {`${l.descricao ?? "sem descrição"} · ${l.fornecedor}`}
      </p>

      <p className="mt-2 flex items-start gap-1.5 text-sm font-medium">
        <ArrowRight className="mt-0.5 size-4 shrink-0 text-(--brand-green)" />
        <span>{acao.titulo}</span>
      </p>
      {acao.detalhe ? (
        <p className="ml-5.5 mt-0.5 text-sm text-muted-foreground">{acao.detalhe}</p>
      ) : null}
      {acao.alternativa ? (
        <p className="ml-5.5 mt-1 flex items-start gap-1.5 text-sm text-teal-700 dark:text-teal-300">
          <Truck className="mt-0.5 size-3.5 shrink-0" />
          <span>{acao.alternativa}</span>
        </p>
      ) : null}

      <p className="mt-2 border-t pt-1.5 text-[11px] text-muted-foreground">{acao.numeros}</p>
    </>
  );
}

/** Badge da cobertura, na cor da faixa da Disponibilidade. */
function DiasBadge({ linha: l }: { linha: LinhaCockpit }) {
  // Na seção de aceleração o número que importa é o do ritmo real: o do
  // forecast é justamente o que está enganando.
  const usaRitmo = l.origem === "aceleracao";
  const dias = usaRitmo ? l.diasNoRitmo : l.diasChao;
  const cor = usaRitmo ? "var(--brand-green)" : `var(--faixa-${l.faixa})`;
  const tinta = usaRitmo ? "#fff" : `var(--faixa-${l.faixa}-ink)`;

  return (
    <span
      className="rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums"
      style={{ background: cor, color: tinta }}
      title={usaRitmo ? "Cobertura no ritmo de venda do mês" : "Cobertura pelo forecast"}
    >
      {`${num(dias, dias !== null && dias < 10 ? 1 : 0)} dias`}
    </span>
  );
}

/**
 * A frase da ação.
 *
 * Cada caso diz o que fazer, com quem e até quando — nunca "avaliar" ou
 * "acompanhar". Se a tela não consegue nomear a próxima ação concreta, ela não
 * deveria estar pedindo a atenção do analista.
 */
function frase(
  l: LinhaCockpit,
  critico: number
): { titulo: string; detalhe: string; alternativa: string | null; numeros: string } {
  const qtd = l.quantidade === null ? "" : `${num(l.quantidade)} un`;

  // Números de apoio, iguais em todas as ações: é a conferência de quem
  // questionar a prioridade.
  const numeros = [
    `Forecast ${num(l.forecast)} un/mês`,
    `chão ${num(l.estoqueChao)} un`,
    `vendido no mês ${num(l.vendidoMes)} un`,
    l.origem === "aceleracao"
      ? `cobertura real ${num(l.diasNoRitmo, 1)} dias contra ${num(l.diasChao, 0)} do forecast`
      : `${num(l.diasDescobertos, 0)} dias descobertos`,
    `${num(l.impacto)} un em risco`,
  ].join(" · ");

  // Transferência como alternativa quando a ação principal é outra: existe uma
  // carga a caminho, mas ela chega tarde e há CD que resolve antes.
  const alternativa =
    l.acao !== "transferir" && l.transferencia
      ? `Alternativa: transferir ${num(l.transferencia.quantidade)} un do CD ${l.transferencia.origem}` +
        ` — chega ${dataBr(l.transferencia.data)}, ${l.transferencia.sla} dias úteis.`
      : null;

  if (l.acao === "cobrar" && l.chegada) {
    const c = l.chegada;
    const doc = c.documento
      ? `${c.origem === "compra" ? "pedido" : "NF"} ${c.documento}`
      : c.origem === "compra"
        ? "o pedido"
        : "a transferência";
    return {
      titulo: `Cobrar ${doc} com ${l.fornecedor}: ${num(c.quantidade)} un previstas para ${dataBr(c.data)}.`,
      detalhe: [
        c.reprojetada ? "A data original já venceu e foi reprojetada pelo prazo do Painel." : null,
        l.dataRuptura ? `O estoque acaba em ${dataBr(l.dataRuptura)}.` : null,
        c.rota ? `Percurso ${c.rota}.` : null,
        c.statusLogistica && c.statusLogistica !== "—" ? `Status: ${c.statusLogistica}.` : null,
        c.dataAgendada && c.dataAgendada !== "—" ? `Agendamento: ${c.dataAgendada}.` : null,
      ]
        .filter(Boolean)
        .join(" "),
      alternativa,
      numeros,
    };
  }

  if (l.acao === "transferir" && l.transferencia) {
    const t = l.transferencia;
    return {
      titulo: `Transferir ${qtd} do CD ${t.origem} — chega ${dataBr(t.data)}.`,
      detalhe:
        (t.tipo === "ponte"
          ? "Cobre só o vão até a carga já colocada chegar. "
          : "Não há nada a caminho; a remessa leva a cobertura ao alvo. ") +
        `${t.sla} dias úteis de trânsito. O CD de origem continua coberto depois de doar.`,
      alternativa: null,
      numeros,
    };
  }

  if (l.acao === "comprar") {
    const p = l.plano!;
    return {
      titulo: `Pedir colocação de ${qtd} — ainda há saldo no plano do mês.`,
      detalhe:
        `Plano ${num(p.plano)} un · já colocado ${num(p.aberto)} · recebido ${num(p.recebido)}` +
        ` · saldo ${num(p.saldo)} un. ${baseDoCalculo(l, critico)}`,
      alternativa,
      numeros,
    };
  }

  // Verba: o único item da lista que o analista não resolve sozinho.
  const p = l.plano;
  // Plano zerado e produto ausente do plano são a mesma situação para quem vai
  // pedir a aprovação — e chamar "plano de 0 un já consumido" de plano seria
  // uma frase sem sentido para quem lê.
  const semPlano = !p || p.plano <= 0;
  return {
    titulo: `Pedir aprovação de verba para ${qtd}.`,
    detalhe:
      (semPlano
        ? `Este produto não tem plano de compra para o mês${
            p && p.recebido > 0 ? `, embora já tenham entrado ${num(p.recebido)} un` : ""
          }. `
        : `O plano do mês (${num(p.plano)} un) já foi consumido: ${num(p.aberto)} colocadas e ${num(p.recebido)} recebidas. `) +
      `Não há CD de origem disponível para transferir. ${baseDoCalculo(l, critico)}`,
    alternativa,
    numeros,
  };
}

/**
 * De onde saiu a quantidade pedida.
 *
 * Nas posições de aceleração o consumo usado é o observado no mês, que pode ser
 * muito maior que o previsto — a diferença entre 480 mil e 15 mil unidades. Quem
 * vai levar esse número a uma aprovação precisa saber em que ritmo ele foi
 * calculado, senão o número parece arbitrário e é descartado.
 */
function baseDoCalculo(l: LinhaCockpit, critico: number): string {
  return l.origem === "aceleracao"
    ? `Quantidade para cobrir ${critico} dias no ritmo atual de venda` +
        ` (${num(l.vendidoMes)} un no mês, ${num(l.indiceRitmo, 1)}× o previsto).`
    : `Quantidade para cobrir os ${num(l.diasDescobertos, 0)} dias descobertos.`;
}

/**
 * A leitura da IA, embaixo e recolhida.
 *
 * Continua valendo como contexto, mas deixou de abrir a tela: quem chega aqui
 * de manhã precisa da fila, não de um parágrafo. Fica a um clique.
 */
function LeituraIa({ briefing }: { briefing: string }) {
  return (
    <Card>
      <details>
        <summary className="cursor-pointer list-none p-6 pb-0">
          <CardHeader className="p-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-(--brand-turquoise)" />
              Leitura da IA sobre o dia
            </CardTitle>
            <CardDescription>Contexto e padrões — clique para abrir.</CardDescription>
          </CardHeader>
        </summary>
        <CardContent className="pt-4">
          <p className="text-sm leading-relaxed">{briefing}</p>
        </CardContent>
      </details>
    </Card>
  );
}
