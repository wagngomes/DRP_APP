import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

import { auth } from "@/lib/auth";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FiltroFornecedor } from "@/components/visao-geral/filtro-fornecedor";
import { FiltroLista } from "@/components/ui/filtro-lista";
import { GraficoFaixas } from "@/components/disponibilidade/grafico-faixas";
import { lerDataReferencia } from "@/lib/data-referencia.server";
import {
  FILIAL_CIA,
  contarCia,
  contarPorFaixa,
  listarFornecedores,
  listarItens,
  listarItensCia,
  type ItemDisponibilidade,
} from "@/lib/disponibilidade/consultas";
import { FAIXAS, faixaPorId, type FaixaId } from "@/utils/dias-estoque";
import { carregarChegadas, type Reposicao } from "@/lib/reposicoes/chegadas";
import { carregarRotulosFiliais } from "@/lib/transferencias/consultas";
import { lerParametros } from "@/lib/parametros.server";
import {
  DicaPercurso,
  type RemessaTexto,
} from "@/components/disponibilidade/dica-percurso";
import { dataBr, inteiro } from "@/lib/visao-geral/formato";

export const dynamic = "force-dynamic";

/** Recorte selecionado no gráfico e filtro de laboratório vivem na URL. */
type SearchParams = {
  fornecedor?: string | string[];
  filial?: string | string[];
  faixa?: string | string[];
  curva?: string | string[];
  bu?: string | string[];
  analista?: string | string[];
};

const primeiro = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

