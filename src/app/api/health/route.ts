import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

/**
 * Saúde da aplicação, para o healthcheck do contêiner e o monitoramento externo.
 *
 * Verifica o banco de verdade, com um `SELECT 1`: um endpoint que responde 200
 * só por o processo estar de pé mente exatamente no caso que mais importa —
 * aplicação viva sem banco, que é quando o orquestrador precisa reiniciar ou
 * tirar a instância do balanceador.
 *
 * Devolve 503 quando o banco não responde, porque é o código que faz o Docker e
 * o Kubernetes agirem. E informa a latência medida, útil para separar "banco
 * fora" de "banco lento".
 */
export const dynamic = "force-dynamic";

const TEMPO_LIMITE_MS = 5_000;

export async function GET() {
  const inicio = Date.now();

  try {
    await Promise.race([
      prisma.$queryRawUnsafe("SELECT 1"),
      new Promise((_, rejeitar) =>
        setTimeout(() => rejeitar(new Error("tempo limite")), TEMPO_LIMITE_MS)
      ),
    ]);

    return NextResponse.json({
      status: "ok",
      banco: { conectado: true, latenciaMs: Date.now() - inicio },
      versao: process.env.npm_package_version ?? "dev",
      tempoDeVidaSegundos: Math.round(process.uptime()),
      em: new Date().toISOString(),
    });
  } catch (erro) {
    return NextResponse.json(
      {
        status: "degradado",
        banco: {
          conectado: false,
          latenciaMs: Date.now() - inicio,
          erro: erro instanceof Error ? erro.message : "falha desconhecida",
        },
        em: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
