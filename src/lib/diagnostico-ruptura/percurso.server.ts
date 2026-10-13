/**
 * O percurso realizado de uma triangulação: perna a perna, com o que levou.
 *
 * Responde "a mercadoria passou por onde, e demorou quanto em cada trecho" —
 * e, para o que ainda está andando, quando chega. É o que falta para explicar
 * uma ruptura causada por triangulação lenta: o diagnóstico diz que a
 * triangulação atrasou, isto mostra **onde**.
 *
 * **O rastro é o lote, e não o pedido.** A coluna `pedido_bo` existe em
 * `transferencias_abertas` e vem vazia em 100% das linhas, então não há como
 * ligar uma nota ao pedido de compra que a originou. O lote, preenchido em
 * 99,8% das linhas, segue a mercadoria física entre as pernas — conferido na
 * base: o lote D874489J aparece nos passos 1, 2 e 3 da rota ES > CAJ > DF2 >
 * NSR, com os pares de CD batendo com cada trecho.
 *
 * Dois limites conhecidos, e nenhum dos dois é contornável com o dado de hoje:
 *
 *   **Lote não é remessa.** Um lote aparece em até 51 notas ao longo de
 *   semanas. Encadear "as 86 unidades da perna 1 são as mesmas da perna 2" é
 *   inferência por proximidade de data e quantidade, não fato. Por isso a tela
 *   mostra as pernas e não afirma que elas carregam a mesma caixa.
 *
 *   **A data de chegada tem a granularidade das cargas.** A nota some do
 *   snapshot quando a mercadoria entra, então a chegada é datada na carga
 *   seguinte ao último avistamento — a mesma dedução de `janela.ts`, com o
 *   mesmo erro possível de um dia quando há buraco de importação.
 *
 * Em agosto nenhuma linha tem `codigo` preenchido (o reimport de Produtos
 * zerou), e em setembro são 63,5%. O que não tem código não aparece aqui.
 *
 * Só lê.
 */
import { prisma } from "@/lib/prisma";
import { carregarFiliais, carregarSla } from "@/lib/transferencias/consultas";
import {
  chaveSla,
  parseRota,
  somarDiasUteis,
} from "@/utils/projecao-transferencias";

/** Uma perna do percurso, já com o que levou contra o que devia levar. */
export type PernaRealizada = {
  passo: number;
  de: string;
  para: string;
  nf: string;
  /** Emissão da nota: quando a carga saiu. */
  saiu: string;
  /** Entrada no CD; `null` enquanto a nota continua em aberto. */
  chegou: string | null;
  /** Chegada projetada pelo SLA, para a perna que ainda está andando. */
  chegadaPrevista: string | null;
  /**
   * A previsão já venceu e a nota continua em aberto.
   *
   * Sem esta marca a tela escreve "prevista para 05/09" num dia que já passou,
   * que é a leitura mais errada possível: dá cara de boa notícia para a carga
   * que está parada há mais tempo.
   */
  vencida: boolean;
  /** Dias corridos entre a saída e a entrada. */
  dias: number | null;
  /** Dias úteis que o SLA promete para o trecho. */
  sla: number | null;
  /** Dias além do SLA; negativo é adiantado. `null` sem uma das pontas. */
  atraso: number | null;
  quantidade: number;
};

export type Percurso = {
  lote: string;
  /** A rota como a base escreve: "ES > CAJ > DF2 > NSR". */
  rota: string;
  cdFinal: string;
  pernas: PernaRealizada[];
  /** Dias corridos entre a primeira saída e a última chegada conhecida. */
  diasTotais: number | null;
  /** Todas as pernas já chegaram. */
  concluido: boolean;
  /** Soma dos atrasos das pernas concluídas. */
  atrasoAcumulado: number;
  /** Alguma perna em aberto já passou da data prevista. */
  temPernaVencida: boolean;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const diasEntre = (a: string, b: string) =>
  Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  );

/**
 * Os percursos que terminam neste CD, no período.
 *
 * Uma consulta. O agrupamento por lote e rota e o cálculo dos prazos ficam em
 * memória: é pouca linha por item, e em SQL a mesma lógica viraria três CTEs
 * que ninguém consegue conferir.
 */
