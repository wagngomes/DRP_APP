import { describe, expect, it } from "vitest";

import { avisoDominios, dominiosPermitidos, emailPermitido } from "./email-permitido";

/**
 * A trava de domínio no cadastro.
 *
 * É o que separa "qualquer pessoa da internet cria conta e lê a base inteira"
 * de "só gente da empresa entra". Vale um teste porque o erro aqui é silencioso
 * nos dois sentidos: frouxo demais abre a porta, apertado demais tranca o time
 * do lado de fora, e nenhum dos dois aparece até alguém tentar se cadastrar.
 */
describe("emailPermitido", () => {
  const permitidos = ["empresa.com.br"];

  it("aceita o domínio configurado", () => {
    expect(emailPermitido("ana@empresa.com.br", permitidos)).toBe(true);
  });

  it("aceita subdomínio", () => {
    expect(emailPermitido("ana@vendas.empresa.com.br", permitidos)).toBe(true);
  });

  it("recusa domínio de fora", () => {
    expect(emailPermitido("ana@gmail.com", permitidos)).toBe(false);
  });

  it("não se deixa enganar por domínio parecido", () => {
    // Sem o ponto na comparação, "naoempresa.com.br" passaria por terminar
    // igual — e o atacante escolhe o próprio domínio.
    expect(emailPermitido("ana@naoempresa.com.br", permitidos)).toBe(false);
    expect(emailPermitido("ana@empresa.com.br.mal.com", permitidos)).toBe(false);
  });

  it("usa o domínio final quando há mais de um @", () => {
    expect(emailPermitido("alguem@mal.com@empresa.com.br", permitidos)).toBe(true);
    expect(emailPermitido("alguem@empresa.com.br@mal.com", permitidos)).toBe(false);
  });

  it("ignora caixa e espaços", () => {
    expect(emailPermitido("  ANA@Empresa.COM.BR ", permitidos)).toBe(true);
  });

  it("libera tudo quando não há lista", () => {
    // Padrão de instalação nova: restringir sem ninguém configurar trancaria o
    // primeiro cadastro, e não haveria como entrar para corrigir.
    expect(emailPermitido("ana@gmail.com", [])).toBe(true);
  });
});

describe("dominiosPermitidos", () => {
  it("lê a lista separada por vírgula, tolerando arroba e espaço", () => {
    expect(dominiosPermitidos("@empresa.com.br, Filial.COM ")).toEqual([
      "empresa.com.br",
      "filial.com",
    ]);
  });

  it("trata ausência e vazio como sem restrição", () => {
    expect(dominiosPermitidos(undefined)).toEqual([]);
    expect(dominiosPermitidos("  ,  ")).toEqual([]);
  });
});

describe("avisoDominios", () => {
  it("não mostra aviso quando não há restrição", () => {
    expect(avisoDominios([])).toBeNull();
  });

  it("lista os domínios aceitos", () => {
    expect(avisoDominios(["empresa.com.br"])).toContain("@empresa.com.br");
  });
});
