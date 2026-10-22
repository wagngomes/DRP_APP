import { describe, expect, it } from "vitest";

import {
  normalizarTributacao,
  SEM_TRIBUTACAO,
} from "@/utils/tributacao";

/**
 * A normalização da tributação.
 *
 * O que os testes fixam são os dois jeitos de a mesma tributação chegar escrita
 * diferente do ERP, medidos na base: caixa ("Nacional 7%" e "nacional 7%", 243
 * itens na segunda grafia) e ordem das palavras ("7% Nacional", 3 itens).
 */
describe("normalizarTributacao", () => {
  it("junta as grafias que diferem só na caixa", () => {
    const a = normalizarTributacao("Nacional 7%");
    const b = normalizarTributacao("nacional 7%");
    const c = normalizarTributacao("  NACIONAL 7%  ");

    expect(a.chave).toBe(b.chave);
    expect(b.chave).toBe(c.chave);
  });

  it("junta '7% Nacional' com 'Nacional 7%'", () => {
    // A ordem invertida não é alcançável por lower+trim: precisa de apelido.
    expect(normalizarTributacao("7% Nacional").chave).toBe(
      normalizarTributacao("Nacional 7%").chave,
    );
  });

  /**
   * O rótulo não pode depender de qual item veio primeiro na ordenação, senão
   * a tela mostra "nacional 7%" em minúscula sem razão aparente.
   */
  it("o rótulo é a forma canônica, qualquer que seja a grafia de entrada", () => {
    for (const grafia of ["Nacional 7%", "nacional 7%", "7% Nacional", "7% NACIONAL"]) {
      expect(normalizarTributacao(grafia).rotulo).toBe("Nacional 7%");
    }
    expect(normalizarTributacao("importado").rotulo).toBe("Importado");
    expect(normalizarTributacao("IMPORTADO").rotulo).toBe("Importado");
  });

  it("tributação sem forma canônica mantém o texto original", () => {
    const t = normalizarTributacao("Isento - Convênio 162/94 - Novos - exc. GO - Nacional");
    expect(t.rotulo).toBe("Isento - Convênio 162/94 - Novos - exc. GO - Nacional");
    expect(t.chave).toBe(t.rotulo.toLowerCase());
  });

  it("vazio e nulo viram um grupo próprio, não um descarte", () => {
    // Item triangulando sem linha em fiscal é cadastro a corrigir; escondê-lo
    // faria os totais da tela não fecharem.
    for (const vazio of [null, undefined, "", "   "]) {
      expect(normalizarTributacao(vazio).rotulo).toBe(SEM_TRIBUTACAO);
    }
    expect(normalizarTributacao(null).chave).toBe(
      normalizarTributacao("").chave,
    );
  });

  it("duas tributações diferentes continuam diferentes", () => {
    expect(normalizarTributacao("Nacional 7%").chave).not.toBe(
      normalizarTributacao("Nacional 12%").chave,
    );
    expect(normalizarTributacao("Importado").chave).not.toBe(
      normalizarTributacao("Isento - Convênio 01/99").chave,
    );
  });
});
