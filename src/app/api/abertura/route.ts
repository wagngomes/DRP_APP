import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { exigirAdminOuErro } from "@/lib/autorizacao";
import { gravarConfiguracao, lerConfiguracoes } from "@/lib/configuracao.server";
import { prisma } from "@/lib/prisma";
import { chaveAbertura, mesDaChave, PREFIXO_ABERTURA } from "@/utils/abertura-mes";

/**
 * Marca qual carga do simulador vale como a abertura de um mês.
 *
 * A marca mora em `configuracao_sistema` — chave e valor, sem migração e sem
 * coluna nova. A alternativa seria um booleano no próprio simulador, mas a
 * marca é do mês e não da linha: ficaria repetida em doze mil linhas iguais.
 */
const corpoSchema = z.object({
  /** Mês que está sendo aberto, `aaaa-mm`. */
  mes: z.string().regex(/^\d{4}-\d{2}$/),
  /** Data do snapshot, ou `null` para desmarcar. */
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});

export async function GET() {
  const auth = await exigirAdminOuErro();
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: auth.status });

  const config = await lerConfiguracoes();
  const marcas: Record<string, string> = {};
  for (const [chave, valor] of config) {
    const mes = mesDaChave(chave);
    if (mes) marcas[mes] = valor;
  }
  return NextResponse.json({ marcas });
}

export async function POST(request: NextRequest) {
  const auth = await exigirAdminOuErro();
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: auth.status });

  const corpo = corpoSchema.safeParse(await request.json().catch(() => null));
  if (!corpo.success) {
    return NextResponse.json({ error: "Mês ou data inválidos" }, { status: 400 });
  }
  const { mes, data } = corpo.data;

  if (data !== null) {
    // Marcar uma carga que não existe deixaria a tela vazia sem explicação —
    // e o erro só apareceria semanas depois, ao abrir o mês.
    const existe = await prisma.simulador.count({
      where: { data_snapshot: new Date(`${data}T00:00:00.000Z`) },
    });
    if (existe === 0) {
      return NextResponse.json(
        { error: `Não há carga do simulador em ${data}` },
        { status: 400 }
      );
    }
  }

  await gravarConfiguracao(chaveAbertura(mes), data ?? "", auth.sessao.usuario.email);
  return NextResponse.json({ mes, data, chave: `${PREFIXO_ABERTURA}${mes}` });
}
