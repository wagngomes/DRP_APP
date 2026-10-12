-- O modificador do balanceamento vira coluna.
--
-- "Outro CD tinha sobra acima do Alvo e nada saiu" é **modificador**, não
-- causa: vale em cima de qualquer veredito, porque uma ruptura provocada por
-- pedido tardio continua sendo pedido tardio ainda que uma transferência a
-- tivesse salvo. Por isso ele nunca aparece como a causa na lista — e, medido
-- na rodada de setembro, **204 das 458 posições (45%) o carregam**.
--
-- Até agora ele vivia só dentro do JSON de evidências, o que o tornava
-- invisível na tela e impossível de filtrar. Em coluna própria, com índice, ele
-- vira um chip: "cabia transferência · 204".
--
-- Escrita à mão pelo mesmo motivo das anteriores: o histórico de migrations do
-- banco diverge do diretório desde o baseline de 11/09, e `prisma migrate dev`
-- propõe resetar o schema.
--
-- Só acrescenta. Evento de rodada anterior fica com `false`, que é o padrão
-- correto: aquela rodada não media isto em coluna.

ALTER TABLE "ruptura_evento"
  ADD COLUMN IF NOT EXISTS "arvore_balanceamento" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "ruptura_evento_arvore_balanceamento_idx"
  ON "ruptura_evento" ("arvore_balanceamento");
