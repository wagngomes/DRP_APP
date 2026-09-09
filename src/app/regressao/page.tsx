import { carregarVisaoGeral } from "@/lib/visao-geral/consultas";
import { contarCia, contarPorFaixa } from "@/lib/disponibilidade/consultas";
import { carregarFornecedores } from "@/lib/fornecedores/consultas";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { calcularRiscos } from "@/lib/riscos/motor";
import { calcularComprarHoje } from "@/lib/riscos/comprar-hoje";
import { calcularFollowup } from "@/lib/riscos/followup";
import { calcularTransferencias } from "@/lib/riscos/transferencia";
import { carregarSla } from "@/lib/transferencias/consultas";
import { validarAnalise } from "@/lib/ia/schema";
import { consolidar } from "@/lib/riscos/consolidar";
import { ORDEM_SECOES } from "@/lib/riscos/tipos";
import { calcularAnomaliasVenda } from "@/lib/riscos/vendas";
import { IMPORT_MODELS } from "@/lib/imports/config";
import { simuladorPorCd } from "@/utils/cds-virtuais";
import { COLUNAS_ESTOQUE_CHAO, COLUNAS_VENDIDO_M0, somaSql } from "@/utils/dias-estoque";

export const dynamic = "force-dynamic";

// Data com forecast disponível. A regra do snapshot mensal usa o mais recente
// que não seja posterior à referência, então uma data anterior à primeira carga
// do mês devolve zero posições — corretamente.
const DATA = "2026-09-02";
const PARAMS = { diasTransferencias: 5, diasPedidos: 5 };
const COBERTURAS = { critico: 20, gatilho: 10, alvo: 30 };

/**
 * Rede de regressão: os números validados ao longo da construção do sistema.
 *
 * Rodada antes e depois de cada fase da feature de riscos. Qualquer valor que se
 * mexa sem uma mudança de regra deliberada significa que algo quebrou.
 */
