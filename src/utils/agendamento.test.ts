import { describe, expect, it } from "vitest";

import { interpretarAgendamento } from "./agendamento";

describe("interpretarAgendamento", () => {
  it("lê a data marcada", () => {
    const r = interpretarAgendamento("14/09/2026");
    expect(r.data?.toISOString().slice(0, 10)).toBe("2026-09-14");
    expect(r.rotulo).toBeNull();
  });

  it("não confunde estado do pedido com agendamento", () => {
    // São os dois valores mais comuns da coluna: 3.094 e 790 linhas. Tratá-los
    // como "campo preenchido = agendado" contava 4.400 agendamentos onde há
    // uns 500 — o erro que esta função existe para impedir.
    for (const texto of [
      "Não faturado",
      "S/AGENDAMENTO",
      "S/AGENDAMENTO - S/AGENDAMENTO",
      "S/Agendamento ou Coleta",
    ]) {
      const r = interpretarAgendamento(texto);
      expect(r.data, texto).toBeNull();
      // O texto volta como rótulo: é ele que explica por que não há data.
      expect(r.rotulo, texto).toBe(texto);
    }
  });

  it("trata vazio, nulo e espaços como ausência", () => {
    for (const v of [null, undefined, "", "   "]) {
      expect(interpretarAgendamento(v)).toEqual({ data: null, rotulo: null });
    }
  });

  it("recusa data impossível em vez de deslizar para o mês seguinte", () => {
    // `Date.UTC(2026, 1, 31)` vira 3 de março sem reclamar. Devolver isso como
    // agendamento seria pior que não ter data nenhuma.
    const r = interpretarAgendamento("31/02/2026");
    expect(r.data).toBeNull();
    expect(r.rotulo).toBe("31/02/2026");
  });

  it("não aceita formato fora do dd/mm/aaaa", () => {
    for (const v of ["2026-09-14", "14/9/2026", "14-09-2026"]) {
      expect(interpretarAgendamento(v).data, v).toBeNull();
    }
  });
});
