/**
 * Constantes compartilhadas entre servidor e cliente.
 *
 * Mora fora de `consultas.ts` de propósito: aquele módulo importa o Prisma, e
 * um componente cliente que importe qualquer valor dele arrasta o driver do
 * banco para o bundle do navegador (`net`, `tls`, `dns` não existem lá).
 */

/** Valor de `filial` que representa a visão consolidada da companhia. */
export const FILIAL_CIA = "__cia__";
