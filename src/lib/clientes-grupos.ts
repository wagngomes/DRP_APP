/**
 * O grupo de cada cliente, na versão vigente para o mês consultado.
 *
 * `clientes_grupos` é base mensal, não cadastro fixo: o vínculo entre CNPJ e
 * grupo muda com aquisição, reorganização comercial, cliente que troca de rede.
 * Sem a data, reimportar reescreveria a história — um mês fechado passaria a ser
 * lido com os grupos de hoje, e o Contratos × Spot do raio-X mudaria sozinho sem
 * ninguém ter mexido em venda nenhuma.
 *
 * **A regra não é a do forecast.** Lá vale "o snapshot daquele mês", porque há
 * uma carga por mês, sempre. Aqui a carga é esporádica: se a de agosto não
 * existe, a de maio continua valendo. Exigir carga do mês faria todo cliente
 * perder o grupo nos meses sem importação, e a divisão entre contrato e spot
 * desabaria em silêncio.
 *
 * A regra é "a mais recente que não seja posterior ao mês consultado" — a base
 * vale até ser substituída:
 *
 *   cargas em maio e outubro:
 *     agosto   -> usa a de maio
 *     outubro  -> usa a de outubro
 *     novembro -> usa a de outubro, até existir uma de novembro
 */

/**
 * Subconsulta com um grupo por CNPJ, pronta para entrar num JOIN.
 *
 * `paramData` é o placeholder do parâmetro que carrega a data de referência
 * (ex.: `"$1"`). Qual data entra ali depende da tela: no raio-X é a competência
 * selecionada, nas telas de risco é a data de referência do sistema. Nos dois
 * casos é "o mês que está sendo olhado".
 */
export function gruposPorCnpj(paramData: string): string {
  return `(
    SELECT DISTINCT ON (cliente_cnpj) cliente_cnpj, cliente_grupo, cliente_nome
      FROM clientes_grupos
     WHERE cliente_cnpj IS NOT NULL
       AND data_snapshot = ${snapshotVigente(paramData)}
     ORDER BY cliente_cnpj
  )`;
}

/**
 * A carga vigente para o mês de `paramData`.
 *
 * Compara contra o **fim** do mês, e não contra a data em si: uma carga feita no
 * dia 15 de outubro precisa valer para outubro inteiro, inclusive para quem
 * consulta o dia 1º.
 */
export function snapshotVigente(paramData: string): string {
  return `(
      SELECT MAX(_cg.data_snapshot) FROM clientes_grupos _cg
       WHERE _cg.data_snapshot < date_trunc('month', ${paramData}::date) + interval '1 month'
    )`;
}
