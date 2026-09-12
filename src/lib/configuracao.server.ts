/**
 * Parâmetros que valem para todo mundo.
 *
 * Data de referência, prazos de projeção e faixas de cobertura nasceram em
 * cookie. Parecia suficiente enquanto o sistema tinha um usuário; com equipe,
 * não é. Cookie é por navegador: cada pessoa olhava um dia diferente sem saber,
 * e duas abrindo a mesma tela viam contagens diferentes, sem nada na interface
 * explicando por quê. Uma análise compartilhada precisa de uma régua só.
 *
 * Agora moram no banco, o administrador ajusta e todos veem o mesmo.
 */
import { cache } from "react";

import { prisma } from "@/lib/prisma";

export const CHAVE_DATA_REFERENCIA = "data_referencia";
export const CHAVE_DIAS_TRANSFERENCIAS = "dias_transferencias";
export const CHAVE_DIAS_PEDIDOS = "dias_pedidos";
export const CHAVE_DIAS_CRITICO = "dias_critico";
export const CHAVE_DIAS_GATILHO = "dias_gatilho";
export const CHAVE_DIAS_ALVO = "dias_alvo";

/**
 * Lê todas as configurações de uma vez, uma vez por renderização.
 *
 * `cache` do React dedupe a chamada dentro do mesmo render: a data de
 * referência é lida por quase toda página e por vários componentes dentro
 * dela, e sem isso cada leitura viraria uma ida ao banco.
 *
 * Uma consulta só, e não uma por chave, pelo mesmo motivo — a tabela tem meia
 * dúzia de linhas, e trazer todas custa o mesmo que trazer uma.
 *
 * Falha de leitura não derruba a tela: devolve vazio e quem chama cai no
 * padrão. Uma tela que abre com o parâmetro padrão é recuperável; uma tela que
 * não abre, não.
 */
export const lerConfiguracoes = cache(async (): Promise<Map<string, string>> => {
  try {
    const linhas = await prisma.configuracaoSistema.findMany({
      select: { chave: true, valor: true },
    });
    return new Map(linhas.map((l) => [l.chave, l.valor]));
  } catch (erro) {
    console.warn("[configuracao] leitura falhou, usando padrões:", erro);
    return new Map();
  }
});

/** Grava uma configuração, registrando quem mudou. */
export async function gravarConfiguracao(
  chave: string,
  valor: string,
  por: string
): Promise<void> {
  await prisma.configuracaoSistema.upsert({
    where: { chave },
    create: { chave, valor, atualizado_por: por },
    update: { valor, atualizado_por: por },
  });
}

/** Grava várias de uma vez, na mesma transação. */
export async function gravarConfiguracoes(
  valores: Record<string, string>,
  por: string
): Promise<void> {
  await prisma.$transaction(
    Object.entries(valores).map(([chave, valor]) =>
      prisma.configuracaoSistema.upsert({
        where: { chave },
        create: { chave, valor, atualizado_por: por },
        update: { valor, atualizado_por: por },
      })
    )
  );
}
