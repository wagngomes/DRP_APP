-- CreateTable
CREATE TABLE "sop" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_snapshot" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "competencia" DATE,
    "codigo" TEXT,
    "descricao" TEXT,
    "divisao" TEXT,
    "consenso" DECIMAL(24,10),

    CONSTRAINT "sop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sop_competencia_idx" ON "sop"("competencia");

-- CreateIndex
CREATE INDEX "sop_data_snapshot_idx" ON "sop"("data_snapshot");

-- CreateIndex
CREATE INDEX "sop_competencia_codigo_idx" ON "sop"("competencia", "codigo");

