-- AddForeignKey
ALTER TABLE "forecast" ADD CONSTRAINT "forecast_codigo_fkey" FOREIGN KEY ("codigo") REFERENCES "produtos"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;
