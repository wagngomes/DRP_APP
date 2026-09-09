-- CreateTable
CREATE TABLE "fornecedores" (
    "fornecedor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fornecedor_normalizado" TEXT,

    CONSTRAINT "fornecedores_pkey" PRIMARY KEY ("fornecedor")
);

-- CreateIndex
CREATE INDEX "fornecedores_fornecedor_normalizado_idx" ON "fornecedores"("fornecedor_normalizado");
