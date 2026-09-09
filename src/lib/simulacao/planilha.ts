import ExcelJS from "exceljs";

import type { ResultadoTela } from "@/app/actions/cenario";

/**
 * Monta a planilha do cenário analisado.
 *
 * Separado da rota de propósito: a rota cuida de sessão, entrada e resposta, e
 * esta parte — que é onde mora a formatação inteira — fica testável sem HTTP.
 *
 * Recebe o resultado que a tela já tem em mãos, em vez de refazer a análise:
 * rodar de novo custaria duas chamadas de IA e — pior — o modelo escreveria um
 * texto diferente, então a planilha não bateria com a tela que a originou.
 *
 * O arquivo espelha a ordem da tela (premissa, indicadores, leitura, posições,
 * contingências, cenário recalculado) porque é a ordem da decisão. Formatação
 * não é enfeite aqui: cor e negrito são o que substitui os cards e os badges
 * que a planilha não tem.
 */

/** Paleta do sistema, em ARGB como o ExcelJS espera. */
const COR = {
  petrol: "FF16455C",
  turquesa: "FF7FD9CD",
  turquesaEscuro: "FF0F766E",
  cinzaClaro: "FFF5F5F5",
  vermelho: "FFC00000",
  vermelhoClaro: "FFFCE4E4",
  verde: "FF2E9B7C",
  ambar: "FFB45309",
  ambarClaro: "FFFDF3E3",
  grafite: "FF2B2B2B",
  branco: "FFFFFFFF",
  borda: "FFD9D9D9",
} as const;

const LARGURA_ROTULO = 26;

function titulo(planilha: ExcelJS.Worksheet, texto: string, colunas: number) {
  const linha = planilha.addRow([texto]);
  linha.font = { bold: true, size: 12, color: { argb: COR.branco } };
  linha.getCell(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COR.petrol },
  };
  planilha.mergeCells(linha.number, 1, linha.number, colunas);
  linha.height = 22;
  linha.alignment = { vertical: "middle" };
  return linha;
}

function rotuloValor(planilha: ExcelJS.Worksheet, rotulo: string, valor: string | number) {
  const linha = planilha.addRow([rotulo, valor]);
  linha.getCell(1).font = { bold: true, color: { argb: COR.petrol } };
  return linha;
}

