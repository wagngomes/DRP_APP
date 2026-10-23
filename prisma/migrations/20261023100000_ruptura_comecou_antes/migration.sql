-- O evento já estava rompido quando a janela começou.
--
-- O motor monta eventos sobre a janela que vai do marco de abertura do mês até
-- a data de referência, então uma ruptura iniciada antes disso é carimbada com
-- `inicio` no primeiro dia da janela. Visto na tela: o gráfico, que olha dois
-- meses, mostrava 53 dias sem estoque enquanto a tabela dizia 22 — os dois
-- certos dentro da própria janela.
--
-- Isto não conserta a duração; marca que ela é um **piso**. A correção completa
-- é montar os eventos sobre os dois meses, e ela mexe na âncora do replay —
-- decisão separada, que esta coluna ajuda a dimensionar: dá para contar quantos
-- eventos nascem assim antes de pagar aquele custo.
--
-- Consequência direta, e por isso a coluna existe: em evento marcado, `dias`,
-- `valor_perdido` e tudo que depende de `inicio` estão subestimados, e os dias
-- de aviso são nulos — não havia véspera com estoque para medir.
--
-- Escrita à mão pelo mesmo motivo das anteriores: o histórico de migrations do
-- banco diverge do diretório desde o baseline de 11/09, e `prisma migrate dev`
-- propõe resetar o schema.

ALTER TABLE "ruptura_evento"
  ADD COLUMN IF NOT EXISTS "comecou_antes" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "ruptura_evento_comecou_antes_idx"
  ON "ruptura_evento" ("comecou_antes");
