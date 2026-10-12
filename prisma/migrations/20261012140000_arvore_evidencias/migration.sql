-- A árvore passa a ser o veredito único, com a prova ao lado.
--
-- O motor contrafactual deixa de produzir uma segunda resposta. A matemática
-- dele continua rodando — custa 58ms nos 458 eventos, contra 11s de carga das
-- bases —, mas agora como **evidência**: a prescrição ("transferir 180 até
-- 04/09 teria evitado") e o aviso de balanço que não fecha. O que sai é a
-- atribuição de dias entre várias causas, que era a segunda verdade na tela.
--
-- Escrita à mão pelo mesmo motivo das anteriores: o histórico de migrations do
-- banco diverge do diretório desde o baseline de 11/09, e `prisma migrate dev`
-- propõe resetar o schema.
--
-- Só acrescenta e afrouxa. Nada é apagado:
--
--   `arvore_evidencias`  a prova da causa, em JSON.
--   `dias_explicados`    deixa de ser obrigatória. Era a fração de dias que as
--                        causas do contrafactual explicavam, e sem a atribuição
--                        o número não existe mais. A coluna fica, com os dados
--                        antigos, em vez de ser derrubada.
--
-- A tabela `ruptura_causa` **continua existindo e não é mais escrita**. Suas
-- linhas somem na próxima rodada, porque `ruptura_evento` é apagada por versão
-- de regra e a cascata leva as causas. Derrubar a tabela é decisão separada: o
-- custo de deixá-la é zero e o de derrubá-la é irreversível.

ALTER TABLE "ruptura_evento"
  ADD COLUMN IF NOT EXISTS "arvore_evidencias" JSONB;

ALTER TABLE "ruptura_evento"
  ALTER COLUMN "dias_explicados" DROP NOT NULL;
