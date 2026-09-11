/**
 * Papéis e o que cada um pode fazer.
 *
 * Fonte única: nenhuma página, ação ou rota decide sozinha o que é permitido —
 * todas perguntam aqui. Autorização espalhada é como se esquece de proteger a
 * quarta tela depois de proteger três.
 *
 * A regra em si — quais papéis existem e como ler o valor do banco — vive em
 * `utils/papeis.ts`, sem I/O. Aqui ficam só as funções que precisam da sessão.
 *
 * A conta nova nasce como `user` (padrão da coluna no schema): poder é
 * concedido, não herdado.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { lerPapel, type Papel } from "@/utils/papeis";
import { registrar } from "@/lib/seguranca/auditoria";

// Reexporta a parte pura para quem já depende de sessão ter um import só.
export { lerPapel, PAPEIS, ROTULO_PAPEL, DESCRICAO_PAPEL, type Papel } from "@/utils/papeis";

/** O que exige papel de administrador. */
export const RECURSOS_ADMIN = [
  "/cockpit",
  "/cenarios",
  "/usuarios",
  "/api/cenarios/excel",
] as const;

type Usuario = { id: string; name: string; email: string; role?: unknown };

export type SessaoAtual = {
  usuario: { id: string; name: string; email: string; papel: Papel };
};

/** Sessão atual, ou `null` quando não há. Não redireciona. */
export async function lerSessao(): Promise<SessaoAtual | null> {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  const u = s.user as Usuario;
  return {
    usuario: { id: u.id, name: u.name, email: u.email, papel: lerPapel(u.role) },
  };
}

/**
 * Exige sessão. Sem ela, manda para o login — o que toda página protegida já
 * fazia à mão.
 */
export async function exigirSessao(): Promise<SessaoAtual> {
  const s = await lerSessao();
  if (!s) redirect("/login");
  return s;
}

/**
 * Exige papel de administrador.
 *
 * Sem sessão vai para o login; com sessão de consulta vai para a página
 * inicial com um aviso, e não para o login — mandar alguém autenticado para a
 * tela de entrada sugere que a sessão expirou, que é uma informação falsa e
 * leva a pessoa a tentar de novo.
 */
export async function exigirAdmin(): Promise<SessaoAtual> {
  const s = await lerSessao();
  if (!s) redirect("/login");
  if (s.usuario.papel !== "admin") {
    registrar("acesso_negado", { ator: s.usuario.email, detalhe: "tela restrita" });
    redirect("/?negado=1");
  }
  return s;
}

/**
 * Versão para Server Actions e rotas de API, que não redirecionam: devolvem
 * erro para quem chamou decidir a resposta.
 */
export async function exigirAdminOuErro(): Promise<
  { ok: true; sessao: SessaoAtual } | { ok: false; erro: string; status: 401 | 403 }
> {
  const s = await lerSessao();
  if (!s) return { ok: false, erro: "Não autenticado", status: 401 };
  if (s.usuario.papel !== "admin") {
    registrar("acesso_negado", { ator: s.usuario.email, detalhe: "ação restrita" });
    return { ok: false, erro: "Esta ação exige perfil de administrador", status: 403 };
  }
  return { ok: true, sessao: s };
}
