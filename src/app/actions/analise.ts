"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { gerarAnalise, prepararEntrada } from "@/lib/ia/analise";
import { montarResultado } from "@/lib/ia/resultado";
import { gravarAnalise, lerAnalise } from "@/lib/ia/persistencia";
import { lerDataReferencia } from "@/lib/data-referencia.server";
import { lerCoberturas, lerParametros } from "@/lib/parametros.server";

/**
 * Gera a análise do dia e grava.
 *
 * Falha sem destruir: qualquer erro devolve mensagem e a análise anterior
 * continua no banco, intacta.
 */
export async function gerarAnaliseCockpit(): Promise<
  { ok: true; itens: number } | { ok: false; erro: string }
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, erro: "Não autenticado" };

  const [data, parametros, coberturas] = await Promise.all([
    lerDataReferencia(),
    lerParametros(),
    lerCoberturas(),
  ]);

  const entrada = await prepararEntrada(data, parametros, coberturas);

  // Com análise anterior, o modelo destaca o que mudou em vez de repetir o quadro.
  const anterior = await lerAnalise(data);
  const r = await gerarAnalise(entrada, anterior?.resultado.analise.briefing);
  if (!r.ok) return { ok: false, erro: r.erro };

  await gravarAnalise({
    data,
    modelo: r.modelo,
    parametros: { ...parametros, ...coberturas },
    entradaHash: entrada.hash,
    tokensEntrada: r.tokensEntrada,
    tokensSaida: r.tokensSaida,
    resultado: montarResultado(entrada, r.analise),
  });

  revalidatePath("/cockpit");
  return { ok: true, itens: r.analise.itens.length };
}
