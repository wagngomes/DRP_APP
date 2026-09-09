-- AlterTable
ALTER TABLE "transferencias_abertas" ADD COLUMN     "data_snapshot" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "transferencias_abertas_data_snapshot_idx" ON "transferencias_abertas"("data_snapshot");
