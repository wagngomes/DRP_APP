"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigirAdminOuErro } from "@/lib/autorizacao";
import { ehIsoValido } from "@/lib/data-referencia";
import { CHAVE_DATA_REFERENCIA, gravarConfiguracao } from "@/lib/configuracao.server";
import { registrar } from "@/lib/seguranca/auditoria";

const schema = z.object({
  data: z.string().refine(ehIsoValido, "Data inválida (esperado yyyy-mm-dd)"),
});

/**
 * Define a data de referência do sistema — para todos, não só para quem muda.
 *
 * Era gravada em cookie, e portanto valia só no navegador de quem alterava.
 * Agora vai ao banco: o administrador ajusta e a equipe inteira passa a
 * trabalhar sobre o mesmo dia, que é o único jeito de duas pessoas discutirem a
 * mesma tela sem estarem vendo coisas diferentes.
 */
export async function definirDataReferencia(
  data: string
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const autorizado = await exigirAdminOuErro();
  if (!autorizado.ok) return { ok: false, erro: autorizado.erro };

  const parsed = schema.safeParse({ data });
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? "Data inválida" };
  }

  await gravarConfiguracao(
    CHAVE_DATA_REFERENCIA,
    parsed.data.data,
    autorizado.sessao.usuario.email
  );

  // Muda o número de todas as telas, para todo mundo: vale registrar quem e
  // quando, porque é a primeira pergunta quando alguém estranha um resultado.
  registrar("parametro_alterado", {
    ator: autorizado.sessao.usuario.email,
    detalhe: `data de referência = ${parsed.data.data}`,
  });

  // Toda tela depende da data. Sem isto, quem já tinha a página aberta seguiria
  // vendo o dia anterior até recarregar à mão.
  revalidatePath("/", "layout");
  return { ok: true };
}
