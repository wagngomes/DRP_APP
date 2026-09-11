import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guarda contra passar função para componente cliente.
 *
 * Props atravessam a fronteira servidor→cliente serializadas, e função não
 * serializa. O TypeScript aceita — a assinatura está correta — e o erro só
 * aparece quando alguém abre a página: *"Functions cannot be passed directly to
 * Client Components"*.
 *
 * Aconteceu duas vezes neste projeto: no gráfico de quadrantes (`hrefItem`) e
 * no filtro de analista (`href`, `rotularOpcao`). Nos dois casos o build passou,
 * o typecheck passou, e a tela quebrou em uso. Este teste fecha a lacuna.
 *
 * A correção é sempre a mesma: passar dado pronto em vez de a função que o
 * produz — a URL já montada, o rótulo já escrito.
 */

const RAIZ = path.resolve(__dirname, "..");

function arquivosFonte(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) arquivosFonte(p, acc);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

/** "use client" precisa estar no topo do arquivo para valer. */
function ehComponenteCliente(conteudo: string): boolean {
  return /^\s*["']use client["']/m.test(conteudo.split("\n").slice(0, 3).join("\n"));
}

describe("fronteira servidor → cliente", () => {
  const arquivos = arquivosFonte(RAIZ);

  const nomesCliente = new Set<string>();
  for (const f of arquivos) {
    const t = fs.readFileSync(f, "utf8");
    if (!ehComponenteCliente(t)) continue;
    for (const m of t.matchAll(/export function (\w+)/g)) nomesCliente.add(m[1]);
  }

  it("encontra os componentes cliente do projeto", () => {
    // Se esta lista zerar, o teste abaixo passa sem verificar nada.
    expect(nomesCliente.size).toBeGreaterThan(5);
  });

  it("nenhum componente de servidor passa função a um componente cliente", () => {
    const problemas: string[] = [];

    for (const f of arquivos) {
      const t = fs.readFileSync(f, "utf8");
      // Um componente cliente pode receber função de outro componente cliente.
      if (ehComponenteCliente(t)) continue;

      for (const nome of nomesCliente) {
        for (const uso of t.matchAll(new RegExp(`<${nome}\\b[^>]*?>`, "gs"))) {
          for (const prop of uso[0].matchAll(/(\w+)=\{(\([^)]*\)\s*=>|function\b)/g)) {
            problemas.push(`${path.relative(RAIZ, f)}: <${nome} ${prop[1]}={função}>`);
          }
        }
      }
    }

    expect(problemas).toEqual([]);
  });
});
