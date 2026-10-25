import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import {
  gerarPlanilhaTrecho,
  nomeArquivoTrecho,
  type DadosPlanilhaTrecho,
  type LinhaPlanilhaTrecho,
} from "@/lib/triangulacoes/planilha";

/**
 * A planilha do trecho.
 *
 * O teste gera o arquivo e **lê de volta** com o próprio ExcelJS, em vez de
 * conferir só que o buffer não está vazio: o que quebra numa planilha é a
 * coluna trocada e a data que vira texto, e nenhuma das duas aparece no
 * tamanho do arquivo.
 */
const linha = (over: Partial<LinhaPlanilhaTrecho> = {}): LinhaPlanilhaTrecho => ({
  codigo: "147207",
  descricao: "CALQUENCE 100MG CX 60CPR ASTRAZENECA",
  fornecedor: "ASTRAZENECA",
  origem: "compra",
  documento: "21239",
  statusLogistica: "S/AGENDAMENTO",
  quantidade: 62,
  valor: 1738783,
  chegadaNoTrecho: "2026-10-26T00:00:00.000Z",
  reprojetada: false,
  agendamentoData: null,
  agendamentoRotulo: "S/AGENDAMENTO",
  rota: "DF2 > VAL > CAJ",
  cdFinal: "CAJ",
  chegadaFinal: "2026-10-28T00:00:00.000Z",
  ...over,
});

const dados = (over: Partial<DadosPlanilhaTrecho> = {}): DadosPlanilhaTrecho => ({
  de: "DF2",
  para: "VAL",
  referencia: "2026-10-25",
  linhas: [linha()],
  ...over,
});

async function abrir(d: DadosPlanilhaTrecho) {
  const buffer = await gerarPlanilhaTrecho(d);
  const livro = new ExcelJS.Workbook();
  await livro.xlsx.load(buffer as unknown as ArrayBuffer);
  return livro.worksheets[0];
}

describe("gerarPlanilhaTrecho", () => {
  it("gera um arquivo que o Excel consegue abrir, com uma linha por documento", async () => {
    const planilha = await abrir(
      dados({ linhas: [linha(), linha({ codigo: "136176" })] }),
    );
    // Duas de contexto, uma de cabeçalho, duas de dados.
    expect(planilha.rowCount).toBe(5);
  });

  it("o cabeçalho tem as catorze colunas, na ordem da tela", async () => {
    const planilha = await abrir(dados());
    const cabecalho = planilha.getRow(3).values as unknown[];
    expect(cabecalho.slice(1)).toEqual([
      "Código",
      "Produto",
      "Fornecedor",
      "Origem",
      "Documento",
      "Status logístico",
      "Qtde",
      "Valor",
      "Chega aqui",
      "Projeção",
      "Agendamento",
      "Rota",
      "Destino final",
      "Chega no destino",
    ]);
  });

  /**
   * O erro que o tamanho do arquivo não denuncia: data como texto ordena
   * alfabeticamente, e "02/11" viria antes de "26/10".
   */
  it("as datas saem como data, não como texto", async () => {
    const planilha = await abrir(dados());
    const l = planilha.getRow(4);
    expect(l.getCell(9).value).toBeInstanceOf(Date);
    expect(l.getCell(14).value).toBeInstanceOf(Date);
    expect(planilha.getColumn(9).numFmt).toBe("dd/mm/yyyy");
  });

  it("quantidade e valor saem como número, para somar no Excel", async () => {
    const planilha = await abrir(dados());
    const l = planilha.getRow(4);
    expect(l.getCell(7).value).toBe(62);
    expect(l.getCell(8).value).toBe(1738783);
  });

  it("a origem vira texto legível, não o código interno", async () => {
    const compra = await abrir(dados());
    expect(compra.getRow(4).getCell(4).value).toBe("Pedido de compra");

    const transf = await abrir(
      dados({ linhas: [linha({ origem: "transferencia" })] }),
    );
    expect(transf.getRow(4).getCell(4).value).toBe("Transferência");
  });

  /** Na tela isso é um texto âmbar; cor não sobrevive a um filtro de Excel. */
  it("a reprojeção vira coluna com texto", async () => {
    const sim = await abrir(dados({ linhas: [linha({ reprojetada: true })] }));
    expect(sim.getRow(4).getCell(10).value).toBe("reprojetada");

    const nao = await abrir(dados());
    expect(nao.getRow(4).getCell(10).value ?? "").toBe("");
  });

  it("agendamento com data ganha a data; sem data, o motivo", async () => {
    const comData = await abrir(
      dados({
        linhas: [linha({ agendamentoData: "2026-10-27T00:00:00.000Z" })],
      }),
    );
    expect(comData.getRow(4).getCell(11).value).toBe("agendado 2026-10-27");

    const semData = await abrir(dados());
    expect(semData.getRow(4).getCell(11).value).toBe("S/AGENDAMENTO");
  });

  it("campo nulo vira célula vazia, e não a palavra null", async () => {
    const planilha = await abrir(
      dados({
        linhas: [
          linha({
            descricao: null,
            documento: null,
            statusLogistica: null,
            rota: null,
            cdFinal: null,
            chegadaNoTrecho: null,
            chegadaFinal: null,
            agendamentoRotulo: null,
          }),
        ],
      }),
    );
    const l = planilha.getRow(4);
    for (const coluna of [2, 5, 6, 11, 12, 13]) {
      expect(l.getCell(coluna).value ?? "").toBe("");
    }
    expect(l.getCell(9).value).toBeNull();
  });

  it("data inválida não derruba a geração", async () => {
    const planilha = await abrir(
      dados({ linhas: [linha({ chegadaNoTrecho: "nao-e-data" })] }),
    );
    expect(planilha.getRow(4).getCell(9).value).toBeNull();
  });

  it("sem linha nenhuma ainda gera o arquivo, só com o cabeçalho", async () => {
    const planilha = await abrir(dados({ linhas: [] }));
    expect(planilha.rowCount).toBe(3);
  });
});

describe("nomeArquivoTrecho", () => {
  it("usa trecho e data, para não virar planilha (3).xlsx", () => {
    expect(nomeArquivoTrecho(dados())).toBe(
      "triangulacoes-DF2-para-VAL-2026-10-25.xlsx",
    );
  });

  it("sigla com espaço ou acento não quebra o nome do arquivo", () => {
    expect(
      nomeArquivoTrecho(dados({ de: "VAREJO SC", para: "SÃO PAULO" })),
    ).toBe("triangulacoes-VAREJO-SC-para-SÃO-PAULO-2026-10-25.xlsx");
  });
});