export default async function Regressao() {
  // Ferramenta de diagnóstico: existe só em desenvolvimento. Gate por ambiente e
  // não por sessão, porque quem a consome é o processo de verificação, não o
  // usuário logado.
  if (process.env.NODE_ENV === "production") notFound();

  const CHAO = somaSql(COLUNAS_ESTOQUE_CHAO, "s");
  const VEND = somaSql(COLUNAS_VENDIDO_M0, "s");

  const [vg, faixas, cia, forn, conserva, risco] = await Promise.all([
    carregarVisaoGeral(DATA),
    contarPorFaixa(DATA),
    contarCia(DATA),
    carregarFornecedores(DATA, PARAMS),
    prisma.$queryRawUnsafe<{ chao: number; vend: number }[]>(
      `SELECT SUM(${CHAO})::float8 AS chao, SUM(${VEND})::float8 AS vend
         FROM ${simuladorPorCd("s.data_snapshot = $1::date")} s
        WHERE s.data_snapshot = $1::date`,
      DATA
    ),
    calcularRiscos(DATA, PARAMS, COBERTURAS),
  ]);

  const compra = await calcularComprarHoje(DATA, risco.posicoes, COBERTURAS.critico);
  const followup = calcularFollowup(risco.posicoes);
  const transf = calcularTransferencias(
    risco.posicoes,
    COBERTURAS,
    await carregarSla(),
    new Date(`${DATA}T00:00:00.000Z`)
  );
  const consolidado = consolidar(risco, compra, followup, transf);
  const vendas = await calcularAnomaliasVenda(20);

  const cat = (c: string) => forn.posicoes.filter((p) => p.categoria === c).length;
  const soma = (l: { itens: number }[]) => l.reduce((a, c) => a + c.itens, 0);
  const zerada = faixas.filter((f) => f.faixa === "zero").reduce((a, c) => a + c.itens, 0);

  // Cia tem de bater com a soma dos CDs, faixa a faixa.
  const divergentes = [...new Set(faixas.map((f) => f.faixa))].filter(
    (fx) =>
      faixas.filter((c) => c.faixa === fx).reduce((a, c) => a + c.itens, 0) !==
      cia.filter((c) => c.faixa === fx).reduce((a, c) => a + c.itens, 0)
  ).length;

  const linhas: [string, string | number][] = [
    ["posicoes validas (disponibilidade)", soma(faixas)],
    ["faixa zerada", zerada],
    ["rupturas (fornecedores)", forn.posicoes.length],
    ["zerada == rupturas", String(zerada === forn.posicoes.length)],
    ["cat: compra", cat("compra")],
    ["cat: transferencia", cat("transferencia")],
    ["cat: a_comprar", cat("a_comprar")],
    ["cat: sem_cobertura", cat("sem_cobertura")],
    ["cia total", soma(cia)],
    ["cia == soma dos CDs (faixas divergentes)", divergentes],
    ["conservacao: chao", conserva[0].chao.toFixed(2)],
    ["conservacao: vendido", conserva[0].vend.toFixed(0)],
    ["visao geral: CDs", vg.totaisPorCd.length],
    [
      "visao geral: estoque total",
      Math.round(vg.totaisPorCd.reduce((a, c) => a + c.estoque, 0)),
    ],
    ["--- motor de risco ---", ""],
    ["posicoes avaliadas", risco.posicoes.length],
    ["== disponibilidade", String(risco.posicoes.length === soma(faixas))],
    ["sev: rompido", risco.totais.rompido],
    ["== faixa zerada", String(risco.totais.rompido === zerada)],
    ["sev: vai_romper", risco.totais.vai_romper],
    ["sev: no_limite", risco.totais.no_limite],
    ["sev: ok", risco.totais.ok],
    [
      "coerencia: no_limite sem descoberto",
      String(
        risco.posicoes
          .filter((p) => p.severidade === "no_limite")
          .every((p) => p.diasDescobertos === 0)
      ),
    ],
    [
      "coerencia: rompido sempre com chao 0",
      String(
        risco.posicoes
          .filter((p) => p.severidade === "rompido")
          .every((p) => p.estoqueChao <= 0)
      ),
    ],
    [
      "com reposicao a caminho",
      risco.posicoes.filter((p) => p.primeiraChegada !== null).length,
    ],
    ["soma das severidades == avaliadas", String(
      risco.totais.rompido + risco.totais.vai_romper + risco.totais.no_limite +
      risco.totais.ok === risco.posicoes.length
    )],
    ["--- comprar hoje ---", ""],
    ["atrasado", compra.totais.atrasado],
    ["comprar hoje", compra.totais.comprar_hoje],
    ["proximo (dentro do critico)", compra.totais.proximo],
    ["ok", compra.totais.ok],
    ["sem dados", compra.totais.sem_dados],
    ["soma == avaliadas", String(
      Object.values(compra.totais).reduce((a, b) => a + b, 0) === risco.posicoes.length
    )],
    ["lacuna: sem rota", compra.lacunas.sem_rota],
    ["lacuna: sem lead time", compra.lacunas.sem_lead_time],
    ["lacuna: sem SLA na rota", compra.lacunas.sem_sla_na_rota],
    [
      "coerencia: limite <= ruptura sempre",
      String(
        compra.itens
          .filter((i) => i.dataLimite && i.posicao.dataRuptura)
          .every((i) => i.dataLimite! <= i.posicao.dataRuptura!)
      ),
    ],
    ["--- exemplos: comprar ja ---", ""],
    ...compra.itens
      .filter((i) => i.urgencia === "atrasado" || i.urgencia === "comprar_hoje")
      .sort((a, b) => (a.diasAteLimite ?? 0) - (b.diasAteLimite ?? 0))
      .slice(0, 5)
      .map((i): [string, string] => [
        `  ${i.posicao.codigo} CD ${i.posicao.filial}`,
        `${i.posicao.fornecedor.slice(0, 18)} | LT ${i.leadTime}d + SLA ${i.slaInterno}du` +
          ` | rompe ${i.posicao.dataRuptura!.toISOString().slice(5, 10)}` +
          ` | limite ${i.dataLimite!.toISOString().slice(5, 10)}` +
          ` (${Math.round(i.diasAteLimite!)}d)`,
      ]),
    ["--- follow-up ---", `${followup.itens.length} reposicoes a cobrar`],
    ["urgente (rompido + atrasada)", followup.totais.urgente],
    ["recomendada", followup.totais.recomendada],
    ["alerta", followup.totais.alerta],
    ...followup.itens.slice(0, 3).map((i): [string, string] => [
      `  ${i.posicao.codigo} CD ${i.posicao.filial}`,
      `${i.reposicao.origem} ${i.reposicao.documento ?? "-"}` +
        ` | ${i.diasDescobertos.toFixed(0)}d descobertos` +
        ` | impacto ${i.impacto.toFixed(0)} un${i.atrasada ? " | ATRASADA" : ""}`,
    ]),
    ["--- sugestao de transferencia ---", `${transf.sugestoes.length} sugestoes`],
    ["  tipo ponte", transf.sugestoes.filter((s) => s.tipo === "ponte").length],
    ["  tipo reposicao", transf.sugestoes.filter((s) => s.tipo === "reposicao").length],
    ["descartada: reposicao chega a tempo", transf.descartadas.reposicao_chega_a_tempo],
    ["descartada: chegaria depois", transf.descartadas.sugestao_chegaria_depois],
    ["descartada: sem origem", transf.descartadas.sem_origem_disponivel],
    [
      "INVARIANTE origem fica >= alvo",
      String(transf.sugestoes.every((s) => s.origemDepois >= COBERTURAS.alvo - 0.01)),
    ],
    [
      "INVARIANTE ponte chega antes do que vem",
      String(
        transf.sugestoes
          .filter((s) => s.tipo === "ponte")
          .every((s) => s.chegada < s.posicao.primeiraChegada!.chegada)
      ),
    ],
    [
      "INVARIANTE quantidade > 0",
      String(transf.sugestoes.every((s) => s.quantidade > 0)),
    ],
    ...transf.sugestoes.slice(0, 4).map((s): [string, string] => [
      `  ${s.posicao.codigo} ${s.origem}->${s.posicao.filial}`,
      `${s.tipo} | ${s.quantidade.toFixed(0)} un = ${s.diasCobertos.toFixed(1)}d` +
        ` | SLA ${s.sla}du chega ${s.chegada.toISOString().slice(5, 10)}` +
        ` | origem fica com ${s.origemDepois.toFixed(0)}d`,
    ]),
    ["--- consolidado ---", `${consolidado.length} itens`],
    ...ORDEM_SECOES.map((s): [string, string] => [
      `  ${s}`,
      String(consolidado.filter((i) => i.secao === s).length),
    ]),
    [
      "  sem duplicata (codigo|filial)",
      String(
        new Set(consolidado.map((i) => `${i.codigo}|${i.filial}`)).size === consolidado.length
      ),
    ],
    [
      "  ordenado por secao e peso",
      String(
        consolidado.every((i, n) => {
          if (n === 0) return true;
          const ant = consolidado[n - 1];
          const oa = ORDEM_SECOES.indexOf(ant.secao);
          const ob = ORDEM_SECOES.indexOf(i.secao);
          return oa < ob || (oa === ob && ant.peso >= i.peso);
        })
      ),
    ],
    ...consolidado.slice(0, 4).map((i): [string, string] => [
      `  ${i.secao} ${i.codigo} CD ${i.filial}`,
      `${i.destaque} | peso ${Math.round(i.peso)} un | ${i.tipo}`,
    ]),
    ["--- anomalias de venda ---", `mes ${vendas.mesAnalisado}`],
    ["  baseline", vendas.baseline.join(" ")],
    ["  anomalias encontradas", vendas.anomalias.length],
    ["  sem grupo cadastrado", vendas.semGrupo],
    ...vendas.anomalias.slice(0, 5).map((a): [string, string] => [
      `  ${a.codigo} ${a.cliente.slice(0, 26)}`,
      `mediana ${a.mediana.toFixed(0)}/mes -> ${a.mesAtual.toFixed(0)}` +
        ` (${a.fator.toFixed(1)}x, +${a.excedente.toFixed(0)} un)` +
        ` | grupo ${a.grupo ?? "-"}`,
    ]),
    ["--- validacao da saida da IA ---", ""],
    ...(() => {
      const esperadas = new Map<string, "urgente" | "recomendada" | "alerta" | "aviso">([
        ["111|1006", "urgente"],
        ["222|1002", "alerta"],
      ]);
      const item = (codigo: string, filial: string, secao: string) => ({
        codigo, filial, secao, titulo: "t", justificativa: "j", acao: "a",
      });

      // 1. Modelo tenta promover um item de alerta para urgente.
      const promocao = validarAnalise(
        { briefing: "b", itens: [item("222", "1002", "urgente")], temas: [] },
        esperadas
      );
      // 2. Modelo inventa um SKU que nao estava no dossie.
      const alucinado = validarAnalise(
        { briefing: "b", itens: [item("999", "1006", "urgente")], temas: [] },
        esperadas
      );
      // 3. Resposta fora do schema.
      const invalida = validarAnalise({ itens: "isto nao e lista" }, esperadas);
      // 4. Tema citando codigo inexistente.
      const tema = validarAnalise(
        { briefing: "b", itens: [], temas: [{ titulo: "t", resumo: "r", codigos: ["111", "999"] }] },
        esperadas
      );

      return [
        [
          "  secao promovida e corrigida",
          String(promocao.ok && promocao.analise.itens[0].secao === "alerta"),
        ],
        [
          "  SKU inexistente descartado",
          String(alucinado.ok && alucinado.analise.itens.length === 0 && alucinado.descartados === 1),
        ],
        ["  resposta fora do schema rejeitada", String(!invalida.ok)],
        [
          "  codigo invalido some do tema",
          String(tema.ok && tema.analise.temas[0].codigos.join() === "111"),
        ],
      ] as [string, string][];
    })(),
    ["--- guias de import ---", `${IMPORT_MODELS.length} tabelas`],
    [
      "  delegate leadTimeFornecedor existe",
      String(typeof prisma.leadTimeFornecedor?.findMany === "function"),
    ],
    ["  linhas na tabela", await prisma.leadTimeFornecedor.count()],
    ...IMPORT_MODELS.filter((m) => m.key === "lead_time_fornecedor").map(
      (m): [string, string] => [
        `  ${m.label}`,
        `delegate ${m.delegate} · colunas: ${m.columns.map((c) => c.field).join(", ")}` +
          ` · ${m.idField ? "upsert" : "substitui"}`,
      ]
    ),
    ["--- exemplos de vai_romper ---", ""],
    ...risco.posicoes
      .filter((p) => p.severidade === "vai_romper" && p.primeiraChegada)
      .sort((a, b) => b.diasDescobertos - a.diasDescobertos)
      .slice(0, 5)
      .map((p): [string, string] => [
        `  ${p.codigo} CD ${p.filial}`,
        `chao ${p.estoqueChao.toFixed(0)} un = ${p.diasChao!.toFixed(1)}d` +
          ` | ${p.primeiraChegada!.origem} chega em ${p.diasAteChegada!.toFixed(0)}d` +
          ` | ${p.diasDescobertos.toFixed(0)}d descobertos`,
      ]),
    ["--- exemplos sem reposicao ---", ""],
    ...risco.posicoes
      .filter((p) => p.severidade === "vai_romper" && !p.primeiraChegada)
      .sort((a, b) => b.diasDescobertos - a.diasDescobertos)
      .slice(0, 3)
      .map((p): [string, string] => [
        `  ${p.codigo} CD ${p.filial}`,
        `chao ${p.estoqueChao.toFixed(0)} un = ${p.diasChao!.toFixed(1)}d` +
          ` | nada a caminho | ${p.diasDescobertos.toFixed(0)}d descobertos`,
      ]),
  ];

  return (
    <pre id="regressao" style={{ fontFamily: "monospace", fontSize: 13, padding: 16 }}>
      {linhas.map(([k, v]) => `${k.padEnd(42)} ${v}`).join("\n")}
    </pre>
  );
}
