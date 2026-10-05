import { prisma } from "@/lib/prisma";
import { joinFornecedor, nomeFornecedor } from "@/lib/fornecedor";

/**
 * Colocação de pedidos de compra, dia a dia.
 *
 * Mesma leitura da tela de recebimentos — fornecedor no primeiro nível, produto
 * no segundo, dias nas colunas —, mas olhando a ponta oposta do ciclo: lá é o
 * que chegou, aqui é o que foi pedido.
 *
 * **O problema que esta tela precisa resolver é a contagem dupla.** A base de
 * pedidos é cumulativa: o mesmo pedido reaparece em toda carga diária enquanto
 * estiver aberto — média de 4 aparições, máximo de 183 — e o saldo muda quando
 * há entrega parcial ou reprogramação. Somar as linhas como estão infla setembro
 * de R$ 526 milhões para R$ 1,7 bilhão.
 *
 * A regra é **a primeira aparição de cada (pedido, item)**: o valor como foi
 * colocado, antes de qualquer entrega reduzi-lo. Usar a última aparição
 * responderia "o que ainda falta chegar", que é a pergunta de outra tela.
 *
 * Dentro dessa primeira carga as linhas são somadas, não escolhidas: um pedido
 * pode nascer já parcelado em duas entregas, e as duas fazem parte do que foi
 * colocado. Hoje isso acontece em um par de 8.437, mas somar é o que continua
 * certo quando virarem cem.
 */

/** Chave do par e a carga em que ele apareceu pela primeira vez. */
const PRIMEIRA_APARICAO = `
  SELECT num_pedido, codigo, MIN(data_snapshot) AS snap
    FROM pedidos_de_compra
   WHERE num_pedido IS NOT NULL AND codigo IS NOT NULL
   GROUP BY 1, 2`;

/**
 * Os pedidos como foram colocados, um por (pedido, item).
 *
 * `data_emissao` define a competência — é quando o pedido foi feito, e não muda
 * entre as cargas. O `MIN` existe só por segurança: se a origem divergir entre
 * linhas do mesmo par, a data mais antiga é a que corresponde à colocação.
 */
/**
 * Fornecedor por item, do simulador.
 *
 * A base de pedidos tem `cod_fornecedor` no formato "000094-0001-3M DO BRASIL
 * LTDA." — código mais razão social —, enquanto o cadastro e todas as telas
 * usam o nome curto ("3M"). Os dois não casam, e tentar casá-los por texto
 * seria adivinhação.
 *
 * O fornecedor é atributo do item, então sai do simulador pelo código, como nas
 * outras telas. Assim o filtro desta tela compara com o das demais.
 *
 * CTE, e não subconsulta correlacionada: a correlacionada reexecuta a busca por
 * linha e já custou 23 segundos na tabela de cobertura e 119 no detalhe de spot.
 */
const FORNECEDOR_POR_ITEM = `
  SELECT DISTINCT ON (s.codigo) s.codigo, ${nomeFornecedor("s")} AS nome
    FROM simulador s ${joinFornecedor("s")}
   WHERE s.data_snapshot = (SELECT MAX(data_snapshot) FROM simulador)
     AND s.fornecedor IS NOT NULL
   ORDER BY s.codigo`;

const COLOCADOS = `
  SELECT p.num_pedido,
         p.codigo,
         MIN(p.data_emissao)::date      AS emissao,
         MIN(p.filial)                  AS filial,
         SUM(p.saldo_ajustado)::float8  AS valor,
         SUM(p.quantidade_total)::float8 AS quantidade,
         COALESCE(MIN(fo.nome), 'Sem fornecedor') AS fornecedor,
         -- A BU e a coluna "categoria" (MAT, MED, PREVENA...). A coluna "bo"
         -- parece candidata pelo nome e nao e: guarda "B.O. Total" e "B.O.
         -- Parcial", que e situacao de back order, nao unidade de negocio.
         MIN(COALESCE(NULLIF(trim(p.categoria), ''), 'Sem BU')) AS bu
    FROM pedidos_de_compra p
    LEFT JOIN (${FORNECEDOR_POR_ITEM}) fo ON fo.codigo = p.codigo
    JOIN (${PRIMEIRA_APARICAO}) pr
      ON pr.num_pedido = p.num_pedido AND pr.codigo = p.codigo
     AND pr.snap = p.data_snapshot
   WHERE p.data_emissao IS NOT NULL
   GROUP BY 1, 2`;