export async function carregarPercursos(
  codigo: string,
  filial: string,
  de: string,
  ate: string,
  /** Data de referência, para projetar a perna que ainda está andando. */
  referencia: string,
): Promise<Percurso[]> {
  const [linhas, sla, siglaParaCodigo] = await Promise.all([
    prisma.$queryRawUnsafe<
      {
        nf: string;
        passo: number | null;
        rota: string | null;
        lote: string;
        de: string | null;
        para: string | null;
        emissao: Date | null;
        sumiu_em: Date | null;
        qtde: number;
      }[]
    >(
      // A nota some da carga quando a mercadoria entra: `sumiu_em` é a carga
      // seguinte ao último avistamento. Nota vista na última carga da janela
      // fica com `sumiu_em` nulo — pode ter chegado ou a janela pode ter
      // acabado antes da próxima importação, e não há como distinguir.
      `WITH cargas AS (
         SELECT DISTINCT data_snapshot::date AS d
           FROM transferencias_abertas
          WHERE data_snapshot >= $2::date AND data_snapshot <= $3::date
       ),
       par AS (SELECT d, LEAD(d) OVER (ORDER BY d) AS prox FROM cargas),
       notas AS (
         SELECT numero_nf_saida            AS nf,
                passo::int                 AS passo,
                rota,
                COALESCE(NULLIF(trim(lote), ''), '-') AS lote,
                filial_codigo_saida        AS de,
                filial_codigo_entrada      AS para,
                MIN(data_emissao)::date    AS emissao,
                MAX(data_snapshot)::date   AS visto_ate,
                SUM(COALESCE(qtde, 0))::float8 AS qtde
           FROM transferencias_abertas
          WHERE codigo = $1
            AND data_snapshot >= $2::date AND data_snapshot <= $3::date
            AND numero_nf_saida IS NOT NULL
          GROUP BY 1, 2, 3, 4, 5, 6
       )
       SELECT notas.*, par.prox AS sumiu_em
         FROM notas LEFT JOIN par ON par.d = notas.visto_ate
        ORDER BY notas.passo, notas.emissao`,
      codigo,
      de,
      ate,
    ),
    carregarSla(),
    carregarFiliais(),
  ]);

  /** Último CD da rota, ou o destino da nota quando não há rota. */
  const cdFinalDe = (rota: string | null, para: string | null) => {
    const siglas = parseRota(rota);
    if (siglas.length === 0) return para;
    return siglaParaCodigo.get(siglas.at(-1)!.toUpperCase()) ?? null;
  };

  const porPercurso = new Map<string, Percurso>();

  for (const l of linhas) {
    if (!l.emissao || !l.de || !l.para) continue;
    const cdFinal = cdFinalDe(l.rota, l.para);
    // Só o que termina aqui: carga que passa por este CD a caminho de outro
    // destino não vira estoque disponível e não explica a ruptura.
    if (cdFinal !== filial) continue;

    const saiu = iso(l.emissao);
    const chegou = l.sumiu_em ? iso(l.sumiu_em) : null;
    const transito = sla.get(chaveSla(l.de, l.para)) ?? null;

    const perna: PernaRealizada = {
      passo: l.passo ?? 1,
      de: l.de,
      para: l.para,
      nf: l.nf,
      saiu,
      chegou,
      chegadaPrevista:
        chegou === null && transito !== null
          ? iso(
              somarDiasUteis(
                new Date(`${saiu}T00:00:00.000Z`),
                Math.round(transito),
              ),
            )
          : null,
      vencida:
        chegou === null &&
        transito !== null &&
        iso(
          somarDiasUteis(
            new Date(`${saiu}T00:00:00.000Z`),
            Math.round(transito),
          ),
        ) < referencia,
      dias: chegou ? diasEntre(saiu, chegou) : null,
      sla: transito,
      atraso:
        chegou && transito !== null ? diasEntre(saiu, chegou) - transito : null,
      quantidade: l.qtde,
    };

    const rota = l.rota?.trim() && l.rota.trim() !== "-" ? l.rota.trim() : "—";
    const k = `${l.lote}|${rota}`;
    const atual = porPercurso.get(k);
    if (atual) atual.pernas.push(perna);
    else {
      porPercurso.set(k, {
        lote: l.lote,
        rota,
        cdFinal,
        pernas: [perna],
        diasTotais: null,
        concluido: false,
        atrasoAcumulado: 0,
        temPernaVencida: false,
      });
    }
  }

  const percursos = [...porPercurso.values()];
  for (const p of percursos) {
    p.pernas.sort((a, b) => a.passo - b.passo || a.saiu.localeCompare(b.saiu));
    const primeira = p.pernas[0];
    const ultima = p.pernas.at(-1)!;
    p.concluido = p.pernas.every((x) => x.chegou !== null);
    p.diasTotais =
      p.concluido && ultima.chegou
        ? diasEntre(primeira.saiu, ultima.chegou)
        : null;
    p.atrasoAcumulado = p.pernas.reduce(
      (a, x) => a + Math.max(0, x.atraso ?? 0),
      0,
    );
    p.temPernaVencida = p.pernas.some((x) => x.vencida);
  }

  // O que ainda está andando primeiro — é onde há ação possível —, e depois o
  // que atrasou mais, que é o que explica a ruptura já consumada.
  return percursos
    .sort(
      (a, b) =>
        // Perna vencida primeiro: é a carga parada, onde ainda há o que cobrar.
        Number(b.temPernaVencida) - Number(a.temPernaVencida) ||
        Number(a.concluido) - Number(b.concluido) ||
        b.atrasoAcumulado - a.atrasoAcumulado ||
        b.pernas[0].saiu.localeCompare(a.pernas[0].saiu),
    )
    .slice(0, 6);
}
