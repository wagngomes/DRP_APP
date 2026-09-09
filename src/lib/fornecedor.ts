/**
 * Nome de fornecedor usado em toda a aplicação.
 *
 * As bases de origem trazem o nome cru; a tabela `fornecedores` mapeia esse
 * nome para a versão padronizada. Todas as visões por fornecedor — filtros,
 * listagens e agrupamentos — usam o normalizado.
 *
 * O COALESCE é proposital: fornecedor ainda não mapeado continua aparecendo com
 * o nome cru, em vez de sumir da tela por falta de cadastro.
 */

/** JOIN a acrescentar na consulta. `alias` é a tabela que tem a coluna crua. */
export function joinFornecedor(alias: string): string {
  return `LEFT JOIN fornecedores forn ON forn.fornecedor = ${alias}.fornecedor`;
}

/** Expressão do nome normalizado, para SELECT, GROUP BY e WHERE. */
export function nomeFornecedor(alias: string): string {
  return `COALESCE(NULLIF(trim(forn.fornecedor_normalizado), ''), ${alias}.fornecedor)`;
}
