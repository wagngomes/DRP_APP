/**
 * SLA de transferência que respeita a coluna `ativo`.
 *
 * Regra do negócio: `ativo = 1` significa que a transferência entre aquele par
 * de filiais é permitida; `ativo = 0` significa que **não se pode transferir**
 * entre elas. Um par bloqueado não pode virar acusação — dizer "cabia
 * transferência" sobre uma rota que a operação não tem permissão de usar é
 * cobrar o impossível.
 *
 * O `carregarSla()` compartilhado não faz essa distinção: ele prefere o tempo
 * da linha ativa, mas **cai para a inativa** quando não há nenhuma ativa. São
 * **10 dos 81 pares** nessa situação, e hoje eles passam como transferíveis
 * tanto aqui quanto na tela de sugestão.
 *
 * **O `ativo` varia por tipo de produto.** A tabela tem uma linha por par e por
 * `mat_med`, e em 6 pares os dois discordam — `1010 → 1006` está bloqueado para
 * MAT e liberado para MED, por exemplo. Por isso a consulta devolve os dois
 * tempos separados, e quem pergunta diz de que tipo é o item.
 *
 * O sistema não tem hoje uma classificação MAT/MED confiável por item:
 * `produtos.tag_medic` vale 'S' para quase tudo, inclusive na BU MAT (1.815 de
 * 1.830), e `historico_vendas` perdeu a coluna de BU no enxugamento de 13/09. O
 * que sobra é a BU do forecast, que é inequívoca só em parte dos valores — e é
 * exatamente assim que `transitoAtivo` a usa: preciso onde dá, permissivo onde
 * não dá.
 *
 * Só lê.
 */
import { prisma } from "@/lib/prisma";
import { chaveSla } from "@/utils/projecao-transferencias";

/** Tempo de trânsito por tipo de produto. `null` quando o par está bloqueado. */
export type SlaAtivo = {
  /** Dias úteis para material; `null` = transferência não permitida. */
  mat: number | null;
  /** Dias úteis para medicamento; `null` = transferência não permitida. */
  med: number | null;
};

/**
 * Tempos de trânsito ativos por par de filiais.
 *
 * Par sem nenhuma linha ativa simplesmente não entra no mapa — e não entrar é
 * a resposta certa: o percurso existe no cadastro e a operação não pode usá-lo.
 */
export async function carregarSlaAtivo(): Promise<Map<string, SlaAtivo>> {
  const linhas = await prisma.$queryRawUnsafe<
    {
      filial_orig: string;
      filial_dest: string;
      mat: number | null;
      med: number | null;
    }[]
  >(
    `SELECT filial_orig, filial_dest,
            MAX(transit_time) FILTER (
              WHERE ativo::numeric = 1 AND upper(trim(mat_med)) = 'MAT'
            )::float8 AS mat,
            MAX(transit_time) FILTER (
              WHERE ativo::numeric = 1 AND upper(trim(mat_med)) = 'MED'
            )::float8 AS med
       FROM sla_transferencias
      WHERE filial_orig IS NOT NULL AND filial_dest IS NOT NULL
      GROUP BY 1, 2`,
  );

  const mapa = new Map<string, SlaAtivo>();
  for (const l of linhas) {
    if (l.mat === null && l.med === null) continue;
    mapa.set(chaveSla(l.filial_orig, l.filial_dest), {
      mat: l.mat,
      med: l.med,
    });
  }
  return mapa;
}

/**
 * BUs que correspondem a um tipo da tabela de SLA, sem ambiguidade.
 *
 * Só os nomes que são o próprio tipo. PREVENA, DERMATOLOGIA, Especialidades e
 * TECNOCOLD ficam de fora de propósito: não dá para saber de qual lado estão
 * sem alguém do negócio dizer, e chutar erraria em silêncio nos 6 pares em que
 * MAT e MED discordam.
 */
const BU_PARA_TIPO: Record<string, "mat" | "med"> = {
  MAT: "mat",
  "MAT-FAB": "mat",
  MED: "med",
};

/**
 * O tempo de trânsito permitido entre dois CDs para um item, ou `null` quando
 * a transferência não é permitida.
 *
 * Com BU conhecida, olha a linha daquele tipo: se ela está inativa, o par está
 * bloqueado para este item mesmo que o outro tipo esteja liberado.
 *
 * Com BU desconhecida, aceita o par se **qualquer** tipo estiver ativo, e usa o
 * maior tempo. É permissivo de propósito: sem saber o tipo do item, bloquear
 * seria inventar uma restrição; o que esta função garante em todo caso é que um
 * par sem nenhuma linha ativa nunca passa.
 */
export function transitoAtivo(
  sla: Map<string, SlaAtivo>,
  origem: string,
  destino: string,
  bu: string | null,
): number | null {
  const par = sla.get(chaveSla(origem, destino));
  if (!par) return null;

  const tipo = bu ? BU_PARA_TIPO[bu.trim().toUpperCase()] : undefined;
  if (tipo) return par[tipo];

  const candidatos = [par.mat, par.med].filter(
    (x): x is number => x !== null,
  );
  return candidatos.length > 0 ? Math.max(...candidatos) : null;
}
