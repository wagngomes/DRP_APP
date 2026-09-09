/**
 * Métricas no formato Prometheus.
 *
 * Um registro único por processo, guardado no `globalThis` pelo mesmo motivo do
 * cliente Prisma: em desenvolvimento o Next recarrega os módulos a cada
 * alteração, e um registro novo a cada recarga zeraria os contadores e ainda
 * quebraria com "métrica já registrada".
 *
 * O que é medido aqui é o que se acompanha em qualquer sistema em produção:
 * duração e volume de requisição por rota, erros por classe de status,
 * requisições em andamento, duração das consultas ao banco e a saúde do
 * processo (memória, CPU, atraso do event loop, coletor de lixo). O painel do
 * Grafana em `observabilidade/grafana/` consome exatamente estes nomes.
 */
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from "prom-client";

type Global = typeof globalThis & { __metricas?: Metricas };

export type Metricas = {
  registro: Registry;
  duracaoRequisicao: Histogram<"metodo" | "rota" | "status">;
  totalRequisicoes: Counter<"metodo" | "rota" | "status">;
  requisicoesEmCurso: Gauge<"metodo">;
  duracaoConsulta: Histogram<"operacao">;
  errosNaoTratados: Counter<"rota">;
  importacoes: Counter<"tabela" | "resultado">;
  analisesIa: Counter<"tipo" | "resultado">;
};

/**
 * Faixas em segundos. Escolhidas para este sistema, não copiadas de um padrão:
 * as telas hoje respondem entre 0,3 s e 3 s, então a resolução precisa estar
 * concentrada aí. Sem faixas nessa região, o p95 cairia sempre no mesmo balde e
 * não mostraria melhora nem piora.
 */
const FAIXAS_REQUISICAO = [0.05, 0.1, 0.25, 0.5, 1, 2, 3, 5, 10];
const FAIXAS_CONSULTA = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5];

function criar(): Metricas {
  const registro = new Registry();
  registro.setDefaultLabels({ aplicacao: "drp_ai" });

  // Memória, CPU, event loop e coletor de lixo do processo Node.
  collectDefaultMetrics({ register: registro, prefix: "drp_" });

  const duracaoRequisicao = new Histogram({
    name: "drp_http_request_duration_seconds",
    help: "Duração das requisições HTTP em segundos",
    labelNames: ["metodo", "rota", "status"] as const,
    buckets: FAIXAS_REQUISICAO,
    registers: [registro],
  });

  const totalRequisicoes = new Counter({
    name: "drp_http_requests_total",
    help: "Total de requisições HTTP",
    labelNames: ["metodo", "rota", "status"] as const,
    registers: [registro],
  });

  const requisicoesEmCurso = new Gauge({
    name: "drp_http_requests_in_flight",
    help: "Requisições sendo processadas neste instante",
    labelNames: ["metodo"] as const,
    registers: [registro],
  });

  const duracaoConsulta = new Histogram({
    name: "drp_db_query_duration_seconds",
    help: "Duração das consultas ao banco em segundos",
    labelNames: ["operacao"] as const,
    buckets: FAIXAS_CONSULTA,
    registers: [registro],
  });

  const errosNaoTratados = new Counter({
    name: "drp_unhandled_errors_total",
    help: "Erros não tratados capturados pela instrumentação",
    labelNames: ["rota"] as const,
    registers: [registro],
  });

  // Métricas de negócio: é o que diferencia um painel útil de um painel de
  // infraestrutura. Importação e análise de IA são as duas operações caras e
  // sujeitas a falha externa.
  const importacoes = new Counter({
    name: "drp_importacoes_total",
    help: "Importações de CSV por tabela e resultado",
    labelNames: ["tabela", "resultado"] as const,
    registers: [registro],
  });

  const analisesIa = new Counter({
    name: "drp_analises_ia_total",
    help: "Chamadas ao provedor de IA por tipo e resultado",
    labelNames: ["tipo", "resultado"] as const,
    registers: [registro],
  });

  return {
    registro,
    duracaoRequisicao,
    totalRequisicoes,
    requisicoesEmCurso,
    duracaoConsulta,
    errosNaoTratados,
    importacoes,
    analisesIa,
  };
}

export function metricas(): Metricas {
  const g = globalThis as Global;
  g.__metricas ??= criar();
  return g.__metricas;
}

/**
 * Normaliza o caminho em rótulo de rota.
 *
 * Sem isto, `/produto/203089` e `/produto/998645` viram séries diferentes e o
 * Prometheus explode em cardinalidade — o erro clássico de quem instrumenta
 * HTTP pela primeira vez. Segmentos que são identificador viram `:id`.
 */
export function rotularRota(caminho: string): string {
  if (caminho === "/") return "/";

  // Recursos estáticos colapsam num rótulo só. Cada arquivo com hash no nome
  // criaria uma série nova a cada build, e o painel encheria de linhas que não
  // dizem nada sobre a aplicação.
  if (caminho.startsWith("/_next/static")) return "/_next/static/*";
  if (caminho.startsWith("/_next/image")) return "/_next/image";
  if (caminho.startsWith("/__nextjs") || caminho.startsWith("/_next/webpack")) {
    return "/_next/dev";
  }
  return (
    caminho
      .split("/")
      .map((seg) => {
        if (!seg) return seg;
        // Código de produto, cuid, uuid ou qualquer coisa longa demais para ser
        // um nome de rota.
        if (/^\d+$/.test(seg)) return ":id";
        if (/^c[a-z0-9]{20,}$/i.test(seg)) return ":id";
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg)) return ":id";
        return seg;
      })
      .join("/") || "/"
  );
}

/** Registra uma requisição concluída. */
export function registrarRequisicao(
  metodo: string,
  caminho: string,
  status: number,
  segundos: number
): void {
  const m = metricas();
  const rotulos = {
    metodo,
    rota: rotularRota(caminho),
    status: String(status),
  };
  m.duracaoRequisicao.observe(rotulos, segundos);
  m.totalRequisicoes.inc(rotulos);
}

/**
 * Mede uma operação de banco e devolve o resultado.
 *
 * Envolve a chamada em vez de instrumentar o Prisma inteiro: as consultas que
 * importam são as das telas, e nomeá-las manualmente dá um rótulo legível no
 * painel — "disponibilidade" diz mais que o texto do SQL.
 */
export async function medirConsulta<T>(
  operacao: string,
  executar: () => Promise<T>
): Promise<T> {
  const fim = metricas().duracaoConsulta.startTimer({ operacao });
  try {
    return await executar();
  } finally {
    fim();
  }
}
