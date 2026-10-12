-- Árvore de decisão: o veredito, ao lado do contrafactual.
--
-- Escrita à mão, e não gerada por `prisma migrate dev`, pelo mesmo motivo de
-- `20261010120000_diagnostico_ruptura`: o histórico de migrations deste banco
-- diverge do diretório desde o baseline de 11/09, e o comando propõe resetar o
-- schema — o que apagaria as bases inteiras.
--
-- Só acrescenta colunas, todas opcionais e com `IF NOT EXISTS`. Nenhuma coluna
-- existente é alterada, nenhum dado é reescrito, e um evento já gravado
-- continua válido com as quatro colunas nulas: a rodada seguinte as preenche.
--
-- Por que gravar o veredito da árvore em vez de calculá-lo na tela: a rodada
-- custa doze segundos contra o banco remoto porque carrega sessenta dias de
-- cinco bases. A tela de diagnóstico lê só as tabelas do motor, e é a consulta
-- mais barata do sistema. Mover a árvore para a leitura jogaria esse custo
-- para dentro de cada request.

ALTER TABLE "ruptura_evento"
  ADD COLUMN IF NOT EXISTS "arvore_causa" TEXT,
  ADD COLUMN IF NOT EXISTS "arvore_incompleta" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "arvore_no_travou" TEXT,
  ADD COLUMN IF NOT EXISTS "arvore_trilha" JSONB;

-- Os chips da tela filtram por causa da árvore e contam por ela. Sem índice,
-- cada clique varre a tabela inteira.
CREATE INDEX IF NOT EXISTS "ruptura_evento_arvore_causa_idx"
  ON "ruptura_evento" ("arvore_causa");

-- "Onde falta consulta" é uma pergunta que a tela faz direto: agrupa os
-- eventos pelo nó que travou para dizer qual dado repor primeiro.
CREATE INDEX IF NOT EXISTS "ruptura_evento_arvore_no_travou_idx"
  ON "ruptura_evento" ("arvore_no_travou");
