import { cookies } from "next/headers";

import { COOKIE_DATA_REFERENCIA, ehIsoValido, paraIso } from "@/lib/data-referencia";

/**
 * Data de referência atual, lida do cookie. Fica separada de
 * `@/lib/data-referencia` porque depende de `next/headers`: assim a resolução
 * do filtro continua sendo lógica pura, testável fora do Next.
 *
 * Sem cookie (primeiro acesso), assume hoje — o comportamento que o usuário
 * espera ao abrir o sistema.
 */
export async function lerDataReferencia(): Promise<string> {
  const valor = (await cookies()).get(COOKIE_DATA_REFERENCIA)?.value;
  if (valor && ehIsoValido(valor)) return valor;
  return paraIso(new Date());
}
