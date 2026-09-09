/**
 * Fronteira com o provedor de IA.
 *
 * **Este é o único arquivo do projeto que importa o SDK.** Trocar de modelo ou de
 * provedor mexe aqui e em mais nada: quem chama recebe texto, não sabe de onde
 * veio. Os motores de risco não importam nada daqui — funcionam com a IA
 * desligada, que é o estado normal quando falta a chave.
 */
import Anthropic from "@anthropic-ai/sdk";

export const MODELO = "claude-sonnet-5";
/**
 * Teto da resposta.
 *
 * Generoso de propósito. O tamanho da análise varia bastante entre rodadas
 * (medimos 10.091 e 14.791 tokens para o mesmo tipo de recorte), e estourar o
 * teto devolve JSON cortado — que não valida e joga fora dois minutos de
 * processamento e o custo da chamada. Só se paga pelo que é gerado, então folga
 * aqui não custa nada; falta de folga custa a análise inteira.
 */
const MAX_TOKENS_RESPOSTA = 32000;

/** Cliente preguiçoso: sem chave configurada, nem tenta construir. */
let cliente: Anthropic | null = null;

export function temChaveConfigurada(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

function obterCliente(): Anthropic {
  if (!cliente) {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada");
    cliente = new Anthropic({ apiKey });
  }
  return cliente;
}

export type RespostaIa =
  | {
      ok: true;
      texto: string;
      tokensEntrada: number;
      tokensSaida: number;
      /** "max_tokens" indica resposta cortada — o JSON chega incompleto. */
      motivoParada: string | null;
    }
  | { ok: false; erro: string };

/** Uma chamada, sem estado. */
export async function gerarTexto(system: string, prompt: string): Promise<RespostaIa> {
  if (!temChaveConfigurada()) {
    return { ok: false, erro: "ANTHROPIC_API_KEY não configurada" };
  }

  try {
    // Streaming e não `create`: com teto alto de saída o SDK recusa a chamada
    // não-streamada, por estimar que pode passar de 10 minutos. `finalMessage()`
    // devolve a mensagem montada, então o resto do código não muda.
    const resposta = await obterCliente()
      .messages.stream({
        model: MODELO,
        max_tokens: MAX_TOKENS_RESPOSTA,
        system,
        messages: [{ role: "user", content: prompt }],
      })
      .finalMessage();

    return {
      ok: true,
      texto: resposta.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join(""),
      tokensEntrada: resposta.usage.input_tokens,
      tokensSaida: resposta.usage.output_tokens,
      motivoParada: resposta.stop_reason,
    };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Extrai o objeto JSON de uma resposta em texto.
 *
 * O modelo não aceita prefill do assistente, então não dá para forçar a resposta
 * a começar em "{". Em vez de exigir JSON puro e quebrar quando vier um "Aqui
 * está:" na frente, recorta do primeiro "{" ao último "}".
 */
/**
 * Extrai o objeto JSON de uma resposta em texto.
 *
 * Tenta em camadas, da mais simples para a mais tolerante. Cada camada só
 * recupera casos que a anterior perdeu — nenhuma altera o que já funcionava:
 *
 *   1. O trecho entre a primeira `{` e a última `}`.
 *   2. O primeiro bloco de chaves balanceado, ignorando chaves dentro de
 *      strings. Recupera a resposta que vem com texto depois do JSON, quando
 *      esse texto contém `}` e desloca o fim.
 *   3. O mesmo bloco sem vírgulas sobrando antes de `}` ou `]`, que é o erro de
 *      sintaxe mais comum quando o modelo escreve JSON à mão.
 *
 * A cerca de código (```json) sai antes de tudo: ela não atrapalha a camada 1,
 * mas atrapalha a contagem de chaves da camada 2.
 */
export function extrairJson(texto: string): unknown | null {
  const limpo = texto.replace(/```(?:json)?/gi, "");

  const inicio = limpo.indexOf("{");
  if (inicio === -1) return null;

  const fim = limpo.lastIndexOf("}");
  if (fim > inicio) {
    try {
      return JSON.parse(limpo.slice(inicio, fim + 1));
    } catch {
      // Segue para as camadas seguintes.
    }
  }

  const bloco = blocoBalanceado(limpo, inicio);
  if (!bloco) return null;

  try {
    return JSON.parse(bloco);
  } catch {
    try {
      return JSON.parse(bloco.replace(/,(\s*[}\]])/g, "$1"));
    } catch {
      return null;
    }
  }
}

/** Primeiro `{...}` com chaves balanceadas, desprezando as que estão em strings. */
function blocoBalanceado(texto: string, inicio: number): string | null {
  let profundidade = 0;
  let emString = false;
  let escapado = false;

  for (let i = inicio; i < texto.length; i += 1) {
    const c = texto[i];

    if (emString) {
      if (escapado) escapado = false;
      else if (c === "\\") escapado = true;
      else if (c === '"') emString = false;
      continue;
    }

    if (c === '"') emString = true;
    else if (c === "{") profundidade += 1;
    else if (c === "}") {
      profundidade -= 1;
      if (profundidade === 0) return texto.slice(inicio, i + 1);
    }
  }

  return null;
}
