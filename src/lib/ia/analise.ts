/**
 * Orquestra a análise: motores → dossiê → modelo → validação.
 *
 * É a única função que a tela precisa chamar. Falha sempre de forma explícita e
 * nunca derruba a página: sem chave, com erro de API ou com resposta inválida,
 * devolve `{ ok: false, erro }` e quem chama decide o que mostrar — em geral a
 * análise anterior, que continua gravada.
 */
import { createHash } from "node:crypto";

import { extrairJson, gerarTexto, MODELO } from "./cliente";
import { montarDossie, type Dossie } from "./dossie";
import { montarPrompt, montarPromptComAnterior, SYSTEM } from "./prompt";
import { validarAnalise, type Analise } from "./schema";
import { consolidar, secoesEsperadas, type ItemConsolidado } from "@/lib/riscos/consolidar";
import { calcularRiscos } from "@/lib/riscos/motor";
import { calcularComprarHoje, type DadosComprarHoje } from "@/lib/riscos/comprar-hoje";
import { calcularFollowup } from "@/lib/riscos/followup";
import { calcularTransferencias } from "@/lib/riscos/transferencia";
import { calcularAnomaliasVenda, type DadosVendas } from "@/lib/riscos/vendas";
import { carregarSla } from "@/lib/transferencias/consultas";
import type { Coberturas } from "@/lib/parametros";
import type { ParametrosProjecao } from "@/lib/reposicoes/chegadas";
import type { DadosRisco } from "@/lib/riscos/motor";

export type EntradaAnalise = {
  risco: DadosRisco;
  consolidado: ItemConsolidado[];
  vendas: DadosVendas;
  /** Lacunas de cadastro que deixam posições fora do cálculo de compra. */
  lacunas: DadosComprarHoje["lacunas"];
  dossie: Dossie;
  /** Identifica a entrada: muda quando os dados mudam, e a análise fica obsoleta. */
  hash: string;
};

/**
 * Roda os motores e monta o dossiê, sem chamar o modelo.
 *
 * Separado de propósito: a tela precisa dos números mesmo quando não há análise
 * gerada, e o hash permite detectar que a análise gravada envelheceu.
 */
export async function prepararEntrada(
  data: string,
  parametros: ParametrosProjecao,
  coberturas: Coberturas
): Promise<EntradaAnalise> {
  const risco = await calcularRiscos(data, parametros, coberturas);
  const [compra, sla, vendas] = await Promise.all([
    calcularComprarHoje(data, risco.posicoes, coberturas.critico),
    carregarSla(),
    calcularAnomaliasVenda(),
  ]);

  const followup = calcularFollowup(risco.posicoes);
  const transferencia = calcularTransferencias(
    risco.posicoes,
    coberturas,
    sla,
    new Date(`${data}T00:00:00.000Z`)
  );

  const consolidado = consolidar(risco, compra, followup, transferencia);
  const dossie = montarDossie(data, risco, consolidado, vendas, coberturas);

  return {
    risco,
    consolidado,
    vendas,
    lacunas: compra.lacunas,
    dossie,
    hash: createHash("sha256").update(dossie.texto).digest("hex").slice(0, 16),
  };
}

export type ResultadoAnalise =
  | {
      ok: true;
      analise: Analise;
      modelo: string;
      tokensEntrada: number;
      tokensSaida: number;
      /** Itens que o modelo citou e não existiam no dossiê. */
      descartados: number;
      /** Itens cuja seção o modelo tentou mudar e foi revertida. */
      secoesCorrigidas: number;
    }
  | { ok: false; erro: string };

/** Chama o modelo sobre uma entrada já preparada. */
export async function gerarAnalise(
  entrada: EntradaAnalise,
  briefingAnterior?: string
): Promise<ResultadoAnalise> {
  const prompt = briefingAnterior
    ? montarPromptComAnterior(entrada.dossie.texto, briefingAnterior)
    : montarPrompt(entrada.dossie.texto);

  const resposta = await gerarTexto(SYSTEM, prompt);
  if (!resposta.ok) return { ok: false, erro: resposta.erro };

  const json = extrairJson(resposta.texto);
  if (json === null) {
    // Truncamento é a causa mais comum e tem solução diferente de resposta
    // malformada: pedir menos itens ou elevar o teto de saída.
    const cortada = resposta.motivoParada === "max_tokens";
    return {
      ok: false,
      erro: cortada
        ? `Resposta cortada no limite de tokens (${resposta.tokensSaida} de saída). Reduza o número de itens pedidos ou aumente o teto.`
        : `O modelo não devolveu JSON reconhecível (parada: ${resposta.motivoParada}).`,
    };
  }

  // Só os itens enviados podem ser citados: o modelo não viu o resto.
  const validado = validarAnalise(json, secoesEsperadas(entrada.dossie.enviados));
  if (!validado.ok) {
    return { ok: false, erro: `Resposta fora do formato: ${validado.erro}` };
  }

  return {
    ok: true,
    analise: validado.analise,
    modelo: MODELO,
    tokensEntrada: resposta.tokensEntrada,
    tokensSaida: resposta.tokensSaida,
    descartados: validado.descartados,
    secoesCorrigidas: validado.secoesCorrigidas,
  };
}
