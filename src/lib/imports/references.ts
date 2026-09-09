import { prisma } from "@/lib/prisma";
import type { ImportModelConfig } from "@/lib/imports/config";

type ReferenceLookupDelegate = {
  findMany: (args: {
    where: Record<string, unknown>;
    select: Record<string, boolean>;
  }) => Promise<Record<string, unknown>[]>;
};

function getLookupDelegate(delegateName: string): ReferenceLookupDelegate {
  return (prisma as unknown as Record<string, ReferenceLookupDelegate>)[delegateName];
}

/**
 * Filtra `records` pelas chaves estrangeiras declaradas em `model.references`.
 * Linhas cujo valor de FK não existir na tabela referenciada são removidas e
 * reportadas em `skipped` — em vez de deixar o `createMany` estourar a
 * transação inteira por violação de constraint no banco.
 */
export async function filterByReferences(
  records: Record<string, unknown>[],
  recordRows: number[],
  model: ImportModelConfig
): Promise<{ valid: Record<string, unknown>[]; skipped: { row: number; reason: string }[] }> {
  if (!model.references || model.references.length === 0) {
    return { valid: records, skipped: [] };
  }

  const skipped: { row: number; reason: string }[] = [];
  let valid = records;
  let validRows = recordRows;

  for (const ref of model.references) {
    const values = Array.from(
      new Set(
        valid
          .map((record) => record[ref.field])
          .filter((value): value is string => typeof value === "string")
      )
    );

    if (values.length === 0) continue;

    const delegate = getLookupDelegate(ref.targetDelegate);
    const found = await delegate.findMany({
      where: { [ref.targetField]: { in: values } },
      select: { [ref.targetField]: true },
    });
    const foundSet = new Set(found.map((item) => String(item[ref.targetField])));

    const nextValid: Record<string, unknown>[] = [];
    const nextRows: number[] = [];
    valid.forEach((record, index) => {
      const value = record[ref.field];
      if (typeof value === "string" && !foundSet.has(value)) {
        skipped.push({
          row: validRows[index],
          reason: `${ref.field} "${value}" não encontrado na tabela ${ref.label}`,
        });
        return;
      }
      nextValid.push(record);
      nextRows.push(validRows[index]);
    });

    valid = nextValid;
    validRows = nextRows;
  }

  return { valid, skipped };
}
