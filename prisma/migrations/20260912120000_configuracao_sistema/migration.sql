-- CreateTable
CREATE TABLE "configuracao_sistema" (
    "chave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "atualizado_por" TEXT,

    CONSTRAINT "configuracao_sistema_pkey" PRIMARY KEY ("chave")
);

