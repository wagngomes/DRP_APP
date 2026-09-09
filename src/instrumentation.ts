/**
 * Ponto de instrumentação do Next.
 *
 * Deliberadamente magro: nenhuma API de Node aqui. O Next compila este arquivo
 * também para o runtime Edge, e todo `node:` que aparecesse viraria erro de
 * build. O que precisa do Node mora em `lib/observabilidade/instrumentar-http`,
 * carregado sob a guarda de runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { metricas } = await import("@/lib/observabilidade/metricas");
  // Cria o registro já no boot: assim as métricas de processo existem no
  // primeiro scrape, em vez de aparecerem só depois do primeiro acesso.
  metricas();

  const { instrumentarServidorHttp } = await import(
    "@/lib/observabilidade/instrumentar-http"
  );
  await instrumentarServidorHttp();
}

/**
 * Erros não tratados no render ou nas rotas.
 *
 * Conta para o alerta e registra em log estruturado — sem isto, um erro em
 * produção só apareceria quando alguém reclamasse.
 */
export async function onRequestError(
  erro: unknown,
  requisicao: { path: string },
  contexto: { routeType: string }
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { metricas, rotularRota } = await import("@/lib/observabilidade/metricas");
  const rota = rotularRota(requisicao.path ?? "desconhecida");
  metricas().errosNaoTratados.inc({ rota });

  console.error(
    JSON.stringify({
      nivel: "erro",
      rota,
      tipo: contexto.routeType,
      mensagem: erro instanceof Error ? erro.message : String(erro),
      stack: erro instanceof Error ? erro.stack : undefined,
      em: new Date().toISOString(),
    })
  );
}
