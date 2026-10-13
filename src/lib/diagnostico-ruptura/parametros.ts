/**
 * Os parâmetros do diagnóstico, num lugar só.
 *
 * Separados dos parâmetros do sistema (`lib/parametros.ts`) de propósito: estes
 * descrevem como o **motor** mede, e mudá-los muda o diagnóstico de todos os
 * eventos já calculados. Por isso cada alteração gera uma `versao_regras` nova,
 * e os eventos antigos continuam no banco com a versão que os produziu.
 *
 * O que **não** mora aqui: Crítico, Gatilho e Alvo. Esses são do Painel, valem
 * para o sistema inteiro, e o diagnóstico tem de usar exatamente os mesmos —
 * senão a tela diz "cabia transferência" sobre uma posição que a tela de
 * sugestão nunca sugeriu.
 */

/**
 * Armazéns que contam como disponíveis para venda.
 *
 * Lista própria, e não `COLUNAS_ESTOQUE_CHAO`: aquela inclui Q40 e RC, que o
 * negócio não considera disponíveis para esta análise. Alterar a constante
 * compartilhada mudaria onze telas que hoje funcionam.
 *
 * Q40 e RC ficam de fora da disponibilidade e viram **causa**: estoque que
 * existe, está no CD, e não pode ser vendido é uma explicação de ruptura, não
 * uma ausência dela. São 11% das posições rompidas.
 */
export const COLUNAS_DISPONIVEL = [
  "est_arm_01",
  "est_arm_11",
  "est_arm_26",
  "est_arm_nac",
] as const;

/**
 * Armazéns de onde se pode **doar** numa transferência entre CDs.
 *
 * Só o 01. É mais estreito que `COLUNAS_DISPONIVEL`, e muito mais que o
 * `COLUNAS_ESTOQUE_CHAO` que a tela de sugestão usa hoje: o que está no 26, no
 * NAC, no Q40 ou no RC está no CD e não sai dele numa transferência.
 *
 * Medido nesta base, a diferença não muda a contagem — o excedente vem quase
 * todo do 01 mesmo. Vale pela correção: o dia em que um item acumular no 26, a
 * régua errada acusaria uma transferência que a operação não tinha como fazer.
 *
 * Consequência registrada: CD virtual (90xx) nunca doa, porque o estoque dele
 * vive em `est_arm_11`. É o resultado certo — aquele estoque é de outra
 * operação.
 */
export const COLUNAS_DOACAO = ["est_arm_01"] as const;

/** Armazéns que seguram estoque sem liberá-lo para venda. */
export const COLUNAS_RETIDO = ["est_arm_q40", "est_arm_rc"] as const;

/**
 * Versão do conjunto de regras.
 *
 * Sobe a cada mudança de limite, de lista de armazéns ou de regra de causa.
 * Gravada em cada evento: sem ela, não dá para saber se um diagnóstico antigo
 * discorda do novo por mudança de dado ou por mudança de régua.
 */
export const VERSAO_REGRAS = "1.0.0";

/** Limites de cada regra, todos em um lugar para a calibração ser uma edição só. */
export const LIMITES = {
  /** Venda acima do forecast proporcional em mais que isto conta como aceleração. */
  aceleracaoVenda: 0.2,
  /** Plano abaixo da necessidade em mais que isto conta como insuficiente. */
  planoInsuficiente: 0.1,
  /** Tolerância, em dias, antes de um pedido contar como tardio. */
  diasTolerenciaPedido: 2,
  /** Fração mínima dos dias da janela com snapshot para a confiança não cair. */
  coberturaMinimaJanela: 0.7,
  /** Divergência do replay contra o estoque real que dispara o aviso. */
  divergenciaReplay: 0.1,
} as const;

/**
 * Sanidade da carga de um dia.
 *
 * Existe porque o motor atribui responsabilidade, e base quebrada vira acusação
 * errada. Já aconteceu nesta base: a carga de forecast de 26/08/2026 veio com
 * 16.178 linhas de código nulo, e o motor — sem esta trava — apontaria 6.168
 * rupturas inexistentes naquele dia, todas com confiança alta.
 */
export const SANIDADE = {
  /** Acima disto de linhas sem código, a carga não é confiável. */
  maxSemCodigo: 0.05,
  /** Acima desta fração de posições rompidas no dia, é cheiro de dado ruim. */
  maxRompidasNoDia: 0.5,
} as const;