export type CelulaDia = { dia: number; valor: number; quantidade: number };

export type LinhaFornecedor = {
  fornecedor: string;
  dias: CelulaDia[];
  total: number;
  quantidadeTotal: number;
  /** Pedidos distintos no mês — um pedido pode trazer vários itens. */
  pedidos: number;
  produtos: number;
};

export type LinhaProduto = {
  codigo: string;
  descricao: string | null;
  dias: CelulaDia[];
  total: number;
  quantidadeTotal: number;
  pedidos: number;
};

export type Filtros = {
  fornecedor?: string;
  bu?: string;
  /** Código exato ou trecho da descrição. */
  produto?: string;
};

/**
 * Meses com colocação **completa**, do mais recente para o mais antigo.
 *
 * O corte não é uma data fixa: é o mês seguinte ao da primeira carga. A base só
 * guarda pedido ainda aberto, então de um mês anterior ao início das cargas
 * sobrevive apenas o que não tinha sido entregue — e isso não é a colocação
 * daquele mês, é o resíduo dela.
 *
 * O efeito aparece nos números: com a primeira carga em 28/07, setembro tem
 * 1.115 pedidos, agosto 345, julho 126, junho 22, caindo até um pedido solto de
 * 2025. Oferecer esses meses no filtro convidaria a ler como colocação um número
 * que não é.
 *
 * Derivado em vez de escrito no código, para continuar certo quando a base
 * acumular mais meses e para valer em qualquer instalação.
 */
export async function listarMeses(): Promise<string[]> {
  const linhas = await prisma.$queryRawUnsafe<{ mes: string }[]>(
    `SELECT DISTINCT to_char(data_emissao, 'YYYY-MM') AS mes
       FROM pedidos_de_compra
      WHERE data_emissao IS NOT NULL AND codigo IS NOT NULL
        AND data_emissao >= (
          SELECT date_trunc('month', MIN(data_snapshot)) + interval '1 month'
            FROM pedidos_de_compra
        )
      ORDER BY 1 DESC`,
  );
  return linhas.map((l) => l.mes);
}

/** Listas dos filtros, montadas sobre o mês inteiro, sem os outros recortes. */
export async function listarOpcoes(
  mes: string,
): Promise<{ fornecedores: string[]; bus: string[] }> {
  const linhas = await prisma.$queryRawUnsafe<
    { fornecedor: string; bu: string }[]
  >(
    `WITH colocado AS (${COLOCADOS})
     SELECT DISTINCT fornecedor, bu FROM colocado
      WHERE to_char(emissao, 'YYYY-MM') = $1`,
    mes,
  );

  return {
    fornecedores: [...new Set(linhas.map((l) => l.fornecedor))].sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    ),
    bus: [...new Set(linhas.map((l) => l.bu))].sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    ),
  };
}

/** Condição dos filtros, com os placeholders a partir de `$2`. */
function recorte(filtros: Filtros): { sql: string; args: unknown[] } {
  const partes: string[] = [];
  const args: unknown[] = [];

  if (filtros.fornecedor) {
    args.push(filtros.fornecedor);
    partes.push(`AND c.fornecedor = $${args.length + 1}`);
  }
  if (filtros.bu) {
    args.push(filtros.bu);
    partes.push(`AND c.bu = $${args.length + 1}`);
  }
  if (filtros.produto) {
    args.push(filtros.produto);
    // Código exato ou trecho da descrição, como nas outras telas.
    partes.push(
      `AND (c.codigo = $${args.length + 1} OR pr.descricao ILIKE '%' || $${args.length + 1} || '%')`,
    );
  }

  return { sql: partes.join("\n        "), args };
}

