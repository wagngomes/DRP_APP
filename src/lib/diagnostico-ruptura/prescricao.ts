/**
 * A resposta acionável: o que teria bastado.
 *
 * O diagnóstico diz de quem foi a ruptura. Isto diz o que a teria evitado —
 * *"se tivessem transferido 340 unidades até 02/09, não teria rompido"*. É a
 * diferença entre autópsia e lição, e é o número que alguém leva para a
 * reunião de segunda.
 *
 * Duas perguntas, e as duas saem do mesmo replay que mede as causas:
 *
 *   **Quanto bastaria?** A menor quantidade que, chegando numa data, zera a
 *   ruptura. Achada por busca binária — estoque a mais nunca aumenta os dias
 *   sem estoque, então a função é monótona e a busca converge.
 *
 *   **Até quando dava?** A última data em que ainda era possível evitar com o
 *   que havia disponível. Depois dela, nenhuma quantidade resolve: a falta já
 *   tinha acontecido.
 *
 * Tudo puro, sobre `diasEmRuptura`. Nenhum acesso a banco.
 */
import { diasDaJanela, diasEmRuptura, type Cenario } from "./replay";

/** O que teria evitado a ruptura. */
export type Prescricao = {
  /** Quantidade que bastaria, chegando em `data`. */
  quantidade: number;
  /** Último dia em que a chegada ainda resolveria. */
  data: string;
  /** Dias de ruptura que restariam — zero quando a prescrição resolve tudo. */
  diasRestantes: number;
};

/**
 * Precisão da busca, em unidades.
 *
 * Um décimo de unidade: abaixo disso a resposta deixa de ser acionável — não
 * se transfere meia caixa — e a busca gastaria iterações para refinar um
 * número que ninguém usa.
 */
const PRECISAO = 0.1;

/**
 * A menor quantidade que, chegando em `data`, zera a ruptura.
 *
 * `null` quando nem o teto resolve: ou a chegada é tarde demais, ou o buraco é
 * maior do que o disponível. Nesse caso a pergunta certa passa a ser "quanto
 * reduziria", e não "quanto resolveria".
 */
export function quantidadeMinima(
  real: Cenario,
  data: string,
  /** Teto da busca: o que de fato havia para transferir ou comprar. */
  disponivel: number,
): number | null {
  if (disponivel <= 0) return null;

  const com = (q: number) =>
    diasEmRuptura({ ...real, chegadas: [...real.chegadas, { data, quantidade: q }] });

  // Se o teto não resolve, não há quantidade mínima a procurar.
  if (com(disponivel) > 0) return null;
  if (com(0) === 0) return 0;

  let baixo = 0;
  let alto = disponivel;
  while (alto - baixo > PRECISAO) {
    const meio = (baixo + alto) / 2;
    if (com(meio) === 0) alto = meio;
    else baixo = meio;
  }
  return Math.ceil(alto);
}

/**
 * A última data em que ainda dava para evitar, e quanto custaria.
 *
 * Varre do fim para o começo: a primeira data que funciona, vindo de trás, é a
 * mais tarde possível — e é a mais útil de saber, porque é o prazo que a
 * operação tinha. Saber que dava para resolver no dia 1º é menos acionável que
 * saber que dava até o dia 8.
 *
 * A varredura para no início da ruptura: depois que a prateleira esvaziou, uma
 * chegada não desfaz os dias já perdidos, só encurta os que faltam.
 */
export function ultimaChance(
  real: Cenario,
  disponivel: number,
  /** Não adianta prescrever chegada depois do começo da falta. */
  ateODia: string,
): Prescricao | null {
  const dias = diasDaJanela(real.de, ateODia);

  for (let i = dias.length - 1; i >= 0; i--) {
    const q = quantidadeMinima(real, dias[i], disponivel);
    if (q !== null) {
      return { quantidade: q, data: dias[i], diasRestantes: 0 };
    }
  }
  return null;
}

/**
 * Quando evitar por completo não era possível, o melhor que dava.
 *
 * Existe porque "não havia solução" é uma resposta ruim para quem precisa agir:
 * mesmo sem evitar a ruptura inteira, transferir o que havia no primeiro dia
 * útil teria encurtado a falta, e saber de quanto é o que justifica mudar o
 * processo.
 */
export function melhorEsforco(
  real: Cenario,
  disponivel: number,
  data: string,
): Prescricao | null {
  if (disponivel <= 0) return null;

  const restantes = diasEmRuptura({
    ...real,
    chegadas: [...real.chegadas, { data, quantidade: disponivel }],
  });
  const semNada = diasEmRuptura(real);
  if (restantes >= semNada) return null;

  return { quantidade: disponivel, data, diasRestantes: restantes };
}

/**
 * A prescrição de uma posição: resolve tudo, ou o melhor que dava.
 *
 * A tela mostra uma frase diferente para cada caso, e a distinção importa —
 * "bastavam 340 unidades até 02/09" cobra uma decisão que não foi tomada;
 * "nem todo o estoque da rede resolveria" absolve quem não a tomou.
 */
export function prescrever(
  real: Cenario,
  disponivel: number,
  inicioDaRuptura: string,
): { tipo: "evitaria" | "reduziria"; prescricao: Prescricao } | null {
  const completa = ultimaChance(real, disponivel, inicioDaRuptura);
  if (completa) return { tipo: "evitaria", prescricao: completa };

  const parcial = melhorEsforco(real, disponivel, inicioDaRuptura);
  return parcial ? { tipo: "reduziria", prescricao: parcial } : null;
}
