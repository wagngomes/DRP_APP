/**
 * Saldo do plano de compra do mês, por produto.
 *
 *   saldo = plano do mês − pedidos em aberto do mês − recebido no mês
 *
 * É o número que separa duas ações muito diferentes para o analista: com saldo,
 * ele pede a colocação do pedido; sem saldo, precisa de aprovação de verba. A
 * tela de fornecedores já usava esse cálculo e o cockpit passou a precisar do
 * mesmo — a consulta vive aqui para as duas nunca divergirem, que é exatamente
 * o que produziu, antes neste projeto, números diferentes para a mesma pergunta
 * em telas diferentes.
 *
 * `pedidos_de_compra` é cumulativa: o filtro de snapshot é obrigatório além do
 * recorte por mês de emissão. Sem ele o mesmo pedido soma uma vez por
 * importação — em agosto isso inflava o total em 6,8x.
 */
import { prisma } from "@/lib/prisma";
import { snapshotMensalSql } from "@/utils/dias-estoque";

export type SaldoPlano = {
  /** Quantidade planejada para o mês. */
  plano: number;
  /** Já colocado e ainda não recebido. */
  aberto: number;
  /** Já entrou no CD dentro do mês. */
  recebido: number;
  /** O que ainda cabe colocar: plano − aberto − recebido. Pode ser negativo. */
  saldo: number;
};

function limitesDoMes(data: string): [string, string] {
  const [ano, mes] = data.split("-").map(Number);
  return [
    new Date(Date.UTC(ano, mes - 1, 1)).toISOString().slice(0, 10),
    new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10),
  ];
}

/** Saldo por código de produto, para o mês da data de referência. */
export async function carregarSaldoPlano(data: string): Promise<Map<string, SaldoPlano>> {
  const [inicioMes, proximoMes] = limitesDoMes(data);

  const linhas = await prisma.$queryRawUnsafe<
    { codigo: string; plano: number; aberto: number; recebido: number; saldo: number }[]
  >(
    `SELECT c.codigo,
            c.plano::float8     AS plano,
            c.aberto::float8    AS aberto,
            c.recebido::float8  AS recebido,
            (c.plano - c.aberto - c.recebido)::float8 AS saldo FROM (
       SELECT p.codigo,
              SUM(p.plano_de_compra) AS plano,
              COALESCE((SELECT SUM(quantidade_receber) FROM pedidos_de_compra pc
                         WHERE pc.codigo = p.codigo AND pc.quantidade_receber > 0
                           AND pc.data_snapshot = $3::date
                           AND pc.data_emissao >= $1::date AND pc.data_emissao < $2::date), 0) AS aberto,
              COALESCE((SELECT SUM(quantidade) FROM recebimento r
                         WHERE r.codigo = p.codigo
                           AND r.data_pedido >= $1::date AND r.data_pedido < $2::date
                           AND r.data >= $1::date AND r.data < $2::date), 0) AS recebido
         FROM plano_compra p
        WHERE p.data_snapshot >= $1::date AND p.data_snapshot < $2::date
          AND ${snapshotMensalSql("plano_compra", "p", "$3")}
        GROUP BY p.codigo
     ) c`,
    inicioMes,
    proximoMes,
    data
  );

  return new Map(
    linhas.map((l) => [
      l.codigo,
      { plano: l.plano, aberto: l.aberto, recebido: l.recebido, saldo: l.saldo },
    ])
  );
}
