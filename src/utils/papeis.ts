/**
 * Papéis do sistema: a regra, sem I/O.
 *
 * Separado de `lib/autorizacao.ts` porque aquele módulo importa o Better Auth,
 * que por sua vez constrói o cliente de e-mail e falha sem chave de API. Quem
 * quiser apenas interpretar um papel — a tela, um teste — não deveria arrastar
 * uma dependência de rede junto.
 *
 * Dois papéis, e só dois. `admin` opera o sistema; `user` consulta.
 */

export type Papel = "admin" | "user";

export const PAPEIS: Papel[] = ["admin", "user"];

export const ROTULO_PAPEL: Record<Papel, string> = {
  admin: "Administrador",
  user: "Consulta",
};

export const DESCRICAO_PAPEL: Record<Papel, string> = {
  admin: "Opera o sistema: cockpit, cenários, exportações e gestão de usuários.",
  user: "Consulta as telas de análise, sem gerar análise nem exportar.",
};

/**
 * Valor da coluna vindo do banco, normalizado.
 *
 * Qualquer coisa que não seja exatamente "admin" é tratada como `user`. Dado
 * corrompido, coluna nula numa conta antiga ou papel removido no futuro
 * degradam para o menor privilégio, nunca para o maior — é a direção certa
 * para um erro tomar.
 *
 * A comparação é exata de propósito: "Admin" digitado à mão no banco não
 * promove ninguém. A única grafia válida é a que o sistema escreve.
 */
export function lerPapel(valor: unknown): Papel {
  return valor === "admin" ? "admin" : "user";
}
