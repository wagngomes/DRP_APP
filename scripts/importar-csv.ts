/**
 * Importa um CSV direto para o banco, sem servidor e sem build.
 *
 * Existe porque nem sempre dá para subir a aplicação: um `npm run build` pede
 * espaço em disco e alguns minutos, e reproduzir uma carga para investigar um
 * número não deveria depender disso. Usa exatamente o mesmo caminho do upload
 * pela tela — `parseCsvForModel` e `bulkLoadRecords` — então o que acontece
 * aqui é o que aconteceria lá, incluindo os motivos de linha ignorada.
 *
 *   npx tsx --env-file=.env scripts/importar-csv.ts <model> <arquivo.csv> [aaaa-mm-dd]
 *
 * A data é opcional e só vale para tabelas com snapshot: vazia usa hoje,
 * preenchida carimba a carga com aquele dia, como o campo de data da tela.
 *
 * Aponta para o banco do `.env` carregado — confira antes de rodar contra um
 * ambiente que não seja o de desenvolvimento.
 */
import { readFileSync } from "node:fs";

import { bulkLoadRecords } from "@/lib/imports/bulk-copy";
import { getImportModel, IMPORT_MODEL_KEYS } from "@/lib/imports/config";
import { decodificarCsv, parseCsvForModel, SkipTracker } from "@/lib/imports/csv";
import { resolverDataCarga } from "@/lib/imports/data-carga";
import { filterByReferences } from "@/lib/imports/references";
import { hojeNaOperacao } from "@/lib/data-referencia";
import { prisma } from "@/lib/prisma";

async function main() {
  const [chave, caminho, dataPedida] = process.argv.slice(2);

  if (!chave || !caminho) {
    console.error("uso: npx tsx --env-file=.env scripts/importar-csv.ts <model> <arquivo.csv> [aaaa-mm-dd]");
    console.error(`models: ${IMPORT_MODEL_KEYS.join(", ")}`);
    process.exit(1);
  }

  const model = getImportModel(chave);
  if (!model) {
    console.error(`Tabela desconhecida: ${chave}`);
    console.error(`models: ${IMPORT_MODEL_KEYS.join(", ")}`);
    process.exit(1);
  }

  const data = resolverDataCarga(model, dataPedida, hojeNaOperacao());
  if (!data.ok) {
    console.error(data.erro);
    process.exit(1);
  }

  const { records, recordRows, totalRows, skippedRows, missingColumns } = parseCsvForModel(
    decodificarCsv(readFileSync(caminho)),
    model
  );

  const tracker = new SkipTracker();
  for (const item of skippedRows) tracker.add(item.row, item.reason);

  if (missingColumns.length > 0) {
    console.warn(`colunas ausentes no CSV (gravadas vazias): ${missingColumns.join(", ")}`);
  }

  const { valid, skipped } = await filterByReferences(records, recordRows, model);
  for (const item of skipped) tracker.add(item.row, item.reason);

  if (valid.length === 0) {
    console.error(`nenhuma linha válida em ${totalRows} lida(s)`);
    for (const s of tracker.summary()) console.error(`  ${s.count}× ${s.reason}`);
    process.exit(1);
  }

  if (model.cumulative && model.snapshotField) {
    for (const r of valid) r[model.snapshotField] = data.data;
  }

  const { insertedCount, duplicatesInBatch } = await bulkLoadRecords(valid, model);

  const quando = data.data.toISOString().slice(0, 10);
  console.log(
    `${model.label}: ${insertedCount} linha(s) de ${totalRows}` +
      (model.cumulative ? ` — snapshot ${quando}${data.retroativa ? " (retroativa)" : ""}` : "")
  );
  const ignoradas = tracker.total + duplicatesInBatch;
  if (ignoradas > 0) {
    console.log(`${ignoradas} ignorada(s):`);
    for (const s of tracker.summary()) console.log(`  ${s.count}× ${s.reason}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
