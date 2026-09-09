/**
 * CDs virtuais: o armazém 11 é um CD separado.
 *
 * Regra do negócio (task20): todo CD cujo código começa em "90" é o mesmo local
 * físico do CD "10" correspondente (9002 ↔ 1002), mas com estoque e venda
 * próprios — e essas quantidades chegam na base do simulador dentro das colunas
 * do armazém 11 da linha do CD "10".
 *
 * Ou seja: a base nunca traz uma linha com filial "9002". Ela traz filial
 * "1002" com valor em `est_arm_11`, e é esse valor que pertence ao 9002. Este
 * módulo é o único lugar onde essa separação existe — `simuladorPorCd()` gera
 * a origem que todas as consultas usam no lugar da tabela crua.
 *
 * Para mudar a regra (outro prefixo, outro armazém, mais colunas), mexa apenas
 * aqui: as consultas não sabem que a divisão existe.
 */

/** Prefixo do CD como vem na base. */
export const PREFIXO_FISICO = "10";
/** Prefixo do CD virtual correspondente. */
export const PREFIXO_VIRTUAL = "90";
/** Armazém cujas quantidades pertencem ao CD virtual. */
export const ARMAZEM_VIRTUAL = "11";

/**
 * Colunas que pertencem ao CD virtual. Na linha do CD físico elas são zeradas;
 * na do virtual, são as únicas preenchidas.
 */
export const COLUNAS_VIRTUAIS = ["est_arm_11", "vendido_m0_arm_11"] as const;

/**
 * Colunas de quantidade que ficam no CD físico e precisam ser zeradas na linha
 * virtual, para o mesmo valor não ser contado duas vezes.
 *
 * Não inclui `cmv_unitario`/`cmv_unitario_1`: são custo unitário do item, não
 * quantidade do CD — a linha virtual precisa deles para valorizar o estoque do
 * armazém 11. `em_transf_arm_11` fica no físico porque a task separa apenas
 * estoque e venda; o total de trânsito continua sendo lido de `total_trans`.
 */
export const COLUNAS_SO_DO_FISICO = [
  "est_arm_01",
  "est_arm_26",
  "est_arm_nac",
  "est_arm_q40",
  "est_arm_rc",
  "estoque_cmv",
  "compras_arm_01",
  "compras_arm_26",
  "compras_arm_nac",
  "valor_pedido_aberto_bruto",
  "valor_pedido_aberto_cmv",
  "em_transf_arm_01",
  "em_transf_arm_11",
  "em_transf_arm_26",
  "total_trans",
  "reserva",
  "qtd_pendente",
  "vendido_m0_arm_01",
  "vendido_m0_arm_26",
  "vendido_m0_arm_tr",
] as const;

/** True quando o código é de um CD virtual. */
export function ehCdVirtual(codigo: string | null | undefined): boolean {
  return Boolean(codigo?.startsWith(PREFIXO_VIRTUAL));
}

/** CD físico correspondente a um virtual ("9002" -> "1002"). */
export function cdFisicoDe(virtual: string): string {
  return PREFIXO_FISICO + virtual.slice(PREFIXO_VIRTUAL.length);
}

/** CD virtual correspondente a um físico ("1002" -> "9002"). */
export function cdVirtualDe(fisico: string): string {
  return PREFIXO_VIRTUAL + fisico.slice(PREFIXO_FISICO.length);
}

/**
 * Rótulo de um CD virtual derivado do físico: "CAJ" vira "CAJ·11".
 *
 * Derivado em vez de cadastrado para que um código "90" novo apareça legível
 * sem ninguém precisar mexer na tabela de filiais.
 */
export function rotuloCdVirtual(rotuloDoFisico: string): string {
  return `${rotuloDoFisico}·${ARMAZEM_VIRTUAL}`;
}

