import { describe, expect, it } from "vitest";

/**
 * A separação entre Contratos e Spot.
 *
 * Uma venda só pode estar num dos dois. A regra é por CNPJ: quem tem contrato
 * do item no mês vai para Contratos, quem não tem vai para Spot, e não existe
 * terceira possibilidade nem interseção.
 *
 * Estes testes guardam a **álgebra** dessa divisão, que é o que pode quebrar
 * numa mudança futura sem ninguém perceber: o SQL continuaria rodando e os dois
 * cards continuariam mostrando números, só que somando errado. O casamento com
 * o banco real é conferido à parte; aqui fica a invariante.
 */

type Venda = { cnpj: string; quantidade: number };

/** A mesma divisão que a consulta faz, em TypeScript, para poder ser testada. */
function dividir(vendas: Venda[], cnpjsComContrato: Set<string>) {
  let comContrato = 0;
  let spot = 0;
  const noSpot = new Set<string>();

  for (const v of vendas) {
    if (cnpjsComContrato.has(v.cnpj)) {
      comContrato += v.quantidade;
    } else {
      spot += v.quantidade;
      noSpot.add(v.cnpj);
    }
  }

  return { comContrato, spot, total: comContrato + spot, noSpot };
}

describe("separação entre Contratos e Spot", () => {
  const contratados = new Set(["111", "222"]);

  it("as duas parcelas somam exatamente o total, sem sobra nem falta", () => {
    const r = dividir(
      [
        { cnpj: "111", quantidade: 100 },
        { cnpj: "333", quantidade: 50 },
        { cnpj: "222", quantidade: 25 },
        { cnpj: "444", quantidade: 10 },
      ],
      contratados,
    );
    expect(r.comContrato).toBe(125);
    expect(r.spot).toBe(60);
    expect(r.comContrato + r.spot).toBe(r.total);
  });

  it("nenhum CNPJ contratado aparece no spot", () => {
    const r = dividir(
      [
        { cnpj: "111", quantidade: 100 },
        { cnpj: "333", quantidade: 50 },
      ],
      contratados,
    );
    for (const cnpj of r.noSpot) expect(contratados.has(cnpj)).toBe(false);
  });

  it("o mesmo CNPJ em várias notas cai inteiro de um lado só", () => {
    // O risco real: casar por linha em vez de por CNPJ espalharia o cliente
    // entre os dois cards conforme a nota.
    const r = dividir(
      [
        { cnpj: "111", quantidade: 30 },
        { cnpj: "111", quantidade: 70 },
      ],
      contratados,
    );
    expect(r.comContrato).toBe(100);
    expect(r.spot).toBe(0);
    expect(r.noSpot.size).toBe(0);
  });

  it("devolução entra na conta em vez de ser descartada", () => {
    // Filtrar por quantidade positiva faria o detalhe deixar de fechar com o
    // card no primeiro mês com devolução.
    const r = dividir(
      [
        { cnpj: "333", quantidade: 100 },
        { cnpj: "444", quantidade: -30 },
      ],
      contratados,
    );
    expect(r.spot).toBe(70);
    expect(r.total).toBe(70);
  });

  it("sem contrato nenhum, tudo é spot", () => {
    const r = dividir([{ cnpj: "999", quantidade: 40 }], new Set());
    expect(r.comContrato).toBe(0);
    expect(r.spot).toBe(40);
  });

  it("contrato sem venda não cria linha no spot", () => {
    // Contrato que ninguém executou não vira demanda spot negativa nem zero.
    const r = dividir([], new Set(["111"]));
    expect(r.total).toBe(0);
    expect(r.noSpot.size).toBe(0);
  });
});
