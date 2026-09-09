/**
 * Rota de compra: o percurso que a mercadoria faz do fornecedor até o CD.
 *
 * Vem da coluna `rota_compra` do forecast, por (produto, filial), e usa um
 * formato **diferente** da coluna `rota` das transferências:
 *
 *   rota_compra (aqui) ....: "1015->1006"   códigos, separador "->"
 *   rota (transferências) .: "DF2 > CAJ"    siglas, separador ">"
 *
 * Por isso `parseRota()` de `projecao-transferencias` não serve — dividir por
 * ">" deixaria "1015-" no primeiro elemento.
 *
 * O primeiro elemento é onde o fornecedor entrega; os seguintes são passos
 * internos entre CDs, cobertos pelo SLA. Um único elemento significa entrega
 * direta naquele CD.
 */

const SEPARADOR = "->";

/** Normaliza como o import faz com colunas de código: "001006" -> "1006". */
function normalizarCodigo(valor: string): string {
  const limpo = valor.trim();
  return /^\d+$/.test(limpo) ? limpo.replace(/^0+(?=\d)/, "") : limpo;
}

/**
 * Quebra a rota em códigos de CD. Devolve lista vazia quando não há rota.
 *
 * Um elemento é válido: é a entrega direta. Não há o mínimo de dois que a rota
 * de transferências exige, porque ali sempre há um trecho a percorrer.
 */
export function parseRotaCompra(rota: string | null): string[] {
  if (!rota) return [];
  return rota
    .split(SEPARADOR)
    .map(normalizarCodigo)
    .filter((p) => p.length > 0);
}

export type PercursoCompra = {
  /** CD onde o fornecedor entrega. */
  primeiroCd: string;
  /** Passos internos entre CDs, na ordem. Vazio na entrega direta. */
  pernas: { de: string; para: string }[];
  /** True quando o fornecedor entrega direto no CD de destino. */
  direto: boolean;
  /**
   * Preenchido quando a rota não termina no CD da posição. Nesse caso o
   * percurso é tratado como entrega direta no CD, porque inventar uma perna
   * daria uma data errada com aparência de certa.
   */
  inconsistente?: "rota_nao_termina_no_cd";
};

/**
 * Monta o percurso de uma posição a partir da rota e do CD de destino.
 *
 * Em 169 das 15.193 linhas do forecast a rota não termina no CD da própria
 * linha. Em vez de completar a rota com uma perna inventada, esses casos caem
 * para entrega direta e ficam marcados — a divergência aparece nos avisos em
 * vez de virar uma data silenciosamente errada.
 */
export function resolverPercursoCompra(
  rota: string | null,
  cdDestino: string
): PercursoCompra | null {
  const passos = parseRotaCompra(rota);
  if (passos.length === 0) return null;

  const ultimo = passos[passos.length - 1];
  if (ultimo !== cdDestino) {
    return {
      primeiroCd: cdDestino,
      pernas: [],
      direto: true,
      inconsistente: "rota_nao_termina_no_cd",
    };
  }

  const pernas = passos
    .slice(0, -1)
    .map((de, i) => ({ de, para: passos[i + 1] }));

  return { primeiroCd: passos[0], pernas, direto: pernas.length === 0 };
}
