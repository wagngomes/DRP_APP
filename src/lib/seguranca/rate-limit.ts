/**
 * Limitação de taxa por chave, em janela deslizante.
 *
 * Janela deslizante e não fixa: com janela fixa, cinco tentativas no fim de um
 * minuto e cinco no início do seguinte passam como dez em dois segundos. A
 * deslizante conta sempre os últimos N segundos a partir de agora, e essa
 * brecha não existe.
 *
 * O estado vive na memória do processo. Isso basta enquanto houver uma
 * instância — com mais de uma, cada uma teria seu próprio contador e o teto
 * real seria multiplicado pelo número de instâncias. A interface `Armazem`
 * existe para trocar por Redis nesse dia sem tocar em quem chama.
 */

export type Regra = {
  /** Quantas requisições cabem na janela. */
  max: number;
  /** Tamanho da janela em segundos. */
  janelaSegundos: number;
};

export type Veredito = {
  permitido: boolean;
  /** Quantas ainda cabem na janela. */
  restantes: number;
  /** Segundos até a requisição mais antiga sair da janela. */
  esperarSegundos: number;
};

interface Armazem {
  /** Marcas de tempo das requisições dentro da janela, em ordem. */
  ler(chave: string): number[] | undefined;
  gravar(chave: string, marcas: number[]): void;
  apagar(chave: string): void;
}

/**
 * Guardado no `globalThis` pelo mesmo motivo do cliente Prisma e do registro de
 * métricas: em desenvolvimento o Next recarrega os módulos, e um mapa novo a
 * cada recarga zeraria os contadores — o limitador nunca chegaria ao teto.
 */
type Global = typeof globalThis & { __rateLimit?: Map<string, number[]> };

function mapa(): Map<string, number[]> {
  const g = globalThis as Global;
  g.__rateLimit ??= new Map();
  return g.__rateLimit;
}

const memoria: Armazem = {
  ler: (chave) => mapa().get(chave),
  gravar: (chave, marcas) => void mapa().set(chave, marcas),
  apagar: (chave) => void mapa().delete(chave),
};

/**
 * Limpeza preguiçosa: a cada N verificações, varre e remove chaves vencidas.
 *
 * Sem isso o mapa cresceria para sempre — cada IP que aparece uma vez ficaria
 * na memória até o processo reiniciar, que é um vazamento lento e silencioso.
 * Preguiçosa e não por timer para não segurar o processo vivo nem gastar CPU
 * quando ninguém está usando.
 */
const INTERVALO_LIMPEZA = 500;
let verificacoes = 0;

function limparVencidas(agora: number, janelaMaxMs: number): void {
  for (const [chave, marcas] of mapa()) {
    if (marcas.length === 0 || agora - marcas[marcas.length - 1] > janelaMaxMs) {
      mapa().delete(chave);
    }
  }
}

/**
 * Verifica e **registra** a tentativa quando ela é permitida.
 *
 * Registra na entrada, não na saída: uma importação de 500 mil linhas leva
 * dezenas de segundos, e contar só ao terminar deixaria várias cargas
 * simultâneas passarem juntas pelo teto enquanto nenhuma tivesse concluído.
 */
export function verificar(chave: string, regra: Regra, armazem: Armazem = memoria): Veredito {
  const agora = Date.now();
  const janelaMs = regra.janelaSegundos * 1000;

  if (++verificacoes % INTERVALO_LIMPEZA === 0) {
    limparVencidas(agora, janelaMs);
  }

  const anteriores = armazem.ler(chave) ?? [];
  const dentroDaJanela = anteriores.filter((t) => agora - t < janelaMs);

  if (dentroDaJanela.length >= regra.max) {
    const maisAntiga = dentroDaJanela[0];
    return {
      permitido: false,
      restantes: 0,
      esperarSegundos: Math.max(1, Math.ceil((maisAntiga + janelaMs - agora) / 1000)),
    };
  }

  dentroDaJanela.push(agora);
  armazem.gravar(chave, dentroDaJanela);

  return {
    permitido: true,
    restantes: regra.max - dentroDaJanela.length,
    esperarSegundos: 0,
  };
}

/**
 * Verifica várias regras sobre a mesma chave e devolve a mais restritiva.
 *
 * É o que permite empilhar camadas — 5 por minuto contra a rajada, 20 por hora
 * contra a moagem lenta, 50 por dia contra a insistência. Um teto sozinho
 * sempre deixa passar um dos três padrões.
 */
export function verificarCamadas(
  chave: string,
  regras: Regra[],
  armazem: Armazem = memoria
): Veredito {
  let pior: Veredito = { permitido: true, restantes: Number.MAX_SAFE_INTEGER, esperarSegundos: 0 };

  for (const regra of regras) {
    const r = verificar(`${chave}|${regra.janelaSegundos}`, regra, armazem);
    if (!r.permitido) return r;
    if (r.restantes < pior.restantes) pior = r;
  }

  return pior;
}

/** Zera as camadas de uma chave. Usado quando o login dá certo. */
export function zerar(chave: string, regras: Regra[], armazem: Armazem = memoria): void {
  for (const regra of regras) armazem.apagar(`${chave}|${regra.janelaSegundos}`);
}

/**
 * Controle de concorrência: quantas operações da mesma chave rodam ao mesmo
 * tempo.
 *
 * Separado do teto por tempo porque protege de outra coisa. Na importação o que
 * derruba o processo é carga **simultânea** — cada arquivo grande é carregado
 * inteiro na memória, e este sistema já caiu por falta de heap. Trinta por hora
 * não impede três de meio milhão de linhas ao mesmo tempo; "uma por vez"
 * impede.
 */
type GlobalConc = typeof globalThis & { __emCurso?: Map<string, number> };

function emCurso(): Map<string, number> {
  const g = globalThis as GlobalConc;
  g.__emCurso ??= new Map();
  return g.__emCurso;
}

export function tentarEntrar(chave: string, maximo: number): boolean {
  const atual = emCurso().get(chave) ?? 0;
  if (atual >= maximo) return false;
  emCurso().set(chave, atual + 1);
  return true;
}

export function sair(chave: string): void {
  const atual = emCurso().get(chave) ?? 0;
  if (atual <= 1) emCurso().delete(chave);
  else emCurso().set(chave, atual - 1);
}

/**
 * Identifica a origem da requisição.
 *
 * Atrás de proxy reverso ou gateway, o IP do socket é o do próprio proxy — o
 * do cliente vem no cabeçalho. Confiar no cabeçalho só faz sentido quando há um
 * proxy confiável na frente: exposto direto, qualquer um forja `x-forwarded-for`
 * e escapa do limite trocando o valor a cada requisição.
 */
export function origemDaRequisicao(cabecalhos: Headers): string {
  const encaminhado = cabecalhos.get("x-forwarded-for");
  if (encaminhado) return encaminhado.split(",")[0]!.trim();
  return cabecalhos.get("x-real-ip") ?? "desconhecido";
}
