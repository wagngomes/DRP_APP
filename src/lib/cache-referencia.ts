/**
 * Cache em memória para dados que quase nunca mudam.
 *
 * O banco fica em outra região: cada ida e volta custa ~150 ms, medidos. As
 * tabelas de apoio — filiais, SLA entre CDs, siglas — têm dezenas de linhas e
 * só mudam quando alguém importa um CSV, mas eram lidas de novo a cada abertura
 * de página. Três dessas leituras somavam ~450 ms de espera por request para
 * trazer 130 linhas no total.
 *
 * Guardar em memória troca esse custo por zero. O risco de servir dado velho é
 * tratado nas duas pontas: um TTL curto, e a invalidação explícita que o
 * endpoint de importação dispara ao gravar ou limpar qualquer tabela. Ou seja,
 * o TTL é a rede de segurança, não o mecanismo principal.
 *
 * Só para leitura derivada de tabela pequena e estável. Nada que dependa da
 * data de referência do sistema deve entrar aqui sem a data na chave.
 */

/** Tempo de vida. Curto: é rede de segurança, não a via principal. */
const TTL_MS = 60_000;

type Entrada = { valor: unknown; expiraEm: number };

const cache = new Map<string, Entrada>();
/** Promessas em voo, para dois requests simultâneos não dispararem a mesma consulta. */
const emVoo = new Map<string, Promise<unknown>>();

/**
 * Executa `carregar` no máximo uma vez por chave enquanto o valor for válido.
 *
 * A chave precisa conter tudo que muda o resultado — data de referência e
 * parâmetros inclusive. Chave incompleta serve resposta de outro recorte, que
 * é pior do que não ter cache.
 */
export async function memoizar<T>(chave: string, carregar: () => Promise<T>): Promise<T> {
  const agora = Date.now();
  const guardado = cache.get(chave);
  if (guardado && guardado.expiraEm > agora) return guardado.valor as T;

  const jaPedido = emVoo.get(chave);
  if (jaPedido) return jaPedido as Promise<T>;

  const promessa = carregar()
    .then((valor) => {
      cache.set(chave, { valor, expiraEm: Date.now() + TTL_MS });
      return valor;
    })
    .finally(() => {
      emVoo.delete(chave);
    });

  emVoo.set(chave, promessa);
  return promessa;
}

/**
 * Descarta tudo. Chamado pelo endpoint de importação depois de gravar ou
 * limpar uma tabela — é o que garante que um upload apareça na hora, em vez de
 * esperar o TTL.
 */
export function limparCacheReferencia(): void {
  cache.clear();
  emVoo.clear();
}
