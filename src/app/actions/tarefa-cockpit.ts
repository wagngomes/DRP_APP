"use server";

import { z } from "zod";

import { exigirAdminOuErro } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import { lerDataReferencia } from "@/lib/data-referencia.server";

const Entrada = z.object({
  codigo: z.string().min(1).max(40),
  filial: z.string().min(1).max(20),
  acao: z.enum(["cobrar", "transferir", "comprar", "verba"]),
  feito: z.boolean(),
});

/**
 * Marca ou desmarca uma tarefa do checklist do dia.
 *
 * A linha existir é o "feito"; desmarcar apaga. A data vem do servidor, e não
 * do cliente: o checklist é sempre o da data de referência em uso, e aceitar a
 * data pela requisição permitiria marcar tarefa de outro dia.
 */
export async function marcarTarefa(
  entrada: z.input<typeof Entrada>
): Promise<{ ok: true; feito: boolean; por: string } | { ok: false; erro: string }> {
  // Administrador, e não apenas sessão: o checklist é do cockpit, que é
  // restrito. A tela já não aparece para quem é consulta, mas Server Action é
  // um endpoint — e endpoint que confia na interface para se proteger não está
  // protegido.
  const autorizado = await exigirAdminOuErro();
  if (!autorizado.ok) return { ok: false, erro: autorizado.erro };

  const parsed = Entrada.safeParse(entrada);
  if (!parsed.success) return { ok: false, erro: "Dados inválidos" };
  const { codigo, filial, acao, feito } = parsed.data;

  const data = await lerDataReferencia();
  const dataSnapshot = new Date(`${data}T00:00:00.000Z`);
  const por = autorizado.sessao.usuario.name || autorizado.sessao.usuario.email;

  if (feito) {
    // Upsert e não create: dois analistas podem clicar na mesma linha quase
    // junto, e a segunda gravação não pode virar erro na tela de quem clicou.
    await prisma.tarefaCockpit.upsert({
      where: {
        data_snapshot_codigo_filial: { data_snapshot: dataSnapshot, codigo, filial },
      },
      create: {
        data_snapshot: dataSnapshot,
        codigo,
        filial,
        acao,
        concluida_por: por,
      },
      update: { acao, concluida_por: por, concluida_em: new Date() },
    });
  } else {
    await prisma.tarefaCockpit.deleteMany({
      where: { data_snapshot: dataSnapshot, codigo, filial },
    });
  }

  // Sem `revalidatePath` de propósito: a tela roda os motores de risco sobre
  // seis mil posições a cada renderização, e revalidar aqui faria cada clique
  // custar mais de um segundo de banco. O estado visível é atualizado no
  // cliente; o banco é lido de novo quando a página recarrega.
  return { ok: true, feito, por };
}
