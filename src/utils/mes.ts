/**
 * Limites do mês de uma data, para recortar consultas.
 *
 * Existia copiada em seis módulos — idêntica byte a byte nos cinco primeiros, o
 * que é sorte e não garantia. Nesta base, lógica duplicada já divergiu em
 * silêncio mais de uma vez, e o sintoma nunca é um erro: é um número que não
 * fecha com o da tela ao lado.
 *
 * Intervalo semiaberto (`>= inicio AND < fim`) para não depender do número de
 * dias do mês nem de precisão de horário. Tudo em UTC: `Date.UTC` e
 * `toISOString` são o par que não escorrega de dia conforme o fuso da máquina —
 * o mesmo motivo pelo qual a data de referência do sistema não usa `toISOString`
 * sobre data local.
 */
export type LimitesMes = {
  /** Primeiro dia do mês, inclusivo. */
  inicio: string;
  /** Primeiro dia do mês seguinte, exclusivo. */
  fim: string;
};

export function limitesDoMes(data: string): LimitesMes {
  const [ano, mes] = data.split("-").map(Number);
  return {
    inicio: new Date(Date.UTC(ano, mes - 1, 1)).toISOString().slice(0, 10),
    fim: new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10),
  };
}
