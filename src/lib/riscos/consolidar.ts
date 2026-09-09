/**
 * Junta a saída dos motores numa lista única, já classificada por seção.
 *
 * **A seção sai daqui, nunca da IA.** Regra fixa sobre datas e dias descobertos:
 * mesma base, mesma classificação, sempre. O modelo recebe a seção pronta e só
 * ordena dentro dela e escreve o texto — e a validação em `ia/schema.ts` reverte
 * qualquer tentativa de reclassificar.
 *
 * Uma posição pode aparecer em mais de um motor (rompida, com pedido a cobrar e
 * com transferência sugerida). Nesse caso vale a seção mais grave, e as demais
 * evidências entram como contexto do mesmo item — em vez de três linhas
 * repetindo o mesmo produto.
 */
import type { DadosComprarHoje, ItemComprarHoje } from "./comprar-hoje";
import type { DadosFollowup, ItemFollowup } from "./followup";
import type { DadosTransferencia, Sugestao } from "./transferencia";
import type { DadosRisco } from "./motor";
import { ORDEM_SECOES, type ItemDeRisco, type PosicaoRisco, type Secao } from "./tipos";

/** Evidências de uma posição, vindas de motores diferentes. */
export type Evidencias = {
  posicao: PosicaoRisco;
  compra?: ItemComprarHoje;
  followup?: ItemFollowup;
  transferencia?: Sugestao;
};

export type ItemConsolidado = ItemDeRisco & { evidencias: Evidencias };

function chave(codigo: string, filial: string): string {
  return `${codigo}|${filial}`;
}

/** Mais grave vence: urgente > recomendada > alerta > aviso. */
function maisGrave(a: Secao, b: Secao): Secao {
  return ORDEM_SECOES.indexOf(a) <= ORDEM_SECOES.indexOf(b) ? a : b;
}

export function consolidar(
  risco: DadosRisco,
  compra: DadosComprarHoje,
  followup: DadosFollowup,
  transferencia: DadosTransferencia
): ItemConsolidado[] {
  const mapa = new Map<string, Evidencias>();
  const secoes = new Map<string, Secao>();

  const marcar = (p: PosicaoRisco, secao: Secao, extra: Partial<Evidencias>) => {
    const k = chave(p.codigo, p.filial);
    const atual = mapa.get(k) ?? { posicao: p };
    mapa.set(k, { ...atual, ...extra });
    const anterior = secoes.get(k);
    secoes.set(k, anterior ? maisGrave(anterior, secao) : secao);
  };

  // Compra: a data limite passou ou é hoje — perde valor se não for feito agora.
  for (const c of compra.itens) {
    if (c.urgencia === "atrasado" || c.urgencia === "comprar_hoje") {
      marcar(c.posicao, "urgente", { compra: c });
    } else if (c.urgencia === "proximo") {
      marcar(c.posicao, "recomendada", { compra: c });
    }
  }

  // Rompido sem nada a caminho: não há o que cobrar, só o que comprar.
  for (const p of risco.posicoes) {
    if (p.severidade === "rompido" && p.reposicoes.length === 0) {
      marcar(p, "urgente", {});
    } else if (p.severidade === "no_limite") {
      marcar(p, "alerta", {});
    }
  }

  for (const f of followup.itens) marcar(f.posicao, f.secao, { followup: f });

  for (const s of transferencia.sugestoes) {
    marcar(s.posicao, "recomendada", { transferencia: s });
  }

  const itens: ItemConsolidado[] = [];
  for (const [k, ev] of mapa) {
    const secao = secoes.get(k)!;
    const p = ev.posicao;

    // O número que sustenta a prioridade muda conforme a evidência mais forte.
    const destaque = ev.compra?.dataLimite
      ? `limite de compra ${ev.compra.dataLimite.toLocaleDateString("pt-BR", { timeZone: "UTC" })}`
      : ev.transferencia
        ? `transferir ${Math.round(ev.transferencia.quantidade)} un de ${ev.transferencia.origem}`
        : `${Math.round(p.diasDescobertos)} dias descobertos`;

    itens.push({
      tipo: ev.compra ? "comprar" : ev.transferencia ? "transferencia" : "risco",
      secao,
      codigo: p.codigo,
      filial: p.filial,
      fornecedor: p.fornecedor,
      destaque,
      // Unidades sem cobertura: põe giro alto à frente de item parado.
      peso: p.diasDescobertos * p.consumoDiario,
      posicao: p,
      evidencias: ev,
    });
  }

  return itens.sort(
    (a, b) => ORDEM_SECOES.indexOf(a.secao) - ORDEM_SECOES.indexOf(b.secao) || b.peso - a.peso
  );
}

/** Mapa `codigo|filial` -> seção, usado para reconferir a resposta do modelo. */
export function secoesEsperadas(itens: ItemConsolidado[]): Map<string, Secao> {
  return new Map(itens.map((i) => [chave(i.codigo, i.filial), i.secao]));
}
