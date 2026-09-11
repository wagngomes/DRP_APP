import { describe, expect, it } from "vitest";

import { balancear } from "./motor";

/**
 * Balanço dia a dia de uma posição item × CD.
 *
 * É o coração da simulação de cenários: parte do estoque de hoje, subtrai o
 * consumo diário e soma o que chega em cada data. A cobertura média diz "tenho
 * 16 dias"; o balanço diz "rompo em 11/09 e fico 6 dias descoberto" — e é a
 * segunda que responde à pergunta do comprador.
 */
const base = new Date(Date.UTC(2026, 8, 8)); // 08/09/2026
const dia = (n: number) => new Date(Date.UTC(2026, 8, n));
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

describe("balancear", () => {
  it("não rompe quando o estoque cobre o horizonte inteiro", () => {
    const r = balancear(1000, 1, [], base, null);
    expect(r.dataRuptura).toBeNull();
    expect(r.diasDescobertos).toBe(0);
    expect(r.faltaUnidades).toBe(0);
  });

  it("rompe no dia em que o saldo fica negativo", () => {
    // 10 unidades, consumo de 2 por dia: no 6º dia o saldo passa de 0.
    const r = balancear(10, 2, [], base, null);
    expect(iso(r.dataRuptura)).toBe("2026-09-13");
  });

  it("rompe no primeiro dia quando já está zerado", () => {
    const r = balancear(0, 5, [], base, null);
    expect(iso(r.dataRuptura)).toBe("2026-09-08");
  });

  it("uma chegada no meio do caminho adia a ruptura", () => {
    const sem = balancear(10, 2, [], base, null);
    const com = balancear(10, 2, [{ data: dia(12), quantidade: 20 }], base, null);
    expect(iso(sem.dataRuptura)).toBe("2026-09-13");
    expect(com.dataRuptura!.getTime()).toBeGreaterThan(sem.dataRuptura!.getTime());
  });

  it("chegada suficiente e a tempo evita a ruptura", () => {
    const r = balancear(10, 2, [{ data: dia(10), quantidade: 500 }], base, null);
    expect(r.dataRuptura).toBeNull();
  });

  it("conta como descoberto só o trecho até a carga chegar", () => {
    // Zerado hoje, carga em 18/09: dez dias sem estoque antes dela.
    // De 08/09 a 17/09 são dez dias no vermelho; em 18/09 a carga entra antes
    // do consumo do dia, então esse dia já não conta.
    const r = balancear(0, 10, [{ data: dia(18), quantidade: 1000 }], base, dia(18));
    expect(r.diasDescobertosAteEntrada).toBe(10);
    // O horizonte inteiro conta mais dias, mas esses são artefato de o modelo
    // só conhecer o plano do mês corrente — por isso a métrica acionável é a
    // recortada pela chegada.
    expect(r.diasDescobertos).toBeGreaterThanOrEqual(r.diasDescobertosAteEntrada);
  });

  it("o déficit é o pior momento, não a soma dos dias", () => {
    // Consumo de 10/dia por 5 dias sem estoque = falta 50 no pior ponto.
    const r = balancear(0, 10, [{ data: dia(13), quantidade: 1000 }], base, dia(13));
    expect(r.faltaUnidades).toBe(50);
  });

  it("soma duas chegadas no mesmo dia", () => {
    const uma = balancear(0, 10, [{ data: dia(9), quantidade: 50 }], base, dia(9));
    const duas = balancear(
      0,
      10,
      [
        { data: dia(9), quantidade: 25 },
        { data: dia(9), quantidade: 25 },
      ],
      base,
      dia(9)
    );
    expect(duas.faltaUnidades).toBe(uma.faltaUnidades);
  });

  it("não perde carga datada antes da data de referência", () => {
    // Bug real: a IA interpretou "colocamos ontem" como entrada em 09/09 com
    // referência em 10/09. O laço começa na base, então a chegada anterior caía
    // numa chave nunca visitada e a quantidade sumia — o cenário subestimava o
    // que estava entrando, sem nenhum sinal.
    const ontem = new Date(Date.UTC(2026, 8, 7));
    const semCarga = balancear(50, 10, [], base, null);
    const comCargaDeOntem = balancear(50, 10, [{ data: ontem, quantidade: 1000 }], base, null);
    expect(iso(semCarga.dataRuptura)).toBe("2026-09-13");
    // Com a carga tratada como disponível já no primeiro dia, não rompe.
    expect(comCargaDeOntem.dataRuptura).toBeNull();
  });

  it("aceita saída negativa, que é a origem de uma transferência", () => {
    // A ação de transferir tira do CD de origem no mesmo dia.
    // Restam 40 depois da saída; a 10 por dia isso zera no fim de 11/09 e fica
    // negativo em 12/09.
    const r = balancear(100, 10, [{ data: base, quantidade: -60 }], base, null);
    expect(iso(r.dataRuptura)).toBe("2026-09-12");
  });

  it("consome todo dia, inclusive fim de semana", () => {
    // Venda não pára no sábado — é a mesma convenção de `diasDeEstoque`.
    // 14 unidades a 1/dia, consumindo já no dia de referência: o estoque zera
    // no fim de 21/09 e fica negativo em 22/09 — catorze dias corridos, não
    // catorze dias úteis, que levariam a 26/09.
    const r = balancear(14, 1, [], base, null);
    expect(iso(r.dataRuptura)).toBe("2026-09-22");
  });
});
