-- AlterTable
ALTER TABLE "plano_compra" ADD COLUMN     "data_snapshot" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "plano_compra_data_snapshot_idx" ON "plano_compra"("data_snapshot");