export async function carregarColocacao(
  mes: string,
  filtros: Filtros = {},
): Promise<LinhaFornecedor[]> {
  const { sql, args } = recorte(filtros);

  const linhas = await prisma.$queryRawUnsafe<
    {
      fornecedor: string;
      dia: number;
      valor: number;
      quantidade: number;
      pedidos: number;
      produtos: number;
    }[]
  >(
    `WITH colocado AS (${COLOCADOS})
     SELECT c.fornecedor,
            extract(day FROM c.emissao)::int AS dia,
            SUM(c.valor)::float8             AS valor,
            SUM(c.quantidade)::float8        AS quantidade,
            count(DISTINCT c.num_pedido)::int AS pedidos,
            count(DISTINCT c.codigo)::int     AS produtos
       FROM colocado c
       LEFT JOIN produtos pr ON pr.codigo = c.codigo
      WHERE to_char(c.emissao, 'YYYY-MM') = $1
        ${sql}
      GROUP BY 1, 2
      ORDER BY 1, 2`,
    mes,
    ...args,
  );

  const porFornecedor = agrupar(linhas, (l) => l.fornecedor).map(
    ([fornecedor, doGrupo]) => ({
      fornecedor,
      dias: doGrupo.map((l) => ({
        dia: l.dia,
        valor: l.valor,
        quantidade: l.quantidade,
      })),
      total: doGrupo.reduce((a, l) => a + l.valor, 0),
      quantidadeTotal: doGrupo.reduce((a, l) => a + l.quantidade, 0),
      // Somar os distintos de cada dia contaria duas vezes o pedido que aparece em
      // dias diferentes — mas um pedido tem uma data de emissão só, então ele cai
      // num dia apenas e a soma é exata.
      pedidos: doGrupo.reduce((a, l) => a + l.pedidos, 0),
      produtos: doGrupo.reduce((a, l) => a + l.produtos, 0),
    }),
  );

  // Maior valor primeiro: a lista tem mais de cem fornecedores, e o que decide
  // compra é onde o dinheiro foi. Em ordem alfabética, os maiores ficavam
  // espalhados e só apareciam rolando.
  return porFornecedor.sort((a, b) => b.total - a.total);
}

/** O segundo nível: os produtos de um fornecedor dentro do mês. */
export async function carregarProdutos(
  mes: string,
  fornecedor: string,
  filtros: Filtros = {},
): Promise<LinhaProduto[]> {
  const { sql, args } = recorte({ ...filtros, fornecedor });

  const linhas = await prisma.$queryRawUnsafe<
    {
      codigo: string;
      descricao: string | null;
      dia: number;
      valor: number;
      quantidade: number;
      pedidos: number;
    }[]
  >(
    `WITH colocado AS (${COLOCADOS})
     SELECT c.codigo,
            pr.descricao,
            extract(day FROM c.emissao)::int AS dia,
            SUM(c.valor)::float8             AS valor,
            SUM(c.quantidade)::float8        AS quantidade,
            count(DISTINCT c.num_pedido)::int AS pedidos
       FROM colocado c
       LEFT JOIN produtos pr ON pr.codigo = c.codigo
      WHERE to_char(c.emissao, 'YYYY-MM') = $1
        ${sql}
      GROUP BY 1, 2, 3
      ORDER BY 1, 3`,
    mes,
    ...args,
  );

  const porProduto = agrupar(linhas, (l) => l.codigo).map(
    ([codigo, doGrupo]) => ({
      codigo,
      descricao: doGrupo[0].descricao,
      dias: doGrupo.map((l) => ({
        dia: l.dia,
        valor: l.valor,
        quantidade: l.quantidade,
      })),
      total: doGrupo.reduce((a, l) => a + l.valor, 0),
      quantidadeTotal: doGrupo.reduce((a, l) => a + l.quantidade, 0),
      pedidos: doGrupo.reduce((a, l) => a + l.pedidos, 0),
    }),
  );

  return porProduto.sort((a, b) => b.total - a.total);
}

/** Agrupa preservando a ordem de chegada, que o SQL já definiu. */
function agrupar<T>(linhas: T[], chave: (l: T) => string): [string, T[]][] {
  const mapa = new Map<string, T[]>();
  for (const l of linhas) {
    const k = chave(l);
    const lista = mapa.get(k) ?? [];
    lista.push(l);
    mapa.set(k, lista);
  }
  return [...mapa.entries()];
}
