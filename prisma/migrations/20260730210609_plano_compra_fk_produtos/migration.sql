-- AddForeignKey
ALTER TABLE "plano_compra" ADD CONSTRAINT "plano_compra_codigo_fkey" FOREIGN KEY ("codigo") REFERENCES "produtos"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;
