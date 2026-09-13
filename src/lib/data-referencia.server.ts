import { ehIsoValido, hojeNaOperacao } from "@/lib/data-referencia";
import { CHAVE_DATA_REFERENCIA, lerConfiguracoes } from "@/lib/configuracao.server";

/**
 * Data de referência do sistema — a mesma para todos.
 *
 * Fica separada de `@/lib/data-referencia` para aquele módulo continuar sendo
 * lógica pura, testável fora do Next e sem banco.
 *
 * Vinha de cookie até a equipe começar a usar o sistema: cada navegador tinha a
 * sua, então duas pessoas discutindo a mesma tela podiam estar olhando dias
 * diferentes sem perceber. Agora o administrador define e todos veem o mesmo.
 *
 * Sem valor gravado (instalação nova), assume hoje **no fuso da operação** — e
 * não em UTC, que às 21h já virou o dia seguinte e fazia o sistema apontar para
 * um dia sem importação nenhuma.
 */
export async function lerDataReferencia(): Promise<string> {
  const valor = (await lerConfiguracoes()).get(CHAVE_DATA_REFERENCIA);
  if (valor && ehIsoValido(valor)) return valor;
  return hojeNaOperacao();
}
