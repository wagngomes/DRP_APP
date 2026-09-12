/**
 * Registro de eventos de segurança.
 *
 * Responde à pergunta que só aparece depois do incidente: *quem fez isso, e
 * quando?* Sem registro, a resposta é "não dá para saber" — e a diferença entre
 * um susto e uma investigação é exatamente esse arquivo.
 *
 * Escreve em `stdout` em JSON, e não numa tabela, por três razões: o Docker já
 * coleta stdout, a linha sobrevive mesmo quando o banco é o que está com
 * problema, e não há como uma ação da aplicação apagar o próprio rastro. A
 * contrapartida é que o log vive enquanto o contêiner viver — quando houver
 * coletor central, é só apontá-lo para cá.
 *
 * **Nada de segredo, senha, token ou conteúdo de dado entra aqui.** O e-mail
 * aparece porque é o identificador da conta e sem ele o registro não serve para
 * nada; qualquer outro dado pessoal fica de fora.
 */

export type EventoSeguranca =
  /** Entrada bem-sucedida. */
  | "login_ok"
  /** Tentativa recusada — senha errada, conta inexistente, e-mail não verificado. */
  | "login_falha"
  /** Cadastro recusado por domínio fora da lista. */
  | "cadastro_bloqueado"
  /** Papel de uma conta alterado. */
  | "papel_alterado"
  /** Parâmetro do sistema alterado — muda os números de todas as telas. */
  | "parametro_alterado"
  /** Ação recusada por falta de permissão. */
  | "acesso_negado"
  /** Teto de requisições atingido. */
  | "limite_excedido"
  /** Importação que substituiu o conteúdo de uma tabela. */
  | "importacao";

type Detalhes = {
  /** Quem agiu, quando há sessão. */
  ator?: string;
  /** Sobre quem ou o quê a ação recaiu. */
  alvo?: string;
  /** Origem da requisição, quando conhecida. */
  origem?: string;
  /** Complemento curto: motivo da recusa, papel novo, tabela importada. */
  detalhe?: string;
};

/**
 * `SEGURANCA` no início da linha para o filtro ser trivial em qualquer
 * ferramenta: `docker compose logs app | grep SEGURANCA`.
 */
export function registrar(evento: EventoSeguranca, detalhes: Detalhes = {}): void {
  const linha = {
    tipo: "SEGURANCA",
    evento,
    em: new Date().toISOString(),
    ...detalhes,
  };

  // `console.log` e não um logger: é a saída que o Docker captura, e uma
  // dependência a mais aqui seria uma dependência dentro do caminho de
  // autenticação.
  console.log(`SEGURANCA ${JSON.stringify(linha)}`);
}
