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
 *
 * O segundo teste cobre a outra metade da mesma fronteira: componente cliente
 * que importa módulo de servidor. Aconteceu com `seletor-papel.tsx` importando
 * `lib/autorizacao`, que puxa `next/headers` — e o erro só apareceu ao abrir a
 * tela, com uma mensagem sobre Pages Router que não tem relação com a causa.
 * A correção também é sempre a mesma: extrair a parte pura para `utils/` e
 * importar de lá.
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

/**
 * Módulos que só existem no servidor, e o que os denuncia.
 *
 * Um componente cliente que importe qualquer coisa que chegue até aqui arrasta
 * o servidor inteiro para o pacote do navegador — quando o build não falha, o
 * que vaza é código que nunca deveria sair da máquina.
 */
const SO_SERVIDOR = [
  "next/headers",
  "server-only",
  "@/lib/prisma",
  "@/lib/auth",
  "@/lib/autorizacao",
  "node:fs",
  "node:crypto",
];

/** Resolve "@/x" para o caminho do arquivo, testando as extensões usadas. */
function resolverImport(especificador: string): string | null {
  if (!especificador.startsWith("@/")) return null;
  const base = path.join(RAIZ, especificador.slice(2));
  for (const sufixo of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    if (fs.existsSync(base + sufixo)) return base + sufixo;
  }
  return null;
}

/**
 * Imports que realmente chegam ao pacote do navegador.
 *
 * `import type` é apagado na compilação e nunca vira dependência de execução —
 * incluí-lo aqui produziria acusação falsa em todo componente que só importa a
 * forma dos dados que recebe.
 */
function importsDe(conteudo: string): string[] {
  const semTipos = conteudo.replace(/import\s+type\s[^;]+;/g, "");
  return [...semTipos.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

/**
 * `"use server"` é fronteira, não vazamento.
 *
 * Componente cliente importando Server Action é o padrão correto: o código fica
 * no servidor e só a referência atravessa. Seguir para dentro desses arquivos
 * acusaria como problema exatamente o mecanismo que existe para resolvê-lo.
 */
function ehServerAction(conteudo: string): boolean {
  return /^\s*["']use server["']/m.test(conteudo.split("\n").slice(0, 3).join("\n"));
}

describe("componentes cliente não importam servidor", () => {
  it("nenhum caminho de import leva a módulo só de servidor", () => {
    const problemas: string[] = [];

    for (const arquivo of arquivosFonte(RAIZ)) {
      const texto = fs.readFileSync(arquivo, "utf8");
      if (!ehComponenteCliente(texto)) continue;

      // Busca em largura: o vazamento costuma estar a dois ou três saltos, não
      // no import que está à vista.
      const vistos = new Set<string>();
      const fila: { arquivo: string; caminho: string[] }[] = [
        { arquivo, caminho: [path.relative(RAIZ, arquivo)] },
      ];

      while (fila.length > 0) {
        const atual = fila.shift()!;
        if (vistos.has(atual.arquivo)) continue;
        vistos.add(atual.arquivo);

        const textoAtual = fs.readFileSync(atual.arquivo, "utf8");
        if (atual.arquivo !== arquivo && ehServerAction(textoAtual)) continue;

        for (const esp of importsDe(textoAtual)) {
          if (SO_SERVIDOR.includes(esp)) {
            problemas.push([...atual.caminho, esp].join(" → "));
            continue;
          }
          const destino = resolverImport(esp);
          // Um arquivo "use client" importado por outro continua no cliente,
          // então a busca segue por ele igual.
          if (destino) {
            fila.push({
              arquivo: destino,
              caminho: [...atual.caminho, path.relative(RAIZ, destino)],
            });
          }
        }
      }
    }

    expect([...new Set(problemas)]).toEqual([]);
  });
});
