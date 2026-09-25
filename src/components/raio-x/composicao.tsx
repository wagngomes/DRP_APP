import Link from "next/link";
import { ChevronDown, ChevronRight, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type {
  DivisaoSop,
  GrupoContrato,
  RaioXProduto,
} from "@/lib/sop/consultas";
import { faixaAcuracidade } from "@/utils/acuracidade";
import { corDivisao, num, pct, TOM_FAIXA } from "./formato";

/** A composição inteira numa barra: a proporção antes de qualquer número. */
export function BarraComposicao({
  divisoes,
  total,
}: {
  divisoes: DivisaoSop[];
  total: number;
}) {
  if (total <= 0) return null;
  return (
    <div className="flex h-3 overflow-hidden rounded-full bg-muted">
      {divisoes
        .filter((d) => d.consenso > 0)
        .map((d) => (
          <div
            key={d.divisao}
            className={corDivisao(d.divisao).barra}
            style={{ width: `${(d.consenso / total) * 100}%` }}
            title={`${d.divisao}: ${num(d.consenso)}`}
          />
        ))}
    </div>
  );
}

export function LinhaDivisao({
  divisao: d,
  total,
  contratos,
  aberta,
  href,
  consensoContratos,
}: {
  divisao: DivisaoSop;
  total: number;
  /** Detalhe a abrir sob a linha; só "Contratos" tem um. */
  contratos: RaioXProduto["contratos"] | null;
  aberta: boolean;
  href: string;
  consensoContratos: number;
}) {
  const cor = corDivisao(d.divisao);
  const parte = total > 0 ? d.consenso / total : 0;
  const podeAbrir = contratos !== null && contratos.grupos.length > 0;
  const confere =
    Math.abs(contratos ? contratos.total - consensoContratos : 0) < 0.5;

  const linha = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
      {podeAbrir ? (
        aberta ? (
          <ChevronDown className="size-4 shrink-0 text-(--brand-turquoise)" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        )
      ) : (
        <span className="size-4 shrink-0" />
      )}
      <span className={`size-2.5 shrink-0 rounded-full ${cor.barra}`} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {d.divisao}
      </span>
      <span className="font-mono text-xs text-muted-foreground tabular-nums">
        {pct(parte, 0)}
      </span>
      <span
        className={`font-mono text-sm font-semibold tabular-nums ${cor.texto}`}
      >
        {num(d.consenso)}
      </span>
      {/* Realizado ausente não é zero: a venda não carrega a marca da divisão,
          então não há como apurar. Dizer "0" seria afirmar que não vendeu. */}
      {d.realizado === null ? (
        <span className="w-28 text-right text-xs text-muted-foreground">
          sem apuração
        </span>
      ) : (
        <span className="w-28 text-right font-mono text-sm tabular-nums">
          {`→ ${num(d.realizado)}`}
        </span>
      )}
      <span
        className={`w-20 rounded-md px-1.5 py-0.5 text-right font-mono text-xs tabular-nums ${
          TOM_FAIXA[faixaAcuracidade(d.erro === null ? null : 1 - d.erro)]
        }`}
      >
        {d.erro === null ? "—" : `erro ${pct(d.erro, 0)}`}
      </span>
    </div>
  );

  return (
    <div
      className={`rounded-md border bg-muted/20 ${aberta ? "ring-1 ring-(--brand-turquoise)/40" : ""}`}
    >
      {podeAbrir ? (
        <Link
          href={href}
          scroll={false}
          className="block transition-colors hover:bg-muted/40"
        >
          {linha}
        </Link>
      ) : (
        linha
      )}

      {/* O detalhe dos contratos vive aqui, sob a divisão que ele explica.
          Solto no fim da página, obrigava a ligar duas coisas distantes: o
          número de cima e a lista de baixo. */}
      {aberta && contratos ? (
        <div className="border-t bg-card px-3 py-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary" className="gap-1">
              <Users className="size-3" />
              {`${contratos.clientes} cliente(s) em ${contratos.grupos.length} grupo(s)`}
            </Badge>
            {confere ? (
              <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                confere com o S&amp;OP
              </Badge>
            ) : (
              <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400">
                {`difere do S&OP em ${num(Math.abs(contratos.total - consensoContratos))} un`}
              </Badge>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-2 text-left font-medium">Grupo</th>
                  <th className="py-2 text-left font-medium">Representante</th>
                  <th className="py-2 text-right font-medium">Clientes</th>
                  <th className="py-2 text-right font-medium">Qtd inicial</th>
                  <th className="py-2 text-right font-medium">Qtd final</th>
                  <th className="py-2 text-right font-medium">Vendido</th>
                  <th className="py-2 text-right font-medium">
                    Fora do contrato
                  </th>
                  <th className="py-2 text-right font-medium">Atingimento</th>
                </tr>
              </thead>
              <tbody>
                {contratos.grupos.map((g) => (
                  <LinhaGrupo key={g.grupo} grupo={g} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LinhaGrupo({ grupo: g }: { grupo: GrupoContrato }) {
  const atingimento = g.contratado > 0 ? g.vendido / g.contratado : null;
  return (
    <tr className="border-b last:border-0 hover:bg-muted/40">
      <td className="py-2">
        <div className="flex items-center gap-2">
          <Link
            href={`/produto?q=${encodeURIComponent(g.grupo)}`}
            className="truncate font-medium"
            title={g.grupo}
          >
            {g.grupo}
          </Link>
          {/* Quem veio do arquivo e não do cadastro merece marca: é grupo que
              ninguém cadastrou, e a soma dele não conversa com as outras telas. */}
          {g.origem === "arquivo" ? (
            <Badge
              variant="outline"
              className="shrink-0 text-[10px] text-muted-foreground"
            >
              fora do cadastro
            </Badge>
          ) : null}
        </div>
      </td>
      <td className="py-2 text-xs text-muted-foreground">
        {/* Um representante em 177 dos 186 grupos. Quando há mais, dizer
            quantos é mais honesto que escolher um e omitir o resto. */}
        {g.representante ??
          (g.representantes > 1 ? `${g.representantes} representantes` : "—")}
      </td>
      <td className="py-2 text-right font-mono text-xs text-muted-foreground tabular-nums">
        {g.clientes}
      </td>
      <td className="py-2 text-right font-mono text-muted-foreground tabular-nums">
        {num(g.quantidadeInicial)}
      </td>
      <td className="py-2 text-right font-mono font-semibold tabular-nums">
        {num(g.contratado)}
      </td>
      <td className="py-2 text-right font-mono tabular-nums">
        {num(g.vendido)}
      </td>
      {/* Compra de outro CNPJ do mesmo grupo. Não entra no atingimento — o
          contrato é com o CNPJ — mas dizer que o grupo comprou por fora é
          informação comercial, e escondê-la no Spot faria o Spot parecer
          demanda nova. */}
      <td className="py-2 text-right font-mono text-xs tabular-nums text-muted-foreground">
        {g.vendidoForaDoContrato > 0 ? num(g.vendidoForaDoContrato) : "—"}
      </td>
      <td className="py-2 text-right">
        <span
          className={`inline-block rounded-md px-1.5 py-0.5 font-mono text-xs tabular-nums ${
            atingimento === null
              ? TOM_FAIXA.sem
              : atingimento >= 0.9
                ? TOM_FAIXA.boa
                : atingimento >= 0.6
                  ? TOM_FAIXA.razoavel
                  : TOM_FAIXA.ruim
          }`}
        >
          {pct(atingimento, 0)}
        </span>
      </td>
    </tr>
  );
}
