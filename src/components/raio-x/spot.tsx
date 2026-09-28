import { CalendarRange, Sparkles, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { ClienteSpot, DetalheSpot } from "@/lib/sop/consultas";
import { num } from "./formato";

const MESES_CURTOS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/** "2026-05" -> "mai/26". */
function mesCurto(iso: string): string {
  const [ano, mes] = iso.split("-");
  return `${MESES_CURTOS[Number(mes) - 1]}/${ano.slice(2)}`;
}

/**
 * Quem comprou fora de contrato, e se isso é novidade.
 *
 * O card de Spot diz *quanto* saiu; esta tabela diz *de quem* — e, sobretudo,
 * se é demanda nova. Cliente que compra 120 todo mês e comprou 120 agora não é
 * novidade: é contrato que ninguém assinou. Cliente que nunca comprou e levou
 * 200 é outra conversa, e as duas exigem ações diferentes.
 *
 * Média e mediana lado a lado porque um mês atípico puxa a média e não mexe na
 * mediana. Quando as duas se afastam, o histórico é irregular e a média sozinha
 * enganaria.
 */

/** Quanto o mês fugiu do costume do cliente. */
function Comparacao({ cliente: c }: { cliente: ClienteSpot }) {
  if (c.meses === 0) {
    return (
      <Badge className="gap-1 bg-violet-500/10 text-violet-700 dark:text-violet-400">
        <Sparkles className="size-3" />
        primeira compra
      </Badge>
    );
  }

  // A mediana como referência, não a média: é ela que resiste ao mês atípico,
  // e comparar contra a média faria um pico antigo esconder o desvio de hoje.
  const base = c.mediana ?? c.media ?? 0;
  if (base <= 0) return <span className="text-muted-foreground">—</span>;

  const razao = c.atual / base;
  // 20% de folga dos dois lados: abaixo disso é oscilação normal de compra, e
  // marcar tudo como desvio treinaria o olho a ignorar a coluna.
  if (razao > 1.2) {
    return (
      <span className="font-mono text-xs font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
        {`+${Math.round((razao - 1) * 100)}%`}
      </span>
    );
  }
  if (razao < 0.8) {
    return (
      <span className="font-mono text-xs font-semibold text-rose-700 tabular-nums dark:text-rose-400">
        {`−${Math.round((1 - razao) * 100)}%`}
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">no costume</span>;
}

export function TabelaSpot({ spot }: { spot: DetalheSpot }) {
  return (
    <div className="border-t bg-card px-3 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="secondary" className="gap-1">
          <Users className="size-3" />
          {`${spot.clientes.length + (spot.demais?.clientes ?? 0)} cliente(s) sem contrato`}
        </Badge>
        {spot.novos > 0 ? (
          <Badge className="gap-1 bg-violet-500/10 text-violet-700 dark:text-violet-400">
            <Sparkles className="size-3" />
            {`${spot.novos} comprando pela primeira vez`}
          </Badge>
        ) : null}

        {/* Sobre quantos meses a média fala. Sem isto, "média 15" não diz se
            são quinze de três meses ou de um só — e é essa diferença que decide
            se vale confiar no número. */}
        <Badge variant="outline" className="gap-1 font-normal">
          <CalendarRange className="size-3" />
          {spot.historico.meses === 0
            ? "sem histórico anterior"
            : `histórico: ${spot.historico.meses} ${spot.historico.meses === 1 ? "mês" : "meses"}${
                spot.historico.de && spot.historico.ate
                  ? ` (${mesCurto(spot.historico.de)} a ${mesCurto(spot.historico.ate)})`
                  : ""
              }`}
        </Badge>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-2xl text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="py-2 text-left font-medium">Cliente</th>
              <th className="py-2 text-right font-medium">Comprou no mês</th>
              <th className="py-2 text-right font-medium">Média</th>
              <th className="py-2 text-right font-medium">Mediana</th>
              <th className="py-2 text-right font-medium">Meses</th>
              <th className="py-2 text-right font-medium">vs. costume</th>
            </tr>
          </thead>
          <tbody>
            {spot.clientes.map((c) => (
              <tr
                key={c.cnpj}
                className="border-b last:border-0 hover:bg-muted/40"
              >
                <td className="py-1.5 pr-3">
                  <span className="block truncate font-medium">{c.nome}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {c.grupo ?? c.cnpj}
                  </span>
                </td>
                <td className="py-1.5 text-right font-mono font-semibold tabular-nums">
                  {num(c.atual)}
                </td>
                <td className="py-1.5 text-right font-mono text-muted-foreground tabular-nums">
                  {c.media === null ? "—" : num(c.media)}
                </td>
                <td className="py-1.5 text-right font-mono text-muted-foreground tabular-nums">
                  {c.mediana === null ? "—" : num(c.mediana)}
                </td>
                <td className="py-1.5 text-right font-mono text-muted-foreground tabular-nums">
                  {c.meses}
                </td>
                <td className="py-1.5 text-right">
                  <Comparacao cliente={c} />
                </td>
              </tr>
            ))}

            {/* A cauda vira uma linha só: neste item são 79 clientes somando
                menos que o terceiro colocado, e listá-los empurraria para fora
                da tela justamente os que importam. */}
            {spot.demais ? (
              <tr className="border-t bg-muted/30">
                <td className="py-1.5 pr-3 text-muted-foreground italic">
                  {`demais ${spot.demais.clientes} cliente(s)`}
                </td>
                <td className="py-1.5 text-right font-mono font-semibold tabular-nums">
                  {num(spot.demais.atual)}
                </td>
                <td colSpan={4} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
