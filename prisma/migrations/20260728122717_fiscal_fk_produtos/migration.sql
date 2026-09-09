-- AddForeignKey
ALTER TABLE "fiscal" ADD CONSTRAINT "fiscal_codigo_fkey" FOREIGN KEY ("codigo") REFERENCES "produtos"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;
