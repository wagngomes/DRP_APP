import { Pool } from "pg";
import { from as copyFrom } from "pg-copy-streams";

import { getIdField, getTableName, type ImportModelConfig } from "@/lib/imports/config";

/**
 * Pool dedicado para o bulk load. O `COPY FROM STDIN` do Postgres é a única
 * forma de gravar dezenas de milhares de linhas em tempo aceitável (45k linhas:
 * ~1s no COPY contra vários minutos no `createMany` do Prisma, que fatia o
 * INSERT em dezenas de statements e paga um round-trip em cada um). O adapter
 * do Prisma não expõe a conexão crua necessária para o protocolo de COPY, então
 * o `pg` é usado direto aqui — o resto do app continua no Prisma.
 */
const globalForCopyPool = globalThis as unknown as { copyPool: Pool | undefined };

/**
 * Criado sob demanda: o Next carrega o módulo da rota durante a análise de
 * build, e abrir conexões nesse momento é desperdício (e falha se a
 * DATABASE_URL ainda não estiver disponível).
 */
function getPool(): Pool {
  if (!globalForCopyPool.copyPool) {
    globalForCopyPool.copyPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 4,
    });
  }
  return globalForCopyPool.copyPool;
}

/** Identificador SQL entre aspas — nomes vêm do config, mas nunca do usuário. */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Serializa um valor no formato CSV que o COPY espera.
 * Campo vazio SEM aspas = NULL; `""` = string vazia. É essa distinção que
 * permite gravar null nas colunas opcionais.
 */
function toCopyField(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  // Prisma.Decimal, number e string caem todos aqui.
  const text = String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export type BulkLoadResult = {
  insertedCount: number;
  /** Linhas descartadas por repetirem a chave natural dentro do próprio CSV. */
  duplicatesInBatch: number;
};

/**
 * Cadastros com chave natural são atualizados, nunca apagados.
 *
 * Antes a carga fazia DELETE + COPY: durante a transação a tabela ficava vazia,
 * e as FKs com ON DELETE SET NULL zeravam o código nas tabelas dependentes —
 * um reimport de produtos destruía o vínculo de forecast, fiscal, pedidos,
 * plano e transferências. Com upsert nada é removido: código novo entra,
 * existente é atualizado, e quem não veio no arquivo permanece.
 *
 * Vale só para não-cumulativos com `idField`; sem chave natural não há como
 * decidir o que é a mesma linha.
 */
function usaUpsert(model: ImportModelConfig): boolean {
  return Boolean(model.idField) && !model.cumulative;
}

/**
 * Grava `records` na tabela do model dentro de uma única transação.
 * Cadastros com chave natural usam upsert; os demais não-cumulativos têm a
 * tabela esvaziada antes; cumulativos apenas acrescentam o snapshot novo.
 */
export async function bulkLoadRecords(
  records: Record<string, unknown>[],
  model: ImportModelConfig
): Promise<BulkLoadResult> {
  const fields = model.columns.map((column) => column.field);
  if (model.cumulative && model.snapshotField) {
    fields.push(model.snapshotField);
  }

  // O COPY não tem ON CONFLICT: linhas com chave natural repetida dentro do
  // próprio CSV abortariam a transação inteira. Como a tabela é esvaziada
  // antes, basta manter a primeira ocorrência de cada chave.
  let rows = records;
  let duplicatesInBatch = 0;
  if (model.idField) {
    const idField = getIdField(model);
    const seen = new Set<string>();
    rows = records.filter((record) => {
      const key = String(record[idField]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    duplicatesInBatch = records.length - rows.length;
  }

  const table = quoteIdent(getTableName(model));
  const columnList = fields.map(quoteIdent).join(", ");

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // Meio milhão de linhas mantém a transação aberta por minutos; o
    // statement_timeout padrão do Supabase (2min) abortaria o COPY no meio.
    // LOCAL vale só nesta transação.
    await client.query("SET LOCAL statement_timeout = '15min'");

    const upsert = usaUpsert(model);

    if (!model.cumulative && !upsert) {
      await client.query(`DELETE FROM ${table}`);
    }

    // No upsert o COPY vai para uma tabela temporária e o merge acontece
    // depois: COPY não tem ON CONFLICT, e é o merge que preserva as linhas
    // que não vieram no arquivo.
    const destino = upsert ? `tmp_import` : table;
    if (upsert) {
      await client.query(
        `CREATE TEMP TABLE tmp_import (LIKE ${table} INCLUDING DEFAULTS) ON COMMIT DROP`
      );
    }

    const stream = client.query(
      copyFrom(`COPY ${destino} (${columnList}) FROM STDIN WITH (FORMAT csv)`)
    );

    await new Promise<void>((resolve, reject) => {
      stream.on("error", reject);
      stream.on("finish", resolve);

      let index = 0;
      const writeChunk = () => {
        while (index < rows.length) {
          const record = rows[index++];
          const line = fields.map((field) => toCopyField(record[field])).join(",") + "\n";
          // write() retorna false quando o buffer encheu — esperar o "drain"
          // evita estourar a memória do processo em arquivos grandes.
          if (!stream.write(line)) {
            stream.once("drain", writeChunk);
            return;
          }
        }
        stream.end();
      };
      writeChunk();
    });

    if (upsert) {
      const chave = quoteIdent(getIdField(model));
      // A chave não entra no SET: ela é o critério do conflito.
      const atualizacoes = fields
        .filter((f) => f !== getIdField(model))
        .map((f) => `${quoteIdent(f)} = EXCLUDED.${quoteIdent(f)}`)
        .join(", ");
      await client.query(
        `INSERT INTO ${table} (${columnList})
         SELECT ${columnList} FROM tmp_import
         ON CONFLICT (${chave}) DO UPDATE SET ${atualizacoes}`
      );
    }

    await client.query("COMMIT");

    // ANALYZE logo após a carga, fora da transação.
    //
    // Sem isto o planejador continua com as estatísticas de antes da
    // importação e subestima grosseiramente o snapshot novo. Aconteceu de
    // verdade: com o simulador estimado em 1 linha quando tinha 13.191, o
    // Postgres escolheu laço aninhado e comparou 78 milhões de pares de linhas
    // — a tela de compras urgentes foi de 0,5 s para 25 s.
    //
    // O `autoanalyze` não é confiável aqui: o gatilho dele olha a proporção de
    // linhas alteradas, e uma carga que apaga e reinsere a mesma ordem de
    // grandeza nem sempre o dispara.
    //
    // Falha aqui não invalida a importação — os dados já foram gravados. Vira
    // aviso no log, e o autoanalyze acaba corrigindo mais tarde.
    try {
      await client.query(`ANALYZE ${table}`);
    } catch (erro) {
      console.warn(`[import] ANALYZE de ${table} falhou:`, erro);
    }

    return { insertedCount: rows.length, duplicatesInBatch };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
