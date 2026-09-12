"use server";

import { revalidatePath } from "next/cache";

import { exigirAdminOuErro } from "@/lib/autorizacao";
import { ehDiasValido, type Coberturas } from "@/lib/parametros";
import {
  CHAVE_DIAS_ALVO,
  CHAVE_DIAS_CRITICO,
  CHAVE_DIAS_GATILHO,
  CHAVE_DIAS_PEDIDOS,
  CHAVE_DIAS_TRANSFERENCIAS,
  gravarConfiguracoes,
} from "@/lib/configuracao.server";
import { registrar } from "@/lib/seguranca/auditoria";

/** Grava os dois prazos de projeção. */
export async function definirParametros(
  diasTransferencias: number,
  diasPedidos: number
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const autorizado = await exigirAdminOuErro();
  if (!autorizado.ok) return { ok: false, erro: autorizado.erro };

  if (!ehDiasValido(diasTransferencias) || !ehDiasValido(diasPedidos)) {
    return { ok: false, erro: "Informe números inteiros entre 0 e 365." };
  }

  await gravarConfiguracoes(
    {
      [CHAVE_DIAS_TRANSFERENCIAS]: String(diasTransferencias),
      [CHAVE_DIAS_PEDIDOS]: String(diasPedidos),
    },
    autorizado.sessao.usuario.email
  );

  registrar("parametro_alterado", {
    ator: autorizado.sessao.usuario.email,
    detalhe: `projeção: transferências ${diasTransferencias}d, pedidos ${diasPedidos}d`,
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Grava as três faixas de cobertura usadas pelos motores de risco. */
export async function definirCoberturas(
  c: Coberturas
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const autorizado = await exigirAdminOuErro();
  if (!autorizado.ok) return { ok: false, erro: autorizado.erro };

  if (!ehDiasValido(c.critico) || !ehDiasValido(c.gatilho) || !ehDiasValido(c.alvo)) {
    return { ok: false, erro: "Informe números inteiros entre 0 e 365." };
  }
  if (c.gatilho > c.alvo) {
    return { ok: false, erro: "O gatilho não pode ser maior que o alvo." };
  }

  await gravarConfiguracoes(
    {
      [CHAVE_DIAS_CRITICO]: String(c.critico),
      [CHAVE_DIAS_GATILHO]: String(c.gatilho),
      [CHAVE_DIAS_ALVO]: String(c.alvo),
    },
    autorizado.sessao.usuario.email
  );

  registrar("parametro_alterado", {
    ator: autorizado.sessao.usuario.email,
    detalhe: `cobertura: crítico ${c.critico}d, gatilho ${c.gatilho}d, alvo ${c.alvo}d`,
  });

  revalidatePath("/", "layout");
  return { ok: true };
}
