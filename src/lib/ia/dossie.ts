/**
 * Dossiê: o pacote de dados que o modelo lê.
 *
 * Não são as tabelas — é um resumo curado, com os números já calculados pelos
 * motores. O modelo não busca nada: lê o que está aqui e se manifesta. Por isso
 * o corte é determinístico e fica registrado, para a tela poder dizer
 * "analisadas 150 de 2.133 posições".
 *
 * Serializado em linhas compactas, não em JSON indentado: a mesma informação
 * ocupa cerca de um terço dos tokens, e o modelo lê tabela tão bem quanto objeto.
 *
 * Não conhece provedor nem modelo — só produz texto.
 */
import type { ItemConsolidado } from "@/lib/riscos/consolidar";
import type { DadosRisco } from "@/lib/riscos/motor";
import type { DadosVendas } from "@/lib/riscos/vendas";
import type { Coberturas } from "@/lib/parametros";
import { ROTULO_SECAO, ORDEM_SECOES } from "@/lib/riscos/tipos";

/** Teto de posições enviadas. Acima disso o ganho não paga o token. */
export const LIMITE_ITENS = 150;

export type Dossie = {
  texto: string;
  /** Itens efetivamente enviados, na ordem. */
  enviados: ItemConsolidado[];
  totalDisponivel: number;
};

function data(d: Date | null): string {
  return d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "-";
}

function n(v: number | null, casas = 0): string {
  return v === null ? "-" : v.toFixed(casas);
}

/** Uma linha por posição, com os campos que sustentam a priorização. */
function linhaItem(i: ItemConsolidado): string {
  const p = i.posicao;
  const partes = [
    `${p.codigo}|${p.filial}`,
    `${p.descricao?.slice(0, 40) ?? "-"}`,
    `forn=${p.fornecedor}`,
    `bu=${p.bu}`,
    `curva=${p.curva}`,
    `forecast=${n(p.forecast)}`,
    `chao=${n(p.estoqueChao)}`,
    `dias=${n(p.diasChao, 1)}`,
    `rompe=${data(p.dataRuptura)}`,
    `descobertos=${n(p.diasDescobertos, 0)}d`,
  ];

  const ev = i.evidencias;
  if (ev.compra?.dataLimite) {
    partes.push(
      `limite_compra=${data(ev.compra.dataLimite)}`,
      `lead_time=${ev.compra.leadTime}d`,
      `urgencia=${ev.compra.urgencia}`
    );
  }
  if (p.primeiraChegada) {
    const r = p.primeiraChegada;
    partes.push(
      `vem=${r.origem}:${n(r.quantidade)}un:${data(r.chegada)}${r.reprojetada ? ":REPROJETADA" : ""}`
    );
  } else {
    partes.push("vem=nada");
  }
  if (ev.transferencia) {
    const t = ev.transferencia;
    partes.push(
      `sugestao_transf=${t.origem}->${p.filial}:${n(t.quantidade)}un:${t.tipo}:chega=${data(t.chegada)}`
    );
  }

  return partes.join(" ");
}

export function montarDossie(
  dataReferencia: string,
  risco: DadosRisco,
  consolidado: ItemConsolidado[],
  vendas: DadosVendas,
  coberturas: Coberturas
): Dossie {
  const enviados = consolidado.slice(0, LIMITE_ITENS);

  const porSecao = ORDEM_SECOES.map(
    (s) => `${ROTULO_SECAO[s]}: ${consolidado.filter((i) => i.secao === s).length}`
  ).join(" | ");

  const blocos: string[] = [];

  blocos.push(
    [
      `DATA DE REFERENCIA: ${dataReferencia}`,
      `PARAMETROS: critico=${coberturas.critico}d gatilho=${coberturas.gatilho}d alvo=${coberturas.alvo}d`,
      `POSICOES AVALIADAS: ${risco.posicoes.length}`,
      `SEVERIDADE: rompido=${risco.totais.rompido} vai_romper=${risco.totais.vai_romper}` +
        ` no_limite=${risco.totais.no_limite} coberto=${risco.totais.ok}`,
      `SECOES: ${porSecao}`,
      `ITENS NESTE DOSSIE: ${enviados.length} de ${consolidado.length}` +
        ` (os de maior exposicao em unidades)`,
    ].join("\n")
  );

  blocos.push(
    "POSICOES\n" +
      "Campos: codigo|CD, descricao, fornecedor, BU, curva, forecast do mes, estoque chao,\n" +
      "dias de cobertura, data de ruptura, dias descobertos, e quando houver: limite de\n" +
      "compra, lead time, o que vem a caminho, sugestao de transferencia.\n" +
      enviados.map((i) => `[${i.secao}] ${linhaItem(i)}`).join("\n")
  );

  if (vendas.anomalias.length > 0) {
    blocos.push(
      `ACELERACAO DE VENDA (mes ${vendas.mesAnalisado}, base ${vendas.baseline.join(",")})\n` +
        "Campos: codigo, cliente, grupo, mediana mensal historica, mes atual, fator, excedente\n" +
        vendas.anomalias
          .map(
            (a) =>
              `${a.codigo} ${a.cliente} grupo=${a.grupo ?? "-"}` +
              ` mediana=${n(a.mediana)} atual=${n(a.mesAtual)}` +
              ` fator=${a.fator.toFixed(1)}x excedente=${n(a.excedente)}un`
          )
          .join("\n")
    );
  }

  return { texto: blocos.join("\n\n"), enviados, totalDisponivel: consolidado.length };
}
