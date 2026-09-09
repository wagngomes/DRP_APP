/**
 * Projeção de chegada das transferências em aberto.
 *
 * Uma transferência pode ser simples (origem → destino) ou de triangulação,
 * quando percorre vários CDs até o destino final. O tempo de cada perna vem do
 * SLA, em dias úteis, e a projeção parte da emissão da nota da perna atual.
 */

/** Uma perna do percurso, já projetada. */
export type Etapa = {
  /** Código da filial de onde sai. */
  de: string;
  /** Código da filial onde entra. */
  para: string;
  /** Dias úteis de trânsito segundo o SLA; `null` quando o par não existe. */
  transitTime: number | null;
  /** Chegada prevista; `null` quando falta SLA em alguma perna anterior. */
  chegadaPrevista: Date | null;
};

export type MotivoIndefinido =
  | "sigla_desconhecida"
  | "sem_sla"
  | "passo_invalido"
  | "sem_data_emissao";

export type Projecao = {
  /** Último CD do percurso: fim da rota, ou o destino quando não há rota. */
  cdFinal: string | null;
  /** Pernas que ainda faltam, da atual até a última. */
  etapas: Etapa[];
  /** Chegada no destino final; `null` se algo impediu o cálculo. */
  chegadaFinal: Date | null;
  /**
   * True quando a projeção original caía no passado e o prazo informado pelo
   * usuário foi aplicado no lugar da data de emissão.
   */
  reprojetada: boolean;
  /** Preenchido quando `chegadaFinal` é null. */
  motivo?: MotivoIndefinido;
};

/**
 * Quebra a rota em siglas. O separador é ">" sem depender de espaços — a base
 * traz tanto "DF2 > CAJ" quanto "DF2 >CAJ", e há siglas com espaço interno
 * ("VAREJO SC"), então só as pontas são aparadas.
 */
export function parseRota(rota: string | null): string[] {
  if (!rota) return [];
  const partes = rota
    .split(">")
    .map((p) => p.trim())
    .filter(Boolean);
  return partes.length >= 2 ? partes : [];
}

/** Soma dias úteis (segunda a sexta), sem considerar feriados. */
export function somarDiasUteis(inicio: Date, dias: number): Date {
  const data = new Date(inicio.getTime());
  let restantes = Math.max(0, Math.round(dias));
  while (restantes > 0) {
    data.setUTCDate(data.getUTCDate() + 1);
    const diaSemana = data.getUTCDay();
    if (diaSemana !== 0 && diaSemana !== 6) restantes -= 1;
  }
  return data;
}

/**
 * Subtrai dias úteis (segunda a sexta), sem considerar feriados.
 *
 * Espelho de `somarDiasUteis`, para caminhar do prazo para trás: "para chegar
 * nesta data, o pedido tem de sair quando?".
 */
export function subtrairDiasUteis(fim: Date, dias: number): Date {
  const data = new Date(fim.getTime());
  let restantes = Math.max(0, Math.round(dias));
  while (restantes > 0) {
    data.setUTCDate(data.getUTCDate() - 1);
    const diaSemana = data.getUTCDay();
    if (diaSemana !== 0 && diaSemana !== 6) restantes -= 1;
  }
  return data;
}

/** Chave do SLA entre duas filiais. */
export function chaveSla(origem: string, destino: string): string {
  return `${origem}>${destino}`;
}

export type EntradaProjecao = {
  rota: string | null;
  filialSaida: string | null;
  filialEntrada: string | null;
  /** Perna atual informada pela origem (1-based). */
  passo: number | null;
  dataEmissao: Date | null;
  /** sigla (maiúscula) -> código da filial. */
  siglaParaCodigo: Map<string, string>;
  /** chaveSla() -> dias úteis. Já resolvido para o maior valor entre MAT e MED. */
  sla: Map<string, number>;
  /** Data de referência do sistema, usada para detectar projeção vencida. */
  dataReferencia: Date;
  /**
   * Dias úteis a partir da data de referência em que uma transferência vencida
   * entra no destino da perna atual. Só é aplicado quando a projeção original
   * termina no passado.
   */
  diasParaVencidas: number;
};

