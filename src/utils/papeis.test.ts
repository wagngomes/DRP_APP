import { describe, expect, it } from "vitest";

import { lerPapel } from "@/utils/papeis";

/**
 * A leitura do papel.
 *
 * Parece trivial demais para merecer teste, e é exatamente por isso que merece:
 * é uma função de uma linha da qual depende todo o controle de acesso, e um erro
 * aqui não quebra nada visivelmente — só abre portas. A direção da falha é o que
 * está sendo fixado: na dúvida, menos privilégio.
 */
describe("lerPapel", () => {
  it("reconhece administrador", () => {
    expect(lerPapel("admin")).toBe("admin");
  });

  it("trata ausência de papel como consulta", () => {
    // Conta criada antes da coluna existir, ou campo que não veio na sessão.
    expect(lerPapel(undefined)).toBe("user");
    expect(lerPapel(null)).toBe("user");
    expect(lerPapel("")).toBe("user");
  });

  it("não aceita variações de escrita como administrador", () => {
    // Se alguém gravar "Admin" na mão no banco, a conta NÃO vira administrador.
    // É deliberado: a única grafia válida é a que o sistema escreve.
    expect(lerPapel("Admin")).toBe("user");
    expect(lerPapel("ADMIN")).toBe("user");
    expect(lerPapel(" admin")).toBe("user");
  });

  it("degrada para consulta diante de lixo", () => {
    expect(lerPapel(1)).toBe("user");
    expect(lerPapel(true)).toBe("user");
    expect(lerPapel({ role: "admin" })).toBe("user");
    expect(lerPapel(["admin"])).toBe("user");
    expect(lerPapel("superadmin")).toBe("user");
  });
});
