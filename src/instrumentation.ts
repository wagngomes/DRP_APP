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

  const { instrumentarServidorHttp } =
    await import("@/lib/observabilidade/instrumentar-http");
  await instrumentarServidorHttp();

  await avisarConfiguracaoAberta();
}

/**
 * Grita quando a instalação sobe com o cadastro aberto.
 *
 * Sem lista de domínios, qualquer pessoa que alcance a tela de entrada cria
 * conta e vê estoque, vendas, fornecedores e clientes. Foi o que aconteceu aqui:
 * a variável não chegava ao contêiner, a lista chegava vazia, e o sistema rodou
 * semanas assim — sem nada, em lugar nenhum, dizendo que a porta estava
 * encostada.
 *
 * O aviso no boot é o mínimo. Configuração perigosa precisa ser barulhenta, e
 * silêncio não é sinal de que está tudo bem.
 */
async function avisarConfiguracaoAberta() {
  const { dominiosPermitidos } = await import("@/utils/email-permitido");
  if (dominiosPermitidos().length > 0) return;

  console.warn(
    "[SEGURANCA] CADASTRO ABERTO: EMAIL_DOMINIOS_PERMITIDOS não está definida, " +
      "então qualquer endereço de e-mail pode criar conta e ver os dados da " +
      "empresa. Defina a lista de domínios e reinicie.",
  );
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
  contexto: { routeType: string },
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { metricas, rotularRota } =
    await import("@/lib/observabilidade/metricas");
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
    }),
  );
}
