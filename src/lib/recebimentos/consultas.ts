/**
 * Recebimentos por fornecedor e dia.
 *
 * A pergunta da tela é "quando entrou o quê, de quem" — por isso a grade tem um
 * dia por coluna em vez de um total mensal. Concentração num dia, semana sem
 * entrada e o padrão de cada laboratório só aparecem nessa forma.
 *
 * O fornecedor sai de `nome_marca_cadastro`, o nome cru da marca, normalizado
 * pela tabela `fornecedores` como em todas as outras telas. `nome_grupo_marca`
 * parecia o caminho mais direto e não é: ele mistura grupo de fornecedor
 * ("3M") com categoria de produto ("LUVA PROCEDIMENTO"), e recebimentos de
 * MEDIX e EMBRAST acabariam somados sob SUPERMAX por causa de uma linha de
 * cadastro que mapeia aquela categoria.
 */
import { prisma } from "@/lib/prisma";
import { joinFornecedor, nomeFornecedor } from "@/lib/fornecedor";

/** Coluna de `recebimento` que guarda o nome cru da marca. */
const COLUNA_MARCA = "nome_marca_cadastro";

export type CelulaDia = {
  dia: number;
  valor: number;
  quantidade: number;
};

export type LinhaFornecedor = {
  fornecedor: string;
  dias: CelulaDia[];
  total: number;
  quantidadeTotal: number;
  /** Quantos produtos distintos entraram no mês — o que o segundo nível abre. */
  produtos: number;
};

export type LinhaProduto = {
  codigo: string;
  descricao: string | null;
  dias: CelulaDia[];
  total: number;
  quantidadeTotal: number;
};

/** Meses com recebimento na base, do mais recente para o mais antigo. */
export async function listarMeses(): Promise<string[]> {
  const linhas = await prisma.$queryRawUnsafe<{ mes: string }[]>(
    `SELECT DISTINCT to_char(data, 'YYYY-MM') AS mes
       FROM recebimento
      WHERE data IS NOT NULL
      ORDER BY 1 DESC`
  );
  return linhas.map((l) => l.mes);
}

/** Primeiro dia do mês e do seguinte, para o recorte com índice. */
function limites(mes: string): [string, string] {
  const [ano, m] = mes.split("-").map(Number);
  return [
    new Date(Date.UTC(ano, m - 1, 1)).toISOString().slice(0, 10),
    new Date(Date.UTC(ano, m, 1)).toISOString().slice(0, 10),
  ];
}

/** Quantos dias tem o mês — define quantas colunas a grade desenha. */
export function diasDoMes(mes: string): number {
  const [ano, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(ano, m, 0)).getUTCDate();
}

function agrupar<T extends { dia: number; valor: number; quantidade: number }>(
  linhas: T[]
): { dias: CelulaDia[]; total: number; quantidadeTotal: number } {
  const dias = linhas
    .map((l) => ({ dia: l.dia, valor: l.valor, quantidade: l.quantidade }))
    .sort((a, b) => a.dia - b.dia);
  return {
    dias,
    total: dias.reduce((a, d) => a + d.valor, 0),
    quantidadeTotal: dias.reduce((a, d) => a + d.quantidade, 0),
  };
}

/**
 * A grade do mês: um fornecedor por linha, um dia por coluna.
 *
 * Ordenada pelo total do mês — quem mais entregou aparece primeiro, que é a
 * ordem em que se procura alguma coisa aqui.
 */
export async function carregarRecebimentos(mes: string): Promise<LinhaFornecedor[]> {
  const [inicio, fim] = limites(mes);

  const linhas = await prisma.$queryRawUnsafe<
    { fornecedor: string; dia: number; valor: number; quantidade: number; produtos: number }[]
  >(
    `SELECT ${nomeFornecedor("r", COLUNA_MARCA)} AS fornecedor,
            EXTRACT(day FROM r.data)::int          AS dia,
            COALESCE(SUM(r.valor_total), 0)::float8 AS valor,
            COALESCE(SUM(r.quantidade), 0)::float8  AS quantidade,
            COUNT(DISTINCT r.codigo)::int           AS produtos
       FROM recebimento r
       ${joinFornecedor("r", COLUNA_MARCA)}
      WHERE r.data >= $1::date AND r.data < $2::date
      GROUP BY 1, 2`,
    inicio,
    fim
  );

  const porFornecedor = new Map<string, typeof linhas>();
  for (const l of linhas) {
    porFornecedor.set(l.fornecedor, [...(porFornecedor.get(l.fornecedor) ?? []), l]);
  }

  return [...porFornecedor.entries()]
    .map(([fornecedor, dias]) => ({
      fornecedor,
      ...agrupar(dias),
      // `produtos` vem por dia; o distinto do mês exige outra passada e não
      // vale a consulta — o número aqui é o teto, e a lista aberta traz o real.
      produtos: Math.max(...dias.map((d) => d.produtos)),
    }))
    .sort((a, b) => b.total - a.total || a.fornecedor.localeCompare(b.fornecedor, "pt-BR"));
}

/**
 * Segundo nível: os produtos de um fornecedor, na mesma grade de dias.
 *
 * Carregado sob demanda, e não junto com a grade principal. São 6.799 células
 * produto × dia no mês inteiro contra 933 de fornecedor × dia — mandar tudo
 * para o navegador só para o caso de alguém abrir uma linha seria pagar sete
 * vezes o peso por antecipação.
 */
export async function carregarProdutos(
  mes: string,
  fornecedor: string
): Promise<LinhaProduto[]> {
  const [inicio, fim] = limites(mes);

  const linhas = await prisma.$queryRawUnsafe<
    { codigo: string; descricao: string | null; dia: number; valor: number; quantidade: number }[]
  >(
    `SELECT COALESCE(r.codigo, '—')        AS codigo,
            MIN(p.descricao)               AS descricao,
            EXTRACT(day FROM r.data)::int  AS dia,
            COALESCE(SUM(r.valor_total), 0)::float8 AS valor,
            COALESCE(SUM(r.quantidade), 0)::float8  AS quantidade
       FROM recebimento r
       ${joinFornecedor("r", COLUNA_MARCA)}
       LEFT JOIN produtos p ON p.codigo = r.codigo
      WHERE r.data >= $1::date AND r.data < $2::date
        AND ${nomeFornecedor("r", COLUNA_MARCA)} = $3
      GROUP BY 1, 3`,
    inicio,
    fim,
    fornecedor
  );

  const porProduto = new Map<string, typeof linhas>();
  for (const l of linhas) {
    porProduto.set(l.codigo, [...(porProduto.get(l.codigo) ?? []), l]);
  }

  return [...porProduto.entries()]
    .map(([codigo, dias]) => ({
      codigo,
      descricao: dias.find((d) => d.descricao)?.descricao ?? null,
      ...agrupar(dias),
    }))
    .sort((a, b) => b.total - a.total || a.codigo.localeCompare(b.codigo));
}
