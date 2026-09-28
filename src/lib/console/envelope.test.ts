import { describe, expect, it } from "vitest";

import { envelopar } from "./envelope";

describe("envelopar", () => {
  it("envolve um SELECT com teto de linhas", () => {
    const r = envelopar("SELECT * FROM produtos", 1000);
    expect(r.envelopado).toBe(true);
    // Uma linha a mais que o teto: é como se sabe que havia mais sem contar.
    expect(r.sql).toBe(
      "SELECT * FROM (SELECT * FROM produtos) AS _console LIMIT 1001",
    );
  });

  it("envolve CTE e TABLE", () => {
    expect(
      envelopar("WITH x AS (SELECT 1) SELECT * FROM x", 10).envelopado,
    ).toBe(true);
    expect(envelopar("TABLE produtos", 10).envelopado).toBe(true);
  });

  it("enxerga a palavra-chave atrás de comentário", () => {
    // Sem isto, um SELECT precedido de comentário cairia no caminho sem teto —
    // que é seguro, mas traz a tabela inteira para a memória.
    expect(envelopar("-- conferindo\nSELECT 1", 10).envelopado).toBe(true);
    expect(envelopar("/* nota */ SELECT 1", 10).envelopado).toBe(true);
  });

  it("remove o ponto e vírgula final, que quebraria a subconsulta", () => {
    expect(envelopar("SELECT 1;", 5).sql).toBe(
      "SELECT * FROM (SELECT 1) AS _console LIMIT 6",
    );
    expect(envelopar("SELECT 1;  \n ", 5).sql).toBe(
      "SELECT * FROM (SELECT 1) AS _console LIMIT 6",
    );
  });

  it("deixa passar cru o que não vira subconsulta", () => {
    // EXPLAIN e SHOW são inválidos dentro de FROM; envolvê-los daria erro de
    // sintaxe numa consulta que deveria funcionar.
    for (const sql of [
      "EXPLAIN SELECT 1",
      "SHOW work_mem",
      "ANALYZE produtos",
    ]) {
      expect(envelopar(sql, 10), sql).toEqual({ sql, envelopado: false });
    }
  });

  it("não tenta julgar escrita", () => {
    // O envelope é otimização de memória, não barreira de segurança: a escrita
    // é recusada pela transação somente-leitura, no motor. Aqui um DELETE só
    // não é envelopado, e falha adiante — o que se testa é que ele não é
    // silenciosamente transformado em outra coisa.
    expect(envelopar("DELETE FROM produtos", 10)).toEqual({
      sql: "DELETE FROM produtos",
      envelopado: false,
    });
  });
});
