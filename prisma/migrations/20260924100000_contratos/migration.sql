-- CreateTable
CREATE TABLE "contratos" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_snapshot" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "competencia" DATE,
    "status_acordo" TEXT,
    "razao_social" TEXT,
    "cnpj" TEXT,
    "grupo" TEXT,
    "uf" TEXT,
    "regional" TEXT,
    "representante" TEXT,
    "reserva_final_contrato" DECIMAL(24,10),
    "codigo" TEXT,
    "contribuinte" TEXT,
    "local_ideal" TEXT,
    "quantidade_final" DECIMAL(24,10),

    CONSTRAINT "contratos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contratos_competencia_idx" ON "contratos"("competencia");

-- CreateIndex
CREATE INDEX "contratos_data_snapshot_idx" ON "contratos"("data_snapshot");

-- CreateIndex
CREATE INDEX "contratos_competencia_codigo_idx" ON "contratos"("competencia", "codigo");

