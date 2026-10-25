import ExcelJS from "exceljs";

/**
 * A planilha do detalhe de um trecho de triangulação.
 *
 * Separada da rota de propósito, como a do cenário: a rota cuida de sessão,
 * entrada e resposta, e a formatação — que é quase tudo — fica testável sem
 * HTTP.
 *
 * **Recebe as linhas que a tela já tem**, em vez de refazer a consulta. Duas
 * razões: `carregarTriangulacoes` leva 1,5 a 2,6s e carrega o dia inteiro para
 * devolver um trecho, e, pior, a projeção depende da data de referência e dos
 * parâmetros de dias para vencidas — refazê-la poderia produzir datas
 * diferentes das que a pessoa viu ao clicar.
 *
 * O arquivo espelha a tabela da tela, na mesma ordem, com três acréscimos que
 * a tela mostra como desenho e a planilha não tem como: a rota por extenso, o
 * fornecedor e a origem do documento. Em compensação, nada de cor por si só —
 * o que a tela diz com âmbar ("reprojetada") aqui vira coluna com texto, que é
 * o que sobrevive a um filtro de Excel.
 */

/** Paleta do sistema, em ARGB como o ExcelJS espera. */
const COR = {
  petrol: "FF16455C",
  cinzaClaro: "FFF5F5F5",
  ambar: "FFB45309",
  branco: "FFFFFFFF",
  borda: "FFD9D9D9",
} as const;

/** Uma linha da tabela, como a tela a monta. */
export type LinhaPlanilhaTrecho = {
  codigo: string;
  descricao: string | null;
  fornecedor: string;
  origem: "compra" | "transferencia";
  documento: string | null;
  statusLogistica: string | null;
  quantidade: number;
  valor: number;
  /** ISO; a serialização para JSON já entrega assim. */
  chegadaNoTrecho: string | null;
  reprojetada: boolean;
  agendamentoData: string | null;
  agendamentoRotulo: string | null;
  rota: string | null;
  cdFinal: string | null;
  chegadaFinal: string | null;
};

export type DadosPlanilhaTrecho = {
  /** Siglas, como a tela mostra — "ES → CAJ". */
  de: string;
  para: string;
  /** Data de referência do sistema, para a planilha dizer de quando ela é. */
  referencia: string;
  linhas: LinhaPlanilhaTrecho[];
};

const CABECALHO = [
  { titulo: "Código", largura: 12 },
  { titulo: "Produto", largura: 46 },
  { titulo: "Fornecedor", largura: 22 },
  { titulo: "Origem", largura: 14 },
  { titulo: "Documento", largura: 14 },
  { titulo: "Status logístico", largura: 22 },
  { titulo: "Qtde", largura: 10 },
  { titulo: "Valor", largura: 16 },
  { titulo: "Chega aqui", largura: 13 },
  { titulo: "Projeção", largura: 13 },
  { titulo: "Agendamento", largura: 18 },
  { titulo: "Rota", largura: 26 },
  { titulo: "Destino final", largura: 13 },
  { titulo: "Chega no destino", largura: 16 },
] as const;

/**
 * Data ISO para `Date`, ou nulo.
 *
 * Como `Date` e não texto: no Excel, data de verdade ordena e filtra por
 * período; texto ordena alfabeticamente, e "02/11" vem antes de "26/10".
 */
function data(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function gerarPlanilhaTrecho(
  dados: DadosPlanilhaTrecho,
): Promise<Buffer> {
  const livro = new ExcelJS.Workbook();
  livro.creator = "DRP_AI";
  livro.created = new Date();

  const planilha = livro.addWorksheet(`${dados.de} para ${dados.para}`, {
    views: [{ state: "frozen", ySplit: 3 }],
  });

  // Duas linhas de contexto antes da tabela. A planilha sai do sistema e vai
  // para um e-mail ou um anexo — sem elas, ninguém sabe de que trecho e de que
  // dia ela é.
  const titulo = planilha.addRow([`Triangulações · ${dados.de} → ${dados.para}`]);
  titulo.font = { bold: true, size: 13, color: { argb: COR.petrol } };
  planilha.addRow([
    `Data de referência: ${dados.referencia} · ${dados.linhas.length} documento(s)`,
  ]).font = { size: 10, color: { argb: COR.ambar } };

  const cabecalho = planilha.addRow(CABECALHO.map((c) => c.titulo));
  cabecalho.font = { bold: true, color: { argb: COR.branco } };
  cabecalho.eachCell((celula) => {
    celula.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COR.petrol },
    };
    celula.alignment = { vertical: "middle", wrapText: true };
  });
  planilha.columns = CABECALHO.map((c) => ({ width: c.largura }));

  for (const l of dados.linhas) {
    planilha.addRow([
      l.codigo,
      l.descricao ?? "",
      l.fornecedor,
      l.origem === "compra" ? "Pedido de compra" : "Transferência",
      l.documento ?? "",
      l.statusLogistica ?? "",
      l.quantidade,
      l.valor,
      data(l.chegadaNoTrecho),
      // O que a tela diz em âmbar vira texto: cor não sobrevive a um filtro.
      l.reprojetada ? "reprojetada" : "",
      l.agendamentoData
        ? `agendado ${l.agendamentoData.slice(0, 10)}`
        : (l.agendamentoRotulo ?? ""),
      l.rota ?? "",
      l.cdFinal ?? "",
      data(l.chegadaFinal),
    ]);
  }

  // Formato por coluna, depois das linhas: aplicar célula a célula no laço
  // custaria uma passada a mais sobre tudo.
  planilha.getColumn(7).numFmt = "#,##0";
  planilha.getColumn(8).numFmt = 'R$ #,##0.00';
  planilha.getColumn(9).numFmt = "dd/mm/yyyy";
  planilha.getColumn(14).numFmt = "dd/mm/yyyy";

  // Zebra e borda: a tabela tem catorze colunas, e sem a faixa o olho perde a
  // linha no meio do caminho.
  planilha.eachRow((linha, numero) => {
    if (numero <= 3) return;
    if (numero % 2 === 0) {
      linha.eachCell((celula) => {
        celula.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: COR.cinzaClaro },
        };
      });
    }
    linha.eachCell((celula) => {
      celula.border = {
        bottom: { style: "thin", color: { argb: COR.borda } },
      };
    });
  });

  // Autofiltro sobre o cabeçalho: é a primeira coisa que alguém faz com uma
  // tabela destas no Excel.
  planilha.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: CABECALHO.length },
  };

  const buffer = await livro.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Nome do arquivo: trecho e data, para não virar "planilha (3).xlsx". */
export function nomeArquivoTrecho(dados: DadosPlanilhaTrecho): string {
  const limpo = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, "-");
  return `triangulacoes-${limpo(dados.de)}-para-${limpo(dados.para)}-${dados.referencia}.xlsx`;
}
