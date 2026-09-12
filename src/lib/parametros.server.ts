import {
  ALVO_PADRAO,
  CRITICO_PADRAO,
  GATILHO_PADRAO,
  normalizarCoberturas,
  normalizarDias,
  type Coberturas,
  type Parametros,
} from "@/lib/parametros";
import {
  CHAVE_DIAS_ALVO,
  CHAVE_DIAS_CRITICO,
  CHAVE_DIAS_GATILHO,
  CHAVE_DIAS_PEDIDOS,
  CHAVE_DIAS_TRANSFERENCIAS,
  lerConfiguracoes,
} from "@/lib/configuracao.server";

/**
 * Prazos de projeção, os mesmos para todos.
 *
 * Junto com as faixas de cobertura, definem quantos dias uma carga atrasada
 * leva para entrar e a partir de quando uma posição é crítica — ou seja,
 * mudam os números de todas as telas. Guardados por navegador, faziam duas
 * pessoas verem contagens diferentes na mesma Disponibilidade.
 */
export async function lerParametros(): Promise<Parametros> {
  const cfg = await lerConfiguracoes();
  return {
    diasTransferencias: normalizarDias(cfg.get(CHAVE_DIAS_TRANSFERENCIAS)),
    diasPedidos: normalizarDias(cfg.get(CHAVE_DIAS_PEDIDOS)),
  };
}

/** Faixas de cobertura do sistema, caindo nos padrões quando ausentes. */
export async function lerCoberturas(): Promise<Coberturas> {
  const cfg = await lerConfiguracoes();
  return normalizarCoberturas({
    critico: normalizarDias(cfg.get(CHAVE_DIAS_CRITICO), CRITICO_PADRAO),
    gatilho: normalizarDias(cfg.get(CHAVE_DIAS_GATILHO), GATILHO_PADRAO),
    alvo: normalizarDias(cfg.get(CHAVE_DIAS_ALVO), ALVO_PADRAO),
  });
}
