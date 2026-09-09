-- AddForeignKey
ALTER TABLE "transferencias_abertas" ADD CONSTRAINT "transferencias_abertas_codigo_fkey" FOREIGN KEY ("codigo") REFERENCES "produtos"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;