function dataBr(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Soma o que já está colocado para a posição, por origem. */
function somarEntradas(
  entradas: ResultadoTela["criticas"][number]["entradasAbertas"],
  origem: "compra" | "transferencia"
): number {
  return (entradas ?? [])
    .filter((e) => e.origem === origem)
    .reduce((a, e) => a + e.quantidade, 0);
}

/**
 * Teto de colunas de parada. Medido na base: o percurso mais longo tem 4
 * paradas, e a folga cobre uma rota nova sem precisar mexer aqui.
 */
const MAX_PARADAS = 6;

/** CD e data em duas linhas, como o bloco do percurso aparece na tela. */
function celulaParada(cd: string, chegada: string | null): string {
  return `${cd}\n${dataBr(chegada)}`;
}

function descreverAcao(a: ResultadoTela["acoes"][number]): [string, string] {
  if (a.tipo === "transferencia") {
    return ["Transferir", `${a.codigo}: ${a.quantidade} un de ${a.origem} para ${a.destino}`];
  }
  if (a.tipo === "antecipar_entrada") {
    return [
      "Antecipar entrada",
      `${a.codigo ? `${a.codigo}: ` : "Todo o saldo: "}entrada em ${dataBr(a.novaData)}`,
    ];
  }
  return [
    "Compra emergencial",
    `${a.codigo}: ${a.quantidade} un em ${a.destino}, chegando ${dataBr(a.chegada)}`,
  ];
}

function montarResumo(planilha: ExcelJS.Worksheet, r: ResultadoTela) {
  planilha.columns = [
    { width: LARGURA_ROTULO },
    { width: 30 },
    { width: 22 },
    { width: 22 },
  ];

  titulo(planilha, "Cenário simulado", 4);
  rotuloValor(planilha, "Fornecedor", r.fornecedor);
  rotuloValor(planilha, "Data de referência", dataBr(r.dataBase));
  rotuloValor(planilha, "Entrada do saldo na rota", dataBr(r.dataEntrada));
  rotuloValor(planilha, "Saldo a colocar", r.saldoTotal).getCell(2).numFmt = "#,##0";
  rotuloValor(planilha, "Itens com saldo", r.itensComSaldo);

  planilha.addRow([]);
  const perg = planilha.addRow(["Pergunta", r.pergunta]);
  perg.getCell(1).font = { bold: true, color: { argb: COR.petrol } };
  perg.getCell(2).alignment = { wrapText: true, vertical: "top" };
  planilha.mergeCells(perg.number, 2, perg.number, 4);

  const interp = planilha.addRow(["Premissa interpretada", r.interpretacao]);
  interp.getCell(1).font = { bold: true, color: { argb: COR.petrol } };
  interp.getCell(2).alignment = { wrapText: true, vertical: "top" };
  planilha.mergeCells(interp.number, 2, interp.number, 4);
  interp.height = 46;

  planilha.addRow([]);
  titulo(planilha, "Indicadores do cenário", 4);
  const cabIndic = planilha.addRow(["Indicador", "Sem contingência", "Com as ações", "Variação"]);
  cabIndic.font = { bold: true };
  cabIndic.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.cinzaClaro } };
  });

  const indicadores: [string, number, number | null][] = [
    ["Posições que rompem", r.antes.rompem, r.depois?.rompem ?? null],
    ["Dias descobertos", r.antes.diasDescobertos, r.depois?.diasDescobertos ?? null],
    ["Unidades faltando", r.antes.unidadesFaltando, r.depois?.unidadesFaltando ?? null],
    ["Já zeradas hoje", r.antes.jaZeradas, null],
    ["Posições avaliadas", r.antes.posicoesAvaliadas, null],
  ];

  for (const [nome, antes, depois] of indicadores) {
    const linha = planilha.addRow([
      nome,
      antes,
      depois ?? "—",
      depois === null ? "—" : depois - antes,
    ]);
    linha.getCell(2).numFmt = "#,##0";
    if (depois !== null) {
      linha.getCell(3).numFmt = "#,##0";
      linha.getCell(4).numFmt = "+#,##0;-#,##0;0";
      // Verde quando melhora: a leitura do ganho tem de ser instantânea.
      const melhorou = depois < antes;
      linha.getCell(4).font = {
        bold: true,
        color: { argb: melhorou ? COR.verde : COR.vermelho },
      };
    }
  }

  planilha.addRow([]);
  titulo(planilha, "Leitura do cenário", 4);
  const resumo = planilha.addRow([r.resumoIa]);
  resumo.getCell(1).alignment = { wrapText: true, vertical: "top" };
  planilha.mergeCells(resumo.number, 1, resumo.number, 4);
  resumo.height = 100;

  if (r.destaques.length > 0) {
    planilha.addRow([]);
    titulo(planilha, "Pontos mais graves", 4);
    const cab = planilha.addRow(["Item", "CD", "Problema", "Por quê"]);
    cab.font = { bold: true };
    cab.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.cinzaClaro } };
    });
    for (const d of r.destaques) {
      const linha = planilha.addRow([d.codigo, d.filial, d.titulo, d.porque]);
      linha.getCell(1).font = { name: "Consolas" };
      linha.getCell(4).alignment = { wrapText: true, vertical: "top" };
      linha.height = 30;
    }
  }

  planilha.addRow([]);
  titulo(planilha, "Ações de contingência", 4);
  if (r.acoes.length === 0) {
    planilha.addRow(["Nenhuma ação aplicável foi encontrada."]);
  } else {
    const cab = planilha.addRow(["Tipo", "Ação", "Justificativa", ""]);
    cab.font = { bold: true };
    cab.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.cinzaClaro } };
    });
    for (const a of r.acoes) {
      const [tipo, descricao] = descreverAcao(a);
      const linha = planilha.addRow([tipo, descricao, a.justificativa]);
      linha.getCell(1).font = { bold: true, color: { argb: COR.petrol } };
      linha.getCell(3).alignment = { wrapText: true, vertical: "top" };
      planilha.mergeCells(linha.number, 3, linha.number, 4);
      linha.height = 32;
    }
  }

  if (r.ignoradas.length > 0) {
    planilha.addRow([]);
    titulo(planilha, "Ações que não puderam ser aplicadas", 4);
    for (const x of r.ignoradas) {
      const linha = planilha.addRow([x.descricao, x.motivo]);
      linha.getCell(1).font = { color: { argb: COR.ambar } };
      planilha.mergeCells(linha.number, 2, linha.number, 4);
    }
  }
}

