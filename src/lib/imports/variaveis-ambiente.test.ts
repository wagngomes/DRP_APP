import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Toda variável que o código lê precisa estar declarada no compose.
 *
 * Este teste existe por causa de uma falha real: `EMAIL_DOMINIOS_PERMITIDOS`
 * controla quem pode criar conta, o código a lia, o `.env` da produção podia
 * tê-la — e ela nunca chegava ao contêiner, porque o compose só repassa o que
 * está escrito nele. A lista chegava vazia, e lista vazia libera qualquer
 * domínio. O cadastro ficou aberto desde a primeira subida.
 *
 * Nenhuma revisão de código pegaria isso: o código estava certo, o arquivo
 * estava certo, faltava a ponte entre os dois. Só um teste que olha os dois
 * lados ao mesmo tempo percebe.
 */

/** Definidas pela plataforma, nunca pelo compose. */
const DA_PLATAFORMA = new Set(["NODE_ENV", "NEXT_RUNTIME"]);

function arquivosDeCodigo(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "generated" || nome === "node_modules") continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivosDeCodigo(caminho, achados);
    else if (/\.tsx?$/.test(nome) && !nome.endsWith(".test.ts"))
      achados.push(caminho);
  }
  return achados;
}

function lidasPeloCodigo(): Set<string> {
  const encontradas = new Set<string>();
  for (const arquivo of arquivosDeCodigo("src")) {
    const texto = readFileSync(arquivo, "utf8");
    for (const m of texto.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
      if (!DA_PLATAFORMA.has(m[1]) && !m[1].startsWith("npm_package")) {
        encontradas.add(m[1]);
      }
    }
  }
  return encontradas;
}

function declaradasNoCompose(): Set<string> {
  const texto = readFileSync("docker-compose.yml", "utf8");
  // Só o serviço `app`: é ele que roda o código de `src`.
  const inicio = texto.indexOf("\n  app:");
  const fim = texto.indexOf("\n  backup:", inicio);
  const bloco = texto.slice(inicio, fim === -1 ? undefined : fim);
  return new Set(
    [...bloco.matchAll(/^ {6}([A-Z][A-Z0-9_]*):/gm)].map((m) => m[1]),
  );
}

describe("variáveis de ambiente", () => {
  it("tudo que o código lê chega ao contêiner", () => {
    const lidas = lidasPeloCodigo();
    const declaradas = declaradasNoCompose();
    const faltando = [...lidas].filter((v) => !declaradas.has(v)).sort();

    expect(
      faltando,
      `Estas variáveis são lidas em src/ mas não estão declaradas no serviço ` +
        `"app" do docker-compose.yml, então nunca chegam ao contêiner — o valor ` +
        `no .env é ignorado em silêncio:\n  ${faltando.join("\n  ")}`,
    ).toEqual([]);
  });

  it("as que controlam acesso estão entre elas", () => {
    // Guarda explícita das duas que já falharam, para uma remoção futura não
    // passar como "nenhuma variável nova".
    const declaradas = declaradasNoCompose();
    expect(declaradas.has("EMAIL_DOMINIOS_PERMITIDOS")).toBe(true);
    expect(declaradas.has("EXIGIR_EMAIL_VERIFICADO")).toBe(true);
  });
});
