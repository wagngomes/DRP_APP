-- Clientes/Grupos deixa de ser cadastro fixo e passa a ser base mensal.
--
-- O vínculo entre CNPJ e grupo muda com o tempo -- aquisição, reorganização
-- comercial, cliente que troca de rede. Com base única, reimportar reescrevia a
-- história: um mês fechado passava a ser lido com os grupos de hoje, e o
-- Contratos x Spot do raio-X mudava sozinho sem ninguém ter mexido em venda
-- nenhuma.
--
-- A base existente recebe 2026-05-01 porque é quando começa o histórico de
-- vendas: assim ela cobre tudo que já está no sistema, e a próxima carga assume
-- do mês dela em diante.

ALTER TABLE "clientes_grupos" ADD COLUMN "data_snapshot" DATE;

UPDATE "clientes_grupos" SET "data_snapshot" = DATE '2026-05-01' WHERE "data_snapshot" IS NULL;

ALTER TABLE "clientes_grupos" ALTER COLUMN "data_snapshot" SET NOT NULL;

-- A consulta é sempre "qual o snapshot vigente para este mês" seguida de "quais
-- os grupos daquele snapshot". O índice composto serve as duas, nessa ordem.
CREATE INDEX "clientes_grupos_snapshot_cnpj_idx"
  ON "clientes_grupos" ("data_snapshot", "cliente_cnpj");
