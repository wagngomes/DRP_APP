"use server";

import { cookies } from "next/headers";
import { z } from "zod";

import { exigirAdminOuErro } from "@/lib/autorizacao";
import { COOKIE_DATA_REFERENCIA, ehIsoValido } from "@/lib/data-referencia";

const schema = z.object({
  data: z.string().refine(ehIsoValido, "Data inválida (esperado yyyy-mm-dd)"),
});

/** Um ano — a data de referência é preferência de trabalho, não sessão. */
const UM_ANO = 60 * 60 * 24 * 365;

export async function definirDataReferencia(
  data: string
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const autorizado = await exigirAdminOuErro();
  if (!autorizado.ok) return { ok: false, erro: autorizado.erro };

  const parsed = schema.safeParse({ data });
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? "Data inválida" };
  }

  (await cookies()).set(COOKIE_DATA_REFERENCIA, parsed.data.data, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: UM_ANO,
  });

  return { ok: true };
}
