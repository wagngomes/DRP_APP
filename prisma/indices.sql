-- Índices que o schema do Prisma não consegue declarar.
--
-- `prisma db push` faz o banco espelhar o schema e apaga índices que não estão
-- lá. Rode este arquivo depois de qualquer push:
--
--   node -e "require('fs');" # ver README, ou aplique via cliente SQL
--
-- Por que este índice existe: a tela de aceleração compara os dias 1..N de cada
-- mês. O filtro seletivo é o dia do mês, não a data — um índice comum em `data`
-- não serve, porque hoje o histórico inteiro cabe na janela. Com a expressão
-- indexada e as colunas agregadas em INCLUDE, o Postgres faz Index Only Scan e
-- não toca nos 226 MB da tabela: a consulta caiu de 1,9 s para 0,46 s.

CREATE INDEX IF NOT EXISTS historico_vendas_dia_mes_idx
    ON historico_vendas ((EXTRACT(day FROM data)), data)
    INCLUDE (cod_prod, cnpj, quantidade);
