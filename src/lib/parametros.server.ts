import { cookies } from "next/headers";

import {
  ALVO_PADRAO,
  COOKIE_DIAS_ALVO,
  COOKIE_DIAS_CRITICO,
  COOKIE_DIAS_GATILHO,
  COOKIE_DIAS_PEDIDOS,
  COOKIE_DIAS_TRANSFERENCIAS,
  CRITICO_PADRAO,
  GATILHO_PADRAO,
  normalizarCoberturas,
  normalizarDias,
  type Coberturas,
  type Parametros,
} from "@/lib/parametros";

/** Lê os parâmetros de projeção do cookie, caindo no padrão quando ausentes. */
export async function lerParametros(): Promise<Parametros> {
  const jar = await cookies();
  return {
    diasTransferencias: normalizarDias(jar.get(COOKIE_DIAS_TRANSFERENCIAS)?.value),
    diasPedidos: normalizarDias(jar.get(COOKIE_DIAS_PEDIDOS)?.value),
  };
}

/** Lê as faixas de cobertura do cookie, caindo nos padrões quando ausentes. */
export async function lerCoberturas(): Promise<Coberturas> {
  const jar = await cookies();
  return normalizarCoberturas({
    critico: normalizarDias(jar.get(COOKIE_DIAS_CRITICO)?.value, CRITICO_PADRAO),
    gatilho: normalizarDias(jar.get(COOKIE_DIAS_GATILHO)?.value, GATILHO_PADRAO),
    alvo: normalizarDias(jar.get(COOKIE_DIAS_ALVO)?.value, ALVO_PADRAO),
  });
}
