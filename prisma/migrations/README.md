# Migrations

Uma migration só: `20260911180000_baseline`, que cria o schema inteiro a partir
de um banco vazio.

## Por que foi refeita

As 18 migrations anteriores paravam em **07/08/2026**. A partir dali o
desenvolvimento seguiu com `prisma db push`, que altera o banco sem registrar
migration — e quatro tabelas (`cenario_salvo`, `analise_ia`,
`lead_time_fornecedor`, `tarefa_cockpit`), a coluna `user.role` e os índices
compostos ficaram de fora do histórico.

O efeito prático apareceria só na primeira subida em produção: `prisma migrate
deploy` num banco vazio criaria o schema de agosto, a aplicação subiria sem
erro e quebraria na primeira consulta — com uma mensagem sobre tabela
inexistente, longe da causa.

Como produção nasce vazia, o histórico granular não tinha valor: ninguém
precisa reconstituir o estado de 28/07. Uma baseline resolve e é conferível.

## Como foi conferida

O SQL foi gerado por dois caminhos independentes e comparado:

```bash
prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script
prisma migrate diff --from-empty --to-config-datasource --script
```

O primeiro parte do `schema.prisma`; o segundo, do banco de desenvolvimento em
uso. Normalizando qualificação de schema e ordenação de índice, as **437
definições são idênticas** — a baseline reproduz exatamente o banco contra o
qual a aplicação roda hoje.

## Daqui para frente

Mudança de schema volta a passar por migration:

```bash
npx prisma migrate dev --name descricao_curta
```

`db push` continua servindo para experimentar, mas o que for para produção
precisa virar migration antes do commit — senão o buraco se abre de novo, e a
próxima vez que ele aparecer será num banco que já tem dados.

## O banco de desenvolvimento

Não foi tocado. Ele já está no estado final (foi o `db push` que o levou até
lá), e o `_prisma_migrations` dele ainda lista as 18 antigas. Como o
desenvolvimento não roda `migrate deploy`, isso é inofensivo. Se um dia
incomodar, `prisma migrate resolve --applied 20260911180000_baseline` acerta o
registro.
