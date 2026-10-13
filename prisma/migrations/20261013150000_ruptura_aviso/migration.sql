-- Dias de aviso: quantos dias a posição passou abaixo do Gatilho antes de zerar.
--
-- A distinção que mais falta ao diagnóstico. Medido em setembro, das posições
-- com histórico: **110 romperam sem nenhum dia de aviso** — caíram de uma vez,
-- e ninguém tinha como reagir — contra 125 que passaram dias abaixo do Gatilho
-- antes de zerar. São conversas diferentes: uma é falha de planejamento, a
-- outra é falha de execução, e até agora a árvore não as separava.
--
-- Modificador, não causa: o aviso não muda **o que** falhou, muda se alguém
-- podia ter agido. Por isso é coluna própria e não entra no veredito.
--
-- Nula quando não há histórico medido antes da ruptura — e isso era metade dos
-- casos até a janela do motor passar a cobrir também o mês anterior.
--
-- Escrita à mão pelo mesmo motivo das anteriores: o histórico de migrations do
-- banco diverge do diretório desde o baseline de 11/09, e `prisma migrate dev`
-- propõe resetar o schema.

ALTER TABLE "ruptura_evento"
  ADD COLUMN IF NOT EXISTS "dias_aviso" INTEGER;

CREATE INDEX IF NOT EXISTS "ruptura_evento_dias_aviso_idx"
  ON "ruptura_evento" ("dias_aviso");
