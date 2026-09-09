-- AlterTable
ALTER TABLE "simulador" ADD COLUMN     "data_snapshot" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "simulador_data_snapshot_idx" ON "simulador"("data_snapshot");
