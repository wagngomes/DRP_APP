import { NextResponse } from "next/server";

import { metricas } from "@/lib/observabilidade/metricas";

/**
 * Métricas no formato de exposição do Prometheus.
 *
 * Sem sessão de propósito: quem consulta é o Prometheus, que não faz login. A
 * proteção correta é de rede — no compose a porta não é publicada para fora, e
 * em produção o endpoint fica atrás do gateway, liberado só para a faixa do
 * coletor. Autenticar aqui daria uma falsa sensação de segurança e quebraria a
 * coleta.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const m = metricas();
  return new NextResponse(await m.registro.metrics(), {
    headers: { "Content-Type": m.registro.contentType },
  });
}
