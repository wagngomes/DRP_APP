import { Grid3x3 } from "lucide-react";

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
  searchParams: Promise<{ fornecedor?: string | string[] }>;
}) {
  const sessao = await exigirSessao();
  const fornecedor = primeiro((await searchParams).fornecedor);

  const [data, parametros] = await Promise.all([
    lerDataReferencia(),
    lerParametros(),
  ]);

  const [dados, rotulos, mapaChegadas] = await Promise.all([
    carregarTabela(data, fornecedor),
    carregarRotulosFiliais(),
    // Só quando há grade: são dois segundos, e não faz sentido pagá-los para
    // uma tela que ainda está pedindo o laboratório.
    fornecedor ? carregarChegadas(data, parametros) : Promise.resolve(null),
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
              {fornecedor
                ? `${dados.linhas.length} produto(s) em ${dados.filiais.length} CD(s) · ${posicoes} posições · ${dataBr(data)}`
                : "Cada cruzamento de produto e CD é um elemento. Escolha um laboratório para montar a grade."}
            </p>
          </div>

          <FiltroFornecedor
            fornecedores={dados.fornecedores}
            atual={fornecedor}
            basePath="/disponibilidade/tabela"
          />
        </div>

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
