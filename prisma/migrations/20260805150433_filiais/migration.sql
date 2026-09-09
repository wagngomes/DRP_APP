-- CreateTable
CREATE TABLE "filiais" (
    "codigo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sigla" TEXT,
    "descricao" TEXT,

    CONSTRAINT "filiais_pkey" PRIMARY KEY ("codigo")
);