function numero(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export default async function Disponibilidade({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const params = await searchParams;
  const fornecedor = primeiro(params.fornecedor);
  const filial = primeiro(params.filial);
  const faixaBruta = primeiro(params.faixa);
  // Só aceita faixa conhecida — evita consulta com valor arbitrário da URL.
  const faixa = FAIXAS.some((f) => f.id === faixaBruta)
    ? (faixaBruta as FaixaId)
    : undefined;

  const curva = primeiro(params.curva);
  const analista = primeiro(params.analista);
  const dataReferencia = await lerDataReferencia();

  const [todasContagens, contagensCia, fornecedores] = await Promise.all([
    contarPorFaixa(dataReferencia, fornecedor),
    contarCia(dataReferencia, fornecedor),
    listarFornecedores(dataReferencia),
  ]);

  /** URL de cada opção de analista, preservando o fornecedor escolhido. */
  const hrefAnalista = (valor: string | undefined) => {
    const p = new URLSearchParams();
    if (fornecedor) p.set("fornecedor", fornecedor);
    if (valor) p.set("analista", valor);
    const qs = p.toString();
    return qs ? `/disponibilidade?${qs}` : "/disponibilidade";
  };

  const ordemRotulo = (a: string, b: string) =>
    a === "—" ? 1 : b === "—" ? -1 : a.localeCompare(b, "pt-BR");

  // A lista de analistas sai das contagens completas, antes de qualquer
  // recorte: senão escolher um analista esvaziaria o próprio seletor.
  const analistasPresentes = [...new Set(todasContagens.map((c) => c.analista))].sort(ordemRotulo);

  // O analista recorta o gráfico também, e não só a tabela: um filtro que
  // mudasse a lista sem mudar as barras faria as duas discordarem na mesma tela.
  const porAnalista = analista
    ? todasContagens.filter((c) => c.analista === analista)
    : todasContagens;

  // Uma guia por unidade de negócio, já dentro do recorte do analista — sem
  // isso a tela ofereceria uma BU que ficou sem nenhuma posição.
  const busPresentes = [...new Set(porAnalista.map((c) => c.bu))].sort(ordemRotulo);
  const buParam = primeiro(params.bu);
  const bu = buParam && busPresentes.includes(buParam) ? buParam : busPresentes[0];

  const contagens = bu ? porAnalista.filter((c) => c.bu === bu) : porAnalista;
  const ehCia = filial === FILIAL_CIA;
  const itens =
    filial && faixa
      ? ehCia
        ? await listarItensCia(dataReferencia, faixa, fornecedor, curva, bu, analista)
        : await listarItens(dataReferencia, filial, faixa, fornecedor, curva, bu, analista)
      : [];

  // Reposições a caminho, só quando há tabela para preencher: o cálculo projeta
  // todos os pedidos e transferências do dia e não vale a pena rodar quando
  // ninguém clicou em nenhuma barra.
  const [chegadas, rotulosFiliais] = itens.length
    ? await Promise.all([
        carregarChegadas(dataReferencia, await lerParametros()),
        carregarRotulosFiliais(),
      ])
    : [new Map<string, Reposicao[]>(), new Map<string, string>()];

  const rotulo = (codigo: string | null) =>
    codigo ? rotulosFiliais.get(codigo) ?? codigo : "—";

  const totalItens = contagens.reduce((soma, c) => soma + c.itens, 0);
  const faixaSelecionada = faixa ? faixaPorId(faixa) : undefined;

  // Um gráfico por curva ABC. A ordem é fixa (A, B, C) e o que não tem curva
  // classificada vai para o fim, em vez de sumir.
  const curvasPresentes = [...new Set(contagens.map((c) => c.curva))];
  const ordem = ["A", "B", "C"];
  const curvas = [
    ...ordem.filter((c) => curvasPresentes.includes(c)),
    ...curvasPresentes.filter((c) => !ordem.includes(c)).sort(),
  ];

  return (
    <DashboardShell user={{ name: session.user.name, email: session.user.email }}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-(--brand-petrol) dark:text-foreground">
              Disponibilidade
            </h1>
            <p className="text-muted-foreground">
              Dias de cobertura do estoque chão por centro de distribuição.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {fornecedor ? (
              <Badge className="bg-(--brand-turquoise) text-(--brand-petrol) text-sm">
                {`Laboratório: ${fornecedor}`}
              </Badge>
            ) : null}
            {bu && bu !== "—" ? (
              <Badge className="bg-(--brand-petrol) text-white text-sm">{`BU: ${bu}`}</Badge>
            ) : null}
            <Badge variant="secondary" className="text-sm">
              {`Referência: ${dataBr(dataReferencia)}`}
            </Badge>
          </div>
        </div>

        <Card>
          <CardContent className="grid gap-4 pt-6">
            <FiltroFornecedor
              fornecedores={fornecedores}
              atual={fornecedor}
              basePath="/disponibilidade"
            />

            <FiltroLista
              rotulo="Analista"
              atual={analista}
              hrefTodos={hrefAnalista(undefined)}
              opcoes={analistasPresentes.map((a) => ({
                valor: a,
                rotulo: a === "—" ? "Sem analista" : a,
                href: hrefAnalista(a),
                total: todasContagens
                  .filter((c) => c.analista === a)
                  .reduce((soma, c) => soma + c.itens, 0),
              }))}
            />
          </CardContent>
        </Card>

        {busPresentes.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 border-b pb-2">
            {busPresentes.map((item) => {
              const p = new URLSearchParams();
              if (fornecedor) p.set("fornecedor", fornecedor);
              if (analista) p.set("analista", analista);
              p.set("bu", item);
              const ativo = bu === item;
              const total = porAnalista
                .filter((c) => c.bu === item)
                .reduce((soma, c) => soma + c.itens, 0);
              return (
                <Link
                  key={item}
                  href={`/disponibilidade?${p}`}
                  scroll={false}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    ativo
                      ? "bg-(--brand-petrol) text-white dark:bg-(--brand-turquoise) dark:text-(--brand-petrol)"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item === "—" ? "Sem BU" : item}
                  <span className={`ml-1.5 text-xs ${ativo ? "opacity-80" : "opacity-70"}`}>
                    {inteiro(total)}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Dias de estoque por CD</CardTitle>
            <CardDescription>
              {`${inteiro(totalItens)} itens válidos (forecast maior que zero e torre "considerar"). Cada barra soma 100% dos itens do CD; o número acima é o total de itens válidos.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {totalItens === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                Nenhum item válido para esta data e filtro.
              </p>
            ) : (
              <>
                {/* Legenda única para os três gráficos: as faixas são as mesmas. */}
                <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {FAIXAS.map((f) => (
                    <li key={f.id} className="flex items-center gap-1.5 text-xs">
                      <span
                        className="size-2.5 shrink-0 rounded-[2px]"
                        style={{ background: `var(--faixa-${f.id})` }}
                      />
                      <span className="text-muted-foreground">{f.rotulo}</span>
                    </li>
                  ))}
                </ul>

                {curvas.map((c) => {
                  const doCurva = contagens.filter((x) => x.curva === c);
                  // Visão consolidada da mesma curva/BU, para a coluna "Cia".
                  const mapaCia = new Map(
                    contagensCia
                      .filter((x) => x.curva === c && (!bu || x.bu === bu))
                      .map((x) => [x.faixa, x.itens] as const)
                  );
                  const total = doCurva.reduce((soma, x) => soma + x.itens, 0);
                  // A tabela abre ao lado do gráfico da curva clicada, para o
                  // resultado ficar junto do que o gerou.
                  const aqui = Boolean(filial && faixaSelecionada && curva === c);
                  return (
                    <div key={c} className="space-y-2">
                      <p className="flex items-baseline gap-2 border-b pb-1.5">
                        <span className="text-base font-semibold text-(--brand-petrol) dark:text-foreground">
                          {c === "—" ? "Sem curva" : `Curva ${c}`}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {`${inteiro(total)} itens · ${((total / totalItens) * 100).toFixed(1)}% do total`}
                        </span>
                      </p>

                      {/* O gráfico mantém a largura natural (no máximo ~730px)
                          e a tabela ocupa o resto: assim as barras não encolhem
                          nem mudam de lugar quando ela aparece. Abaixo de xl a
                          tela é estreita demais para os dois lado a lado. */}
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
                        <div className="min-w-0 xl:shrink-0">
                          <GraficoFaixas
                            contagens={doCurva}
                            filialAtiva={filial}
                            faixaAtiva={faixa}
                            curvaAtiva={curva}
                            curva={c}
                            bu={bu}
                            cia={mapaCia}
                            fornecedor={fornecedor}
                          />
                        </div>

                        {aqui ? (
                          <div className="min-w-0 flex-1">
                            <TabelaItens
                              itens={itens}
                              ehCia={ehCia}
                              filial={filial!}
                              faixa={faixaSelecionada!}
                              curva={curva}
                              chegadas={chegadas}
                              rotulo={rotulo}
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}

                <p className="text-xs text-muted-foreground">
                  Clique em uma faixa para ver os itens dela ao lado do gráfico.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Rede de segurança: se a curva do clique não estiver entre as
            exibidas (URL editada à mão, dado mudou), a tabela ainda aparece. */}
        {filial && faixaSelecionada && !curvas.includes(curva ?? "") ? (
          <TabelaItens
            itens={itens}
            ehCia={ehCia}
            filial={filial}
            faixa={faixaSelecionada}
            curva={curva}
            chegadas={chegadas}
            rotulo={rotulo}
          />
        ) : null}
      </div>
    </DashboardShell>
  );
}

/**
 * Converte as reposições para texto puro antes de cruzar para o cliente.
 *
 * O tooltip é um componente client e `Reposicao` carrega `Date` em vários
 * campos. Formatar aqui mantém o payload pequeno e a formatação de data no
 * servidor, onde o fuso é previsível.
 */
function paraTexto(
  lista: Reposicao[],
  rotulo: (codigo: string | null) => string
): RemessaTexto[] {
  const dia = (d: Date) => dataBr(d.toISOString().slice(0, 10));
  return lista.map((r) => ({
    documento: r.documento ?? "—",
    quantidade: numero(r.quantidade),
    emissao: r.emissao ? dia(r.emissao) : null,
    origem: r.origem,
    inicio: r.inicio,
    reprojetada: r.reprojetada,
    entradaDireta: r.etapas.length === 0 ? dia(r.chegada) : null,
    etapas: r.etapas.map((e) => ({
      de: rotulo(e.de),
      para: rotulo(e.para),
      data: e.chegadaPrevista ? dia(e.chegadaPrevista) : "sem SLA",
    })),
  }));
}

/** Itens do recorte clicado no gráfico. */
function TabelaItens({
  itens,
  ehCia,
  filial,
  faixa,
  curva,
  chegadas,
  rotulo,
}: {
  itens: ItemDisponibilidade[];
  ehCia: boolean;
  filial: string;
  faixa: { rotulo: string };
  curva?: string;
  /** Reposições projetadas, indexadas por `codigo|cdFinal`. */
  chegadas: Map<string, Reposicao[]>;
  rotulo: (codigo: string | null) => string;
}) {
  /**
   * O que vem para este item neste CD, separado por origem.
   *
   * A chave é o **CD final da rota**, não o próximo passo: uma transferência que
   * passa por três centros só conta como saldo do destino. É o mesmo critério
   * usado nas telas de produto e fornecedores.
   */
  const reposicoes = (codigo: string, cd: string, origem: Reposicao["origem"]) =>
    (chegadas.get(`${codigo}|${cd}`) ?? []).filter((r) => r.origem === origem);

  const somar = (lista: Reposicao[]) => lista.reduce((a, r) => a + r.quantidade, 0);

  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-sm font-semibold text-(--brand-petrol) dark:text-foreground">
        {`${ehCia ? "Visão Cia" : `CD ${filial}`} · ${faixa.rotulo}${curva ? ` · ${curva === "—" ? "sem curva" : `curva ${curva}`}` : ""}`}
      </p>
      <p className="mb-2 text-xs text-muted-foreground">
        {itens.length >= 500
          ? "Mostrando os 500 itens com menor cobertura deste recorte."
          : `${inteiro(itens.length)} ${ehCia ? "posição(ões) item × CD" : "item(ns)"}, do menor para o maior número de dias.`}
      </p>

      {/* Mesma altura do gráfico ao lado, com rolagem própria. */}
      <div className="max-h-96 overflow-auto rounded-md border">
        <Table>
          {/* Cabeçalho fixo: a tabela rola dentro de 384px e sem isso os
              títulos somem depois de poucas linhas. */}
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead>Código</TableHead>
              {/* Na visão Cia a posição é item × CD, então o CD precisa
                  aparecer: o mesmo código sai em mais de uma linha. */}
              {ehCia ? <TableHead>CD</TableHead> : null}
              <TableHead className="text-right">Forecast</TableHead>
              <TableHead className="text-right">Estoque chão</TableHead>
              <TableHead className="text-right">Dias chão</TableHead>
              <TableHead className="text-right">Dias total</TableHead>
              <TableHead className="text-right whitespace-nowrap">Transf. em aberto</TableHead>
              <TableHead className="text-right whitespace-nowrap">Compras em aberto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={ehCia ? 8 : 7}
                  className="py-8 text-center text-muted-foreground"
                >
                  Nenhum item neste recorte.
                </TableCell>
              </TableRow>
            ) : (
              itens.map((item) => (
                <TableRow key={`${item.filial}-${item.codigo}`}>
                  <TableCell className="font-mono">
                    <Link
                      href={`/produto/${encodeURIComponent(item.codigo)}`}
                      className="text-(--brand-petrol) underline underline-offset-2 dark:text-(--brand-turquoise)"
                    >
                      {item.codigo}
                    </Link>
                  </TableCell>
                  {ehCia ? (
                    <TableCell className="font-mono text-sm">{item.filial}</TableCell>
                  ) : null}
                  <TableCell className="text-right font-mono tabular-nums">
                    {numero(item.forecast)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {numero(item.estoqueChao)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {numero(item.diasChao)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                    {numero(item.diasTotal)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DicaPercurso
                      total={numero(somar(reposicoes(item.codigo, item.filial, "transferencia")))}
                      remessas={paraTexto(
                        reposicoes(item.codigo, item.filial, "transferencia"),
                        rotulo
                      )}
                      cor="text-teal-700 dark:text-teal-300"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <DicaPercurso
                      total={numero(somar(reposicoes(item.codigo, item.filial, "compra")))}
                      remessas={paraTexto(reposicoes(item.codigo, item.filial, "compra"), rotulo)}
                      cor="text-amber-700 dark:text-amber-400"
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}


