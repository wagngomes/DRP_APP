import { describe, expect, it } from "vitest";

import { resolverDataCarga } from "./data-carga";
import type { ImportModelConfig } from "./config";

const cumulativo = {
  key: "pedidos_de_compra",
  label: "Pedidos",
  delegate: "pedidosDeCompra",
  cumulative: true,
  snapshotField: "data_snapshot",
  columns: [],
} as unknown as ImportModelConfig;

const cadastro = {
  key: "produtos",
  label: "Produtos",
  delegate: "produtos",
  columns: [],
} as unknown as ImportModelConfig;

const HOJE = "2026-09-24";

describe("resolverDataCarga", () => {
  it("sem data pedida, usa hoje e não marca como retroativa", () => {
    const r = resolverDataCarga(cumulativo, undefined, HOJE);
    expect(r).toEqual({ ok: true, data: new Date("2026-09-24T00:00:00.000Z"), retroativa: false });
  });

  it("aceita uma data passada e marca como retroativa", () => {
    const r = resolverDataCarga(cumulativo, "2026-08-12", HOJE);
    expect(r).toEqual({ ok: true, data: new Date("2026-08-12T00:00:00.000Z"), retroativa: true });
  });

  it("hoje explícito não conta como retroativa", () => {
    // Quem digita a data de hoje está fazendo a carga normal, e o aviso de
    // carga retroativa na tela ficaria mentindo.
    const r = resolverDataCarga(cumulativo, HOJE, HOJE);
    expect(r).toMatchObject({ ok: true, retroativa: false });
  });

  it("recusa data futura", () => {
    // Um snapshot à frente de todas as cargas reais seria escolhido como "o
    // relatório mais recente" por toda consulta que pega o MAX.
    expect(resolverDataCarga(cumulativo, "2026-09-25", HOJE)).toMatchObject({ ok: false });
  });

  it("recusa dia que não existe no mês", () => {
    // `new Date("2026-02-31")` não falha: rola para março. Sem a conferência de
    // volta, o arquivo entraria carimbado com um dia que o usuário não pediu.
    expect(resolverDataCarga(cumulativo, "2026-02-31", HOJE)).toMatchObject({ ok: false });
  });

  it("recusa formato fora do ISO", () => {
    for (const v of ["12/08/2026", "2026-8-1", "ontem", "20260812"]) {
      expect(resolverDataCarga(cumulativo, v, HOJE), v).toMatchObject({ ok: false });
    }
  });

  it("recusa ano absurdo, que é erro de digitação", () => {
    expect(resolverDataCarga(cumulativo, "0226-08-12", HOJE)).toMatchObject({ ok: false });
  });

  it("recusa data em tabela que não guarda histórico", () => {
    // Produtos é substituição total: carimbar uma data não teria onde ser
    // gravada, e aceitar em silêncio faria o usuário achar que funcionou.
    expect(resolverDataCarga(cadastro, "2026-08-12", HOJE)).toMatchObject({ ok: false });
  });

  it("tabela sem histórico segue funcionando quando nenhuma data é pedida", () => {
    expect(resolverDataCarga(cadastro, "", HOJE)).toMatchObject({ ok: true, retroativa: false });
  });
});