/**
 * Sequência de códigos de filial do percurso.
 *
 * Com rota, o percurso é a própria rota convertida para códigos. Sem rota, é
 * apenas origem → destino. Devolve `null` quando alguma sigla não está no
 * cadastro de filiais — projetar com rota incompleta daria data errada.
 */
export function resolverPercurso(
  entrada: Pick<EntradaProjecao, "rota" | "filialSaida" | "filialEntrada" | "siglaParaCodigo">
): string[] | null {
  const siglas = parseRota(entrada.rota);

  if (siglas.length === 0) {
    if (!entrada.filialSaida || !entrada.filialEntrada) return null;
    return [entrada.filialSaida, entrada.filialEntrada];
  }

  const codigos: string[] = [];
  for (const sigla of siglas) {
    const codigo = entrada.siglaParaCodigo.get(sigla.toUpperCase());
    if (!codigo) return null;
    codigos.push(codigo);
  }
  return codigos;
}

export function projetar(entrada: EntradaProjecao): Projecao {
  const percurso = resolverPercurso(entrada);
  if (!percurso) {
    return {
      cdFinal: null,
      etapas: [],
      chegadaFinal: null,
      reprojetada: false,
      motivo: "sigla_desconhecida",
    };
  }

  const cdFinal = percurso[percurso.length - 1];
  const totalPernas = percurso.length - 1;

  // Sem rota é sempre perna única; com rota, a origem informa em qual está.
  const temRota = parseRota(entrada.rota).length > 0;
  const pernaAtual = temRota ? (entrada.passo ?? 1) : 1;

  if (pernaAtual < 1 || pernaAtual > totalPernas) {
    return { cdFinal, etapas: [], chegadaFinal: null, reprojetada: false, motivo: "passo_invalido" };
  }
  if (!entrada.dataEmissao) {
    return { cdFinal, etapas: [], chegadaFinal: null, reprojetada: false, motivo: "sem_data_emissao" };
  }

  // A perna atual é a âncora de toda a projeção.
  const de0 = percurso[pernaAtual - 1];
  const para0 = percurso[pernaAtual];
  const sla0 = entrada.sla.get(chaveSla(de0, para0)) ?? null;

  if (sla0 === null) {
    return {
      cdFinal,
      etapas: [{ de: de0, para: para0, transitTime: null, chegadaPrevista: null }],
      chegadaFinal: null,
      reprojetada: false,
      motivo: "sem_sla",
    };
  }

  // Chegada da perna atual pela emissão da nota. Quando essa data já passou, a
  // transferência está parada há tempo demais para a emissão dizer algo útil:
  // o passo atual passa a se completar no prazo informado pelo usuário,
  // contado da data de referência, e o resto da rota segue a partir daí.
  const chegadaPelaEmissao = somarDiasUteis(entrada.dataEmissao, sla0);
  const vencida = chegadaPelaEmissao < entrada.dataReferencia;
  const chegadaPernaAtual = vencida
    ? somarDiasUteis(entrada.dataReferencia, entrada.diasParaVencidas)
    : chegadaPelaEmissao;

  const etapas: Etapa[] = [
    { de: de0, para: para0, transitTime: sla0, chegadaPrevista: chegadaPernaAtual },
  ];
  let cursor: Date | null = chegadaPernaAtual;

  for (let i = pernaAtual; i < totalPernas; i += 1) {
    const de = percurso[i];
    const para = percurso[i + 1];
    const transitTime = entrada.sla.get(chaveSla(de, para)) ?? null;
    // Sem SLA a corrente quebra: nem esta perna nem as seguintes têm data.
    const chegada: Date | null =
      cursor !== null && transitTime !== null ? somarDiasUteis(cursor, transitTime) : null;
    etapas.push({ de, para, transitTime, chegadaPrevista: chegada });
    cursor = chegada;
  }

  return {
    cdFinal,
    etapas,
    chegadaFinal: cursor,
    reprojetada: vencida,
    motivo: cursor === null ? "sem_sla" : undefined,
  };
}
