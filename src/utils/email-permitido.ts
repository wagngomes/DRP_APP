/**
 * Quem pode criar conta, por domínio de e-mail.
 *
 * O formulário de cadastro é público: qualquer pessoa que alcance a URL o vê.
 * Confirmar o e-mail prova que a caixa existe e pertence a quem clicou — não
 * prova que a pessoa é da empresa. Sem esta lista, alguém com um endereço
 * qualquer cria conta e passa a enxergar estoque, vendas, fornecedores e
 * clientes de toda a companhia.
 *
 * Configurada por ambiente, não no código:
 *
 *   EMAIL_DOMINIOS_PERMITIDOS="empresa.com.br,filial.com.br"
 *
 * Lista vazia libera qualquer domínio, e é o padrão — ligar a restrição sem
 * ninguém configurar trancaria o primeiro cadastro de uma instalação nova. O
 * aviso em `avisoDominios()` existe para essa escolha não passar despercebida.
 */

export function dominiosPermitidos(valor = process.env.EMAIL_DOMINIOS_PERMITIDOS): string[] {
  return (valor ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

/**
 * O e-mail pode criar conta?
 *
 * Compara só o que vem depois do último `@`. Um endereço do tipo
 * `alguem@mal.com@empresa.com.br` não existe como endereço válido, mas se
 * chegasse aqui seria lido pelo domínio final — que é o que o servidor de
 * e-mail também usaria.
 */
export function emailPermitido(
  email: string,
  permitidos = dominiosPermitidos()
): boolean {
  if (permitidos.length === 0) return true;

  const dominio = email.trim().toLowerCase().split("@").pop();
  if (!dominio) return false;

  // Subdomínio conta: "vendas.empresa.com.br" passa por "empresa.com.br". O
  // ponto na comparação impede que "naoempresa.com.br" também passasse.
  return permitidos.some((p) => dominio === p || dominio.endsWith(`.${p}`));
}

/** Texto para a tela de cadastro, quando há restrição. */
export function avisoDominios(permitidos = dominiosPermitidos()): string | null {
  if (permitidos.length === 0) return null;
  const lista = permitidos.map((d) => `@${d}`).join(", ");
  return `Apenas endereços ${lista} podem criar conta.`;
}
