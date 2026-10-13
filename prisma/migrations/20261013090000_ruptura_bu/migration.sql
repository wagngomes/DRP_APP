-- BU no evento de ruptura, para a tela filtrar por ela.
--
-- Guardada na linha, e não resolvida na consulta, pelas duas razões que já
-- valeram para `fornecedor`: a tela filtra por BU, e um join com `forecast` a
-- cada listagem é o padrão que já custou 23 segundos noutra tela desta base; e
-- a BU de um item muda — o que interessa na análise de setembro é a BU que
-- valia em setembro, não a de hoje.
--
-- Vem de `forecast.b_u`, com a mesma normalização das outras telas:
-- `COALESCE(NULLIF(trim(b_u), ''), '—')`. Sem isso, item sem BU preenchida
-- sumiria do recorte em vez de aparecer como "Sem BU".
--
-- Escrita à mão pelo mesmo motivo das anteriores: o histórico de migrations do
-- banco diverge do diretório desde o baseline de 11/09, e `prisma migrate dev`
-- propõe resetar o schema.
--
-- Só acrescenta. Evento de rodada anterior fica com a coluna nula, e a tela
-- mostra esses casos em "Sem BU" até a próxima rodada preencher.

ALTER TABLE "ruptura_evento"
  ADD COLUMN IF NOT EXISTS "bu" TEXT;

CREATE INDEX IF NOT EXISTS "ruptura_evento_bu_idx" ON "ruptura_evento" ("bu");