/**
 * Origem das consultas no lugar da tabela `simulador`.
 *
 * Cada linha da base vira duas: a do CD físico, sem as quantidades do armazém
 * 11, e a do CD virtual, só com elas. Como a divisão é feita zerando colunas —
 * e não somando de outro jeito —, todas as fórmulas existentes (estoque chão,
 * vendido, estoque total) continuam valendo sem alteração nenhuma.
 *
 * A linha virtual só é gerada quando há quantidade no armazém 11, para não
 * inventar CD onde ele não opera.
 */
export function simuladorPorCd(filtroSnapshot?: string): string {
  const virtuais: readonly string[] = COLUNAS_VIRTUAIS;
  const soDoFisico: readonly string[] = COLUNAS_SO_DO_FISICO;

  // Identificadores sempre entre aspas: `createdAt` é camelCase no schema, e o
  // Postgres rebaixaria o nome para minúsculo sem elas.
  const id = (c: string) => `"${c}"`;

  // As duas metades do UNION precisam das mesmas colunas na mesma ordem, então
  // ambas são montadas percorrendo a lista completa do schema.
  const linhaFisica = COLUNAS_SIMULADOR.map((c) =>
    virtuais.includes(c) ? `0::numeric AS ${id(c)}` : `s.${id(c)}`
  ).join(", ");

  const linhaVirtual = COLUNAS_SIMULADOR.map((c) => {
    if (c === "filial") {
      return `('${PREFIXO_VIRTUAL}' || substring(s."filial" from ${PREFIXO_FISICO.length + 1})) AS "filial"`;
    }
    return soDoFisico.includes(c) ? `0::numeric AS ${id(c)}` : `s.${id(c)}`;
  }).join(", ");

  const temQuantidade = COLUNAS_VIRTUAIS.map((c) => `COALESCE(s.${id(c)},0) <> 0`).join(" OR ");

  // Sem o filtro aqui dentro, as duas metades varrem a tabela inteira (todos os
  // snapshots) e só depois o chamador descarta o que não é do dia. Empurrar a
  // condição para dentro do UNION mantém o volume no tamanho de um snapshot.
  const doDia = filtroSnapshot ? `${filtroSnapshot} AND ` : "";

  return `(
    SELECT ${linhaFisica} FROM simulador s
     ${filtroSnapshot ? `WHERE ${filtroSnapshot}` : ""}
    UNION ALL
    SELECT ${linhaVirtual} FROM simulador s
     WHERE ${doDia}s."filial" LIKE '${PREFIXO_FISICO}%' AND (${temQuantidade})
  )`;
}

/**
 * Todas as colunas da tabela `simulador`, na ordem do schema.
 *
 * Mantida à mão porque o UNION ALL precisa das duas metades com exatamente as
 * mesmas colunas na mesma ordem. Se uma coluna nova entrar no schema, ela
 * precisa entrar aqui também — e, se for quantidade do CD, em
 * `COLUNAS_SO_DO_FISICO`.
 */
export const COLUNAS_SIMULADOR = [
  "id",
  "createdAt",
  "data_snapshot",
  "cod_prod_cod_filial",
  "codigo",
  "filial",
  "produto",
  "marca",
  "fornecedor",
  "est_arm_01",
  "est_arm_11",
  "est_arm_26",
  "est_arm_nac",
  "est_arm_q40",
  "est_arm_rc",
  "estoque_cmv",
  "cmv_unitario",
  "cmv_unitario_1",
  "compras_arm_01",
  "compras_arm_26",
  "compras_arm_nac",
  "valor_pedido_aberto_bruto",
  "valor_pedido_aberto_cmv",
  "em_transf_arm_01",
  "em_transf_arm_11",
  "em_transf_arm_26",
  "total_trans",
  "reserva",
  "qtd_pendente",
  "bloqueio",
  "vendido_m0_arm_01",
  "vendido_m0_arm_26",
  "vendido_m0_arm_11",
  "vendido_m0_arm_tr",
] as const;
