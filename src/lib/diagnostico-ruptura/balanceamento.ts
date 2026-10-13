/**
 * A transferência que teria resolvido — se é que existia uma.
 *
 * O motor dizia "cabia transferência" sempre que **qualquer** sobra existisse na
 * rede, em qualquer CD, de qualquer tamanho. Medido em setembro: 204 das 458
 * posições (45%), o que esvazia o sinal — e produzia frases como *"transferir 1
 * unidade teria evitado"*, que ninguém leva para uma reunião.
 *
 * Aqui a pergunta é outra: **a operação teria conseguido fazer essa
 * transferência?** São quatro travas, e todas vêm das regras que a tela de
 * sugestão já usa, porque o diagnóstico não pode cobrar uma transferência que a
 * outra tela nunca sugeriria:
 *
 *   1. o doador tem estoque **no armazém 01** acima do Alvo, no dia do despacho
 *   2. existe SLA cadastrado entre os dois CDs
 *   3. o SLA cabia: despachando no prazo, a carga chegava antes da ruptura
 *   4. a quantidade era **material** — cobre pelo menos o Gatilho no destino
 *
 * Aplicado ao mesmo mês, isso derruba o sinal de 204 para 70 posições: 45% para
 * 15%. O que sai não é ruído, é acusação que não se sustenta — em 111 casos não
 * dava tempo de a carga chegar, e em 23 a sobra não cobria nem o Gatilho.
 *
 * Funções puras. Recebem os fatos já carregados e não tocam banco.
 */
import { subtrairDiasUteis } from "@/utils/projecao-transferencias";
import type { SobraNoCd } from "./eventos";

/** A transferência que teria evitado a ruptura, com o CD e o prazo. */
export type Oportunidade = {
  /** CD que tinha a sobra. */
  cd: string;
  /** Dias úteis de trânsito entre ele e o destino. */
  sla: number;
  /** Último dia em que o despacho ainda chegaria antes da ruptura. */
  despacharAte: string;
  /** Sobra acima do Alvo que o doador tinha naquele dia. */
  sobra: number;
  /** Quanto a operação teria mandado: até o Alvo, limitado pela sobra. */
  quantidade: number;
  /** Dias de cobertura que a remessa entrega no destino. */
  diasCobertos: number;
};

export type EntradaOportunidade = {
  /** CD que rompeu. */
  destino: string;
  /** Primeiro dia sem estoque. */
  inicioDaRuptura: string;
  /** Primeiro dia da janela analisada: antes dele não há sobra medida. */
  de: string;
  /** Consumo diário do destino, pelo forecast. */
  consumoDiario: number;
  /** Sobra por CD, por dia: `data -> lista de doadores do item`. */
  sobraPorDia: Map<string, SobraNoCd[]>;
  /** `chaveSla(origem, destino) -> dias úteis`. */
  sla: Map<string, number>;
  gatilho: number;
  alvo: number;
};

/**
 * A melhor transferência que teria evitado a ruptura, ou `null`.
 *
 * "Melhor" é a de menor SLA entre as viáveis — a mesma escolha da tela de
 * sugestão, e pelo mesmo motivo: quanto antes chega, mais folga sobra para o
 * imprevisto.
 */
export function oportunidadeDeTransferencia(
  e: EntradaOportunidade,
): Oportunidade | null {
  // Sem consumo não há ruptura a evitar, e dividir por zero produziria uma
  // necessidade infinita que acusaria todo mundo.
  if (e.consumoDiario <= 0) return null;

  // Materialidade: a remessa tem de tirar o destino do Gatilho. Menos que isso
  // é uma transferência que a operação não faria e que não mudaria a decisão de
  // ninguém — e é exatamente o caso da "uma unidade".
  const minimo = e.consumoDiario * e.gatilho;
  if (minimo <= 0) return null;

  let melhor: Oportunidade | null = null;

  for (const [chave, dias] of e.sla) {
    const [origem, destino] = chave.split(">");
    if (destino !== e.destino || origem === e.destino) continue;

    const despacharAte = subtrairDiasUteis(
      new Date(`${e.inicioDaRuptura}T00:00:00.000Z`),
      Math.round(dias),
    )
      .toISOString()
      .slice(0, 10);

    // Fora da janela não há sobra medida, e supor que havia seria inventar.
    if (despacharAte < e.de) continue;

    const doador = (e.sobraPorDia.get(despacharAte) ?? []).find(
      (d) => d.filial === origem,
    );
    if (!doador || doador.sobra < minimo) continue;

    // Quanto a operação mandaria: leva o destino ao Alvo, limitado pela sobra.
    const quantidade = Math.min(doador.sobra, e.consumoDiario * e.alvo);
    const candidata: Oportunidade = {
      cd: origem,
      sla: dias,
      despacharAte,
      sobra: doador.sobra,
      quantidade,
      diasCobertos: quantidade / e.consumoDiario,
    };

    if (!melhor || dias < melhor.sla) melhor = candidata;
  }

  return melhor;
}