function montarPosicoes(planilha: ExcelJS.Worksheet, r: ResultadoTela) {
  // Quantas colunas de parada o recorte realmente exige — sem sobrar coluna
  // vazia numa análise de rota curta.
  const paradas = Math.min(
    MAX_PARADAS,
    Math.max(1, ...r.criticas.map((p) => p.percurso.length))
  );

  planilha.columns = [
    { header: "Situação", key: "grupo", width: 20 },
    { header: "Item", key: "codigo", width: 12 },
    { header: "Descrição", key: "descricao", width: 46 },
    { header: "CD", key: "filial", width: 8 },
    { header: "Estoque chão", key: "chao", width: 14 },
    { header: "Em transferência", key: "transf", width: 16 },
    { header: "Em compra", key: "compra", width: 13 },
    { header: "Consumo/dia", key: "consumo", width: 13 },
    { header: "Rompe em", key: "rompe", width: 12 },
    { header: "Entrada futura", key: "entrada", width: 15 },
    { header: "Chega em", key: "chega", width: 12 },
    { header: "Entradas já colocadas", key: "abertas", width: 42 },
    // Uma coluna por parada, em vez de um texto só: é o que aproxima a planilha
    // do fluxo desenhado na tela, e o que mantém cada data em uma célula
    // própria — filtrável e comparável entre linhas.
    ...Array.from({ length: paradas }, (_, i) => ({
      header: i === 0 ? "Entra em" : `Parada ${i + 1}`,
      key: `parada${i}`,
      width: 14,
    })),
  ];

  const cabecalho = planilha.getRow(1);
  cabecalho.font = { bold: true, color: { argb: COR.branco } };
  cabecalho.height = 24;
  cabecalho.alignment = { vertical: "middle", wrapText: true };
  cabecalho.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.petrol } };
  });

  // Cabeçalho congelado e autofiltro: a lista é longa e serve para trabalhar.
  planilha.views = [{ state: "frozen", ySplit: 1 }];
  const ultimaColuna = planilha.columnCount;
  planilha.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: ultimaColuna },
  };

  const ROTULO_GRUPO = {
    hoje: "Rompida hoje",
    ate_entrada: "Rompe antes da carga",
    depois: "Rompe depois",
  } as const;

  // Mesma ordem da tela: do que exige ação hoje ao que só informa.
  const ordem = { hoje: 0, ate_entrada: 1, depois: 2 } as const;
  const posicoes = [...r.criticas].sort(
    (a, b) =>
      (ordem[a.grupo] ?? 99) - (ordem[b.grupo] ?? 99) ||
      (a.dataRuptura ?? "9999").localeCompare(b.dataRuptura ?? "9999")
  );

  for (const p of posicoes) {
    const linha = planilha.addRow({
      grupo: ROTULO_GRUPO[p.grupo] ?? "—",
      codigo: p.codigo,
      descricao: p.descricao ?? "—",
      filial: p.filial,
      chao: p.estoqueInicial,
      // Somadas da mesma lista que a coluna de detalhe mostra: as duas sempre
      // fecham, sem depender de um total calculado à parte.
      transf: somarEntradas(p.entradasAbertas, "transferencia"),
      compra: somarEntradas(p.entradasAbertas, "compra"),
      consumo: p.consumoDiario,
      rompe: dataBr(p.dataRuptura),
      entrada: p.entradaFutura,
      chega: dataBr(p.chegadaFutura),
      abertas:
        (p.entradasAbertas ?? []).length === 0
          ? "—"
          : p.entradasAbertas
              .map(
                (e) =>
                  `${e.origem === "compra" ? "Compra" : "Transf."} ${e.quantidade} un em ` +
                  `${dataBr(e.chegada)}${e.documento ? ` (${e.documento})` : ""}`
              )
              // Quebra de linha dentro da célula: cada entrada em sua linha,
              // com `wrapText` ligado logo abaixo.
              .join("\n"),
    });

    // Cada parada em sua célula, pintada como na tela: cinza no caminho, âmbar
    // no destino final, que é a informação que o leitor procura primeiro.
    if (p.percurso.length === 0) {
      const c = linha.getCell("parada0");
      c.value = p.aviso === "sem_rota" ? "sem rota cadastrada" : "sem data";
      c.font = { color: { argb: COR.ambar }, size: 9 };
      c.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
    } else {
      p.percurso.slice(0, paradas).forEach((parada, i) => {
        const c = linha.getCell(`parada${i}`);
        c.value = celulaParada(parada.cd, parada.chegada);
        const ehFinal = i === p.percurso.length - 1;
        c.font = { bold: ehFinal, size: 9, color: { argb: ehFinal ? COR.ambar : COR.grafite } };
        c.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
        c.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: ehFinal ? COR.ambarClaro : COR.cinzaClaro },
        };
      });
    }
    linha.height = Math.max(linha.height ?? 15, 30);

    linha.getCell("codigo").font = { name: "Consolas" };
    linha.getCell("chao").numFmt = "#,##0";
    linha.getCell("consumo").numFmt = "#,##0.0";
    // Turquesa e âmbar, as mesmas cores por origem que o sistema usa em todas
    // as telas — a leitura da coluna não depende de ler o cabeçalho.
    for (const [col, cor] of [["transf", COR.turquesaEscuro], ["compra", COR.ambar]] as const) {
      const c = linha.getCell(col);
      c.numFmt = "#,##0;;—";
      c.font = { color: { argb: cor } };
    }
    linha.getCell("entrada").numFmt = "#,##0";
    linha.getCell("rompe").font = { bold: true, color: { argb: COR.vermelho } };
    linha.getCell("abertas").alignment = { wrapText: true, vertical: "top" };
    // Fundo colorido em vez de só texto: é o que mais se aproxima do badge da
    // tela, e faz o grupo saltar sem depender de o leitor ler a palavra.
    const estiloGrupo = {
      hoje: { texto: COR.vermelho, fundo: COR.vermelhoClaro },
      ate_entrada: { texto: COR.ambar, fundo: COR.ambarClaro },
      depois: { texto: COR.petrol, fundo: COR.cinzaClaro },
    }[p.grupo] ?? { texto: COR.petrol, fundo: COR.cinzaClaro };
    linha.getCell("grupo").font = { bold: p.grupo !== "depois", color: { argb: estiloGrupo.texto } };
    linha.getCell("grupo").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: estiloGrupo.fundo },
    };
    linha.getCell("grupo").alignment = { vertical: "middle" };

    // Fundo nas posições já zeradas: são as que exigem ação hoje.
    if (p.estoqueInicial <= 0) {
      for (const col of ["codigo", "descricao", "filial", "chao"]) {
        linha.getCell(col).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: COR.vermelhoClaro },
        };
      }
    }
  }

  planilha.eachRow((linha) => {
    linha.eachCell((c) => {
      c.border = {
        top: { style: "thin", color: { argb: COR.borda } },
        left: { style: "thin", color: { argb: COR.borda } },
        bottom: { style: "thin", color: { argb: COR.borda } },
        right: { style: "thin", color: { argb: COR.borda } },
      };
    });
  });
}


/** Monta o arquivo e devolve o buffer, pronto para download. */
export async function gerarPlanilhaCenario(r: ResultadoTela): Promise<ArrayBuffer> {
  const livro = new ExcelJS.Workbook();
  livro.creator = "DRP_AI";
  livro.created = new Date();

  montarResumo(livro.addWorksheet("Cenário"), r);
  montarPosicoes(livro.addWorksheet("Posições críticas"), r);

  return (await livro.xlsx.writeBuffer()) as ArrayBuffer;
}

/** Nome do arquivo: fornecedor e data bastam para arquivar e comparar depois. */
export function nomeArquivoCenario(r: ResultadoTela): string {
  const forn = r.fornecedor.replace(/[^\w-]+/g, "-").toLowerCase();
  // Hora da exportação no nome: sem ela, dois downloads do mesmo cenário saem
  // com nome idêntico, o navegador salva o segundo como "(1)" e é fácil abrir o
  // antigo achando que é o novo.
  const agora = new Date()
    .toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" })
    .replace(/[: ]/g, "-")
    // Até os segundos: dois downloads no mesmo minuto ainda colidiriam.
    .slice(0, 19);
  return `cenario-${forn}-${r.dataBase}_${agora}.xlsx`;
}
