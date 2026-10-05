import Link from "next/link";
import { Grid3x3, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { LegendaElemento } from "@/components/disponibilidade/legenda-elemento";
import { TabelaPeriodica } from "@/components/disponibilidade/tabela-periodica";
import { FiltroFornecedor } from "@/components/visao-geral/filtro-fornecedor";
import { COLUNA_CIA } from "@/utils/dias-estoque";
import { carregarTabela } from "@/lib/disponibilidade/tabela";
import { carregarChegadas, chaveChegada } from "@/lib/reposicoes/chegadas";
import type { Reposicao } from "@/lib/fornecedores/agregacao";
import { carregarRotulosFiliais } from "@/lib/transferencias/consultas";
import { exigirSessao } from "@/lib/autorizacao";
import { lerDataReferencia } from "@/lib/data-referencia.server";
import { lerParametros } from "@/lib/parametros.server";
import { dataBr } from "@/lib/visao-geral/formato";

/**
 * A disponibilidade como tabela periódica.
 *
 * O gráfico de barras responde "como está a rede"; esta tela responde "onde,
 * exatamente". A grade item × CD põe lado a lado posições que nas outras telas
 * só aparecem uma por vez, e a cor deixa o padrão saltar — uma linha inteira
 * vermelha é problema de item, uma coluna inteira vermelha é problema de CD.
 *
 * O laboratório é obrigatório, e isso é desenho, não limitação: sem filtro são
 * 5.677 posições, uma grade que o navegador monta e ninguém lê.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Tabela de disponibilidade · DRP_AI" };

function primeiro(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : undefined;
}

export default async function TabelaDisponibilidade({
  searchParams,
}: {
  searchParams: Promise<{
    fornecedor?: string | string[];
    produto?: string | string[];
  }>;
}) {
  const sessao = await exigirSessao();
  const params = await searchParams;
  const fornecedor = primeiro(params.fornecedor);
  const produto = primeiro(params.produto);
  const temRecorte = Boolean(fornecedor || produto);

  const [data, parametros] = await Promise.all([
    lerDataReferencia(),
    lerParametros(),
  ]);

  const [dados, rotulos, mapaChegadas] = await Promise.all([
    carregarTabela(data, fornecedor, produto),
    carregarRotulosFiliais(),
    // Só quando há grade: são dois segundos, e não faz sentido pagá-los para
    // uma tela que ainda está pedindo o laboratório.
    temRecorte ? carregarChegadas(data, parametros) : Promise.resolve(null),
  ]);

  // O mapa inteiro cobre a base toda; a tela só precisa das posições da grade,
  // e o componente recebe um objeto simples em vez de um Map (que não atravessa
  // a fronteira servidor-cliente).
  const chegadas: Record<string, Reposicao[]> = {};
  if (mapaChegadas) {
    for (const linha of dados.linhas) {
      const doItem: Reposicao[] = [];
      for (const filial of linha.celulas.keys()) {
        if (filial === COLUNA_CIA) continue;
        const r = mapaChegadas.get(chaveChegada(linha.codigo, filial));
        if (r && r.length > 0) {
          chegadas[`${linha.codigo}|${filial}`] = r;
          doItem.push(...r);
        }
      }
      // A coluna Cia junta o que chega em todos os CDs, ordenado por data: é a
      // resposta a "quando o item volta a ter estoque", sem o leitor abrir cinco
      // células para montar a linha do tempo de cabeça.
      if (doItem.length > 0) {
        chegadas[`${linha.codigo}|${COLUNA_CIA}`] = doItem.sort(
          (a, b) => a.chegada.getTime() - b.chegada.getTime(),
        );
      }
    }
  }

  // A Cia é coluna derivada: contá-la como posição inflaria o número que a tela
  // anuncia, e ninguém carregou nada a mais por causa dela.
  const posicoes = dados.linhas.reduce(
    (a, l) => a + [...l.celulas.keys()].filter((f) => f !== COLUNA_CIA).length,
    0,
  );

  return (
    <DashboardShell
      user={{ name: sessao.usuario.name, email: sessao.usuario.email }}
      papel={sessao.usuario.papel}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-medium tracking-widest text-muted-foreground uppercase">
              <Grid3x3 className="size-3.5" />
              Disponibilidade
            </p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-(--brand-petrol) dark:text-foreground">
              Tabela de cobertura
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {temRecorte
                ? `${dados.linhas.length} produto(s) em ${dados.filiais.length} CD(s) · ${posicoes} posições · ${dataBr(data)}`
                : "Cada cruzamento de produto e CD é um elemento. Escolha um laboratório ou busque um produto para montar a grade."}
            </p>
          </div>

          {/* Os dois filtros na mesma linha quando couber, empilhados no
              celular. `shrink-0` para o bloco não ser espremido pelo título,
              que é o que empurrava o laboratório para a linha de baixo. */}
          <div className="flex flex-wrap items-end gap-3 lg:shrink-0">
            {/* GET simples, como nas outras telas: o recorte vira URL e o link
                é compartilhável. */}
            <form
              action="/disponibilidade/tabela"
              className="flex w-full flex-wrap items-end gap-2 sm:w-auto"
            >
              {fornecedor ? (
                <input type="hidden" name="fornecedor" value={fornecedor} />
              ) : null}
              <div className="w-full space-y-1.5 sm:w-auto">
                <label
                  htmlFor="produto"
                  className="text-xs text-muted-foreground"
                >
                  Produto
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="produto"
                    name="produto"
                    defaultValue={produto ?? ""}
                    placeholder="Código ou descrição"
                    className="h-9 w-full pl-8 sm:w-44"
                  />
                </div>
              </div>
              <Button type="submit" variant="outline">
                Buscar
              </Button>
              {produto ? (
                <Button
                  variant="ghost"
                  render={
                    <Link
                      href={
                        fornecedor
                          ? `/disponibilidade/tabela?fornecedor=${encodeURIComponent(fornecedor)}`
                          : "/disponibilidade/tabela"
                      }
                    />
                  }
                >
                  <X className="size-4" />
                  Limpar
                </Button>
              ) : null}
            </form>

            <FiltroFornecedor
              fornecedores={dados.fornecedores}
              atual={fornecedor}
              basePath="/disponibilidade/tabela"
              extras={{ produto }}
            />
          </div>
        </div>

        {dados.truncado ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            A busca casou mais produtos do que cabe na grade. Estão os 300 de
            menor cobertura — estreite o recorte para ver os demais.
          </p>
        ) : null}

        <LegendaElemento />

        <TabelaPeriodica
          dados={dados}
          rotulos={Object.fromEntries(rotulos)}
          chegadas={chegadas}
        />
      </div>
    </DashboardShell>
  );
}
