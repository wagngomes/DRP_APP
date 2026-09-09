-- AlterTable
ALTER TABLE "forecast" ADD COLUMN     "data_snapshot" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "forecast_data_snapshot_idx" ON "forecast"("data_snapshot");
