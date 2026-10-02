import { Grid3x3 } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { TabelaPeriodica } from "@/components/disponibilidade/tabela-periodica";
import { FiltroFornecedor } from "@/components/visao-geral/filtro-fornecedor";
import { FAIXAS } from "@/utils/dias-estoque";
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
      for (const filial of linha.celulas.keys()) {
        const chave = chaveChegada(linha.codigo, filial);
        const r = mapaChegadas.get(chave);
        if (r && r.length > 0) chegadas[`${linha.codigo}|${filial}`] = r;
      }
    }
  }

  const posicoes = dados.linhas.reduce((a, l) => a + l.celulas.size, 0);

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

        {/* A legenda explica o elemento antes da grade. Sem ela, quatro números
            num quadrado de três centímetros são adivinhação. */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border bg-muted/20 p-3 text-xs">
          <span className="flex items-center gap-2">
            <span className="flex size-14 shrink-0 flex-col justify-between rounded-md border bg-card p-1 text-[9px] leading-none text-muted-foreground">
              <span className="text-right">total</span>
              <span className="text-center text-base font-bold text-foreground">
                chão
              </span>
              <span className="text-center">qtd</span>
              <span className="text-center">%</span>
            </span>
            <span className="text-muted-foreground">
              <span className="block">
                <b className="text-foreground">centro</b> · dias de estoque chão
              </span>
              <span className="block">
                <b className="text-foreground">topo</b> · dias de estoque total
              </span>
              <span className="block">
                <b className="text-foreground">abaixo</b> · quantidade em chão
              </span>
              <span className="block">
                <b className="text-foreground">rodapé</b> · do forecast já
                vendido
              </span>
            </span>
          </span>

          <span className="flex flex-wrap items-center gap-2">
            {FAIXAS.map((f) => (
              <span key={f.id} className="flex items-center gap-1.5">
                <span
                  className="size-3 rounded-sm"
                  style={{ backgroundColor: `var(--faixa-${f.id})` }}
                />
                {f.rotulo}
              </span>
            ))}
          </span>
        </div>

        <TabelaPeriodica
          dados={dados}
          rotulos={Object.fromEntries(rotulos)}
          chegadas={chegadas}
        />
      </div>
    </DashboardShell>
  );
}
