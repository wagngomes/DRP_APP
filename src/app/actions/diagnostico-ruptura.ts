"use server";

import { revalidatePath } from "next/cache";

import { exigirAdminOuErro } from "@/lib/autorizacao";
import { lerDataReferencia } from "@/lib/data-referencia.server";
import { processar } from "@/lib/diagnostico-ruptura/processar";
import { registrar } from "@/lib/seguranca/auditoria";

/**
 * Recalcula o diagnóstico de ruptura.
 *
 * Só administrador, e sob demanda — não no fim da importação. A carga diária
 * continua com a duração de hoje, e uma falha aqui nunca derruba o que está no
 * ar. Quem clica escolhe a hora do pico de memória, que é da ordem de 450 MB.
 *
 * A rodada substitui o retrato anterior da mesma versão de regras: o motor
 * responde "o que está rompido agora", e metade de um retrato antigo misturado
 * com metade de um novo não responderia nada.
 */
export async function recalcularDiagnostico(): Promise<
  | { ok: true; eventos: number; causas: number; duracaoMs: number }
  | { ok: false; erro: string }
> {
  const autorizado = await exigirAdminOuErro();
  if (!autorizado.ok) return { ok: false, erro: autorizado.erro };

  const data = await lerDataReferencia();

  try {
    const r = await processar(data);

    registrar("diagnostico_recalculado", {
      ator: autorizado.sessao.usuario.email,
      detalhe: `${r.eventos} eventos, ${r.causas} causas, ${(r.duracaoMs / 1000).toFixed(1)}s · abertura ${r.abertura.data ?? "ausente"} (${r.abertura.origem})`,
    });

    revalidatePath("/diagnostico-ruptura");
    return {
      ok: true,
      eventos: r.eventos,
      causas: r.causas,
      duracaoMs: r.duracaoMs,
    };
  } catch (erro) {
    // O erro vai para o log com a pilha; para a tela vai uma frase. Devolver a
    // mensagem crua do Postgres exporia nome de tabela e de coluna a quem não
    // precisa deles.
    console.error("[diagnostico-ruptura] rodada falhou:", erro);
    return {
      ok: false,
      erro: "O cálculo falhou. O erro foi registrado no log do servidor.",
    };
  }
}
