/*
  Warnings:

  - You are about to alter the column `quantidade_entregue` on the `pedidos_de_compra` table. The data in that column could be lost. The data in that column will be cast from `Decimal(24,10)` to `Integer`.
  - You are about to alter the column `quantidade_total` on the `pedidos_de_compra` table. The data in that column could be lost. The data in that column will be cast from `Decimal(24,10)` to `Integer`.
  - You are about to alter the column `quantidade_receber` on the `pedidos_de_compra` table. The data in that column could be lost. The data in that column will be cast from `Decimal(24,10)` to `Integer`.
  - You are about to alter the column `lt` on the `pedidos_de_compra` table. The data in that column could be lost. The data in that column will be cast from `Decimal(24,10)` to `Integer`.

*/
-- AlterTable
ALTER TABLE "pedidos_de_compra" ADD COLUMN     "data_snapshot" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "quantidade_entregue" SET DATA TYPE INTEGER,
ALTER COLUMN "quantidade_total" SET DATA TYPE INTEGER,
ALTER COLUMN "quantidade_receber" SET DATA TYPE INTEGER,
ALTER COLUMN "lt" SET DATA TYPE INTEGER;

-- CreateIndex
CREATE INDEX "pedidos_de_compra_data_snapshot_idx" ON "pedidos_de_compra"("data_snapshot");

-- AddForeignKey
ALTER TABLE "pedidos_de_compra" ADD CONSTRAINT "pedidos_de_compra_codigo_fkey" FOREIGN KEY ("codigo") REFERENCES "produtos"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;
