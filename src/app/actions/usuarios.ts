"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { exigirAdminOuErro } from "@/lib/autorizacao";
import { PAPEIS } from "@/utils/papeis";
import { registrar } from "@/lib/seguranca/auditoria";

const Entrada = z.object({
  id: z.string().min(1).max(64),
  papel: z.enum(PAPEIS as [string, ...string[]]),
});

/**
 * Troca o papel de uma conta.
 *
 * Duas travas além da checagem de administrador:
 *
 * Ninguém rebaixa a si mesmo. Não é para proteger a pessoa — é para proteger o
 * sistema: um administrador distraído que se rebaixa pode deixar a instalação
 * sem nenhum, e a única saída seria o script de linha de comando.
 *
 * E o último administrador não pode ser rebaixado por ninguém, pelo mesmo
 * motivo. As duas coisas juntas garantem que sempre exista uma porta aberta.
 */
export async function trocarPapel(
  entrada: z.input<typeof Entrada>
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const auth = await exigirAdminOuErro();
  if (!auth.ok) return { ok: false, erro: auth.erro };

  const parsed = Entrada.safeParse(entrada);
  if (!parsed.success) return { ok: false, erro: "Dados inválidos" };
  const { id, papel } = parsed.data;

  if (id === auth.sessao.usuario.id && papel !== "admin") {
    return {
      ok: false,
      erro: "Você não pode remover o próprio acesso de administrador. Peça a outro administrador.",
    };
  }

  if (papel !== "admin") {
    const admins = await prisma.user.count({ where: { role: "admin" } });
    const alvo = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (alvo?.role === "admin" && admins <= 1) {
      return {
        ok: false,
        erro: "Este é o único administrador. Promova outra pessoa antes de rebaixá-lo.",
      };
    }
  }

  const alterado = await prisma.user.update({
    where: { id },
    data: { role: papel },
    select: { email: true },
  });

  // Mudança de permissão é o evento que mais importa numa investigação: é como
  // um acesso indevido vira acesso legítimo.
  registrar("papel_alterado", {
    ator: auth.sessao.usuario.email,
    alvo: alterado.email,
    detalhe: `papel definido como ${papel}`,
  });

  revalidatePath("/usuarios");
  return { ok: true };
}
