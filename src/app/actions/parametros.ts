"use server";

import { cookies } from "next/headers";

import { exigirAdminOuErro } from "@/lib/autorizacao";
import {
  COOKIE_DIAS_ALVO,
  COOKIE_DIAS_CRITICO,
  COOKIE_DIAS_GATILHO,
  COOKIE_DIAS_PEDIDOS,
  COOKIE_DIAS_TRANSFERENCIAS,
  ehDiasValido,
  type Coberturas,
} from "@/lib/parametros";

const UM_ANO = 60 * 60 * 24 * 365;

const OPCOES_COOKIE = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: UM_ANO,
};

/** Grava os dois prazos de projeção. */
export async function definirParametros(
  diasTransferencias: number,
  diasPedidos: number
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const autorizado = await exigirAdminOuErro();
  if (!autorizado.ok) return { ok: false, erro: autorizado.erro };

  if (!ehDiasValido(diasTransferencias) || !ehDiasValido(diasPedidos)) {
    return { ok: false, erro: "Informe números inteiros entre 0 e 365." };
  }

  const jar = await cookies();
  jar.set(COOKIE_DIAS_TRANSFERENCIAS, String(diasTransferencias), OPCOES_COOKIE);
  jar.set(COOKIE_DIAS_PEDIDOS, String(diasPedidos), OPCOES_COOKIE);

  return { ok: true };
}

/** Grava as três faixas de cobertura usadas pelos motores de risco. */
export async function definirCoberturas(
  c: Coberturas
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const autorizado = await exigirAdminOuErro();
  if (!autorizado.ok) return { ok: false, erro: autorizado.erro };

  if (!ehDiasValido(c.critico) || !ehDiasValido(c.gatilho) || !ehDiasValido(c.alvo)) {
    return { ok: false, erro: "Informe números inteiros entre 0 e 365." };
  }
  if (c.gatilho > c.alvo) {
    return { ok: false, erro: "O gatilho não pode ser maior que o alvo." };
  }

  const jar = await cookies();
  jar.set(COOKIE_DIAS_CRITICO, String(c.critico), OPCOES_COOKIE);
  jar.set(COOKIE_DIAS_GATILHO, String(c.gatilho), OPCOES_COOKIE);
  jar.set(COOKIE_DIAS_ALVO, String(c.alvo), OPCOES_COOKIE);

  return { ok: true };
}
