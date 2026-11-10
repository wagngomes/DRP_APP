# DRP_AI

Sistema de planejamento de distribuição (DRP) para a rede de centros de
distribuição da Mafra Saúde / Viveo.

Consolida as bases diárias da operação — estoque, pedidos de compra,
transferências em trânsito, forecast, plano de compras, recebimentos e vendas —
e responde três perguntas que hoje só se responderiam cruzando planilhas à mão:

- **Quando a mercadoria chega**, projetando a rota completa de cada pedido e de
  cada transferência, trecho por trecho, com as datas previstas em cada CD.
- **Onde vai faltar**, em dias de cobertura por item × CD, antes de faltar.
- **Por que faltou**, atribuindo a cada ruptura uma causa com a prova dela e um
  dono (planejamento, compras, fornecedor, logística ou demanda).

> **Status:** em produção, em uso pela operação. Evolução contínua, sem
> versionamento semântico — a referência é o histórico do `main`.

---

## Sumário

- [Stack](#stack)
- [Começando](#começando)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Arquitetura](#arquitetura)
- [Conceitos de domínio](#conceitos-de-domínio)
- [Importação de dados](#importação-de-dados)
- [Telas](#telas)
- [Comandos](#comandos)
- [Testes e qualidade](#testes-e-qualidade)
- [Banco de dados e migrations](#banco-de-dados-e-migrations)
- [Deploy](#deploy)
- [Convenções](#convenções)
- [Documentação relacionada](#documentação-relacionada)
- [Limitações conhecidas](#limitações-conhecidas)

---

## Stack

| Camada | Escolha |
|---|---|
| Runtime | Node 22 |
| Framework | Next.js 16 (App Router, Turbopack), React 19 |
| Linguagem | TypeScript (strict) |
| Banco | PostgreSQL 16 |
| ORM | Prisma 7 com driver adapter (`@prisma/adapter-pg`) |
| Autenticação | Better Auth (e-mail e senha, sessões no Postgres) |
| UI | Tailwind CSS 4, shadcn/ui sobre Base UI, Lucide |
| Validação | Zod em toda entrada |
| E-mail | Resend |
| IA | SDK da Anthropic (texto sobre resultado já calculado) |
| Testes | Vitest |
| Observabilidade | `prom-client`, Prometheus e Grafana (perfil opcional) |
| Empacotamento | Docker e Docker Compose |

Não há CI configurado. Os portões de qualidade rodam localmente, antes do
commit — ver [Testes e qualidade](#testes-e-qualidade).

---

## Começando

### Com Docker (caminho recomendado)

```bash
cp env.example .env         # e preencha os segredos
docker compose up
```

Sobe banco, aplica as migrations e inicia a aplicação **nessa ordem**, garantida
por condição de saúde e não por espera. A aplicação fica em
http://localhost:3000.

Com o painel de métricas:

```bash
docker compose --profile observabilidade up
```

### Sem Docker

Requer um PostgreSQL acessível e o `DATABASE_URL` apontando para ele.

```bash
npm ci
npx prisma generate
npm run dev
```

As migrations **não** são aplicadas por `prisma migrate dev` neste projeto —
veja [Banco de dados e migrations](#banco-de-dados-e-migrations).

### Primeiro acesso

A conta nasce como consulta. Para promover a administrador:

```bash
npm run admin -- voce@suaempresa.com.br
```

Em produção, pelo banco do contêiner — o procedimento está em
[`deploy/README.md`](deploy/README.md).

---

## Variáveis de ambiente

Partem de [`env.example`](env.example). Os arquivos `.env*` estão no
`.gitignore` e **nunca** devem ser commitados.

| Variável | Obrigatória | Para quê |
|---|---|---|
| `DATABASE_URL` | sim | Conexão Postgres. No compose o host é `banco`, não `localhost`. |
| `BETTER_AUTH_SECRET` | sim | Assinatura da sessão. ≥ 32 bytes aleatórios, único por ambiente. |
| `BETTER_AUTH_URL` | sim | URL pública. Com `https://` — é daí que o cookie de sessão vira `secure`. |
| `NEXT_PUBLIC_APP_URL` | sim | URL pública exposta ao cliente. |
| `ORIGENS_CONFIAVEIS` | sim | Origens aceitas. Nunca `*`. |
| `EMAIL_DOMINIOS_PERMITIDOS` | sim | Domínios que podem criar conta. **Vazio libera a internet inteira.** |
| `EXIGIR_EMAIL_VERIFICADO` | não | Ver o aviso em [Limitações conhecidas](#limitações-conhecidas) antes de ligar. |
| `RESEND_API_KEY`, `EMAIL_FROM` | não | Envio de e-mail (recuperação de senha, convites). |
| `ANTHROPIC_API_KEY` | não | Textos de análise gerados por IA. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | compose | Banco do compose. |
| `APP_PORT`, `APP_BIND` | compose | Publicação da aplicação. `APP_BIND=127.0.0.1` em produção. |
| `GRAFANA_*`, `BACKUP_*`, `TZ`, `NODE_OPTIONS` | compose | Painel, backup e runtime. |

---

## Arquitetura

Aplicação Next.js monolítica. As páginas são **componentes de servidor**
`force-dynamic`: consultam o Postgres no request e devolvem HTML. Não há camada
de API intermediária para as telas — as rotas em `src/app/api/` existem só para
autenticação, importação, exportação, saúde, métricas e OpenAPI.

O cálculo pesado não roda no request. Ou é SQL agregado no banco, ou é um motor
disparado sob demanda (`/diagnostico-ruptura`) que grava o resultado em tabela.

```
src/
├── app/                      # rotas (App Router) — 26 páginas, 10 rotas de API
├── components/
│   ├── ui/                   # shadcn/ui
│   ├── layout/               # casca, sidebar, tema
│   └── <domínio>/            # componentes por tela
├── lib/                      # acesso a dados e regras, um diretório por domínio
│   ├── imports/              # motor de importação de CSV (config, parse, COPY)
│   ├── diagnostico-ruptura/  # árvore de decisão, evidências, replay
│   ├── transferencias/       # SLA, rótulos de filial, consultas
│   └── …
├── utils/                    # funções puras, testáveis, sem I/O
└── prisma.ts                 # cliente único
prisma/
├── schema.prisma             # 28 models
└── migrations/               # 14, escritas à mão
scripts/                      # importação por linha de comando, migrations, admin
deploy/                       # nginx, firewall, script de atualização
docs/                         # documentação de domínio
```

### A fronteira servidor → cliente

Props atravessam serializadas, e **função não serializa**. O TypeScript aceita;
a tela quebra em uso. Já aconteceu três vezes neste projeto, então existe um
teste que varre o código e falha quando um componente de servidor passa função
a um componente cliente, ou quando um componente cliente importa módulo que só
roda no servidor: [`src/lib/fronteira-cliente.test.ts`](src/lib/fronteira-cliente.test.ts).

A correção é sempre a mesma: passar dado pronto — a URL já montada, o rótulo já
escrito — em vez da função que o produz.

---

## Conceitos de domínio

Quatro ideias explicam a maior parte do código. Sem elas, as consultas parecem
arbitrárias.

### 1. Data de referência

Várias bases são **cumulativas**: cada importação acrescenta um retrato do dia
sem apagar os anteriores. Por isso o sistema tem uma data de referência global,
definida pelo administrador no **Painel**, e toda consulta se recorta por ela.

O regime varia por tabela — dia, mês, ou nenhum. Ver
[Importação de dados](#importação-de-dados).

### 2. CDs virtuais (armazém 11)

Todo CD cujo código começa em `90` é o mesmo local físico do `10`
correspondente (9002 ↔ 1002), mas com estoque e venda próprios. A base nunca
traz uma linha `9002`: traz `1002` com valor nas colunas do armazém 11, e é
esse valor que pertence ao 9002.

A separação existe em **um único lugar**,
[`src/utils/cds-virtuais.ts`](src/utils/cds-virtuais.ts). A função
`simuladorPorCd()` gera a origem que todas as consultas usam no lugar da tabela
crua — as consultas não sabem que a divisão existe. Para mudar a regra (outro
prefixo, outro armazém, mais colunas), mexe-se só nesse arquivo.

### 3. Projeção de rotas

Pedidos de compra e transferências podem ir direto ao destino ou percorrer uma
rota de triangulação (`DF2 > CAJ > ES > LDA`). O cálculo:

1. Converte as siglas da rota em códigos de filial (tabela `Filiais`).
2. Descobre **em que trecho a carga está**, comparando origem e destino da
   linha com a sequência da rota.
3. Soma os lead times em dias úteis de `SlaTransferencias`, trecho por trecho,
   produzindo a data prevista em cada CD até o destino final.
4. O CD final é a última filial da rota — não o destino do trecho atual. É lá
   que a mercadoria entra no estoque.

Quando a data prevista já venceu, a carga é **reprojetada** a partir de um
parâmetro em dias definido no Painel (um para transferências, outro para
pedidos: um caminhão parado e um pedido atrasado têm causas diferentes).

Código em [`src/utils/projecao-transferencias.ts`](src/utils/projecao-transferencias.ts)
e [`src/utils/projecao-pedidos.ts`](src/utils/projecao-pedidos.ts).

### 4. Dias de cobertura

Duas medidas, em [`src/utils/dias-estoque.ts`](src/utils/dias-estoque.ts):

- **Estoque chão** — o que está fisicamente disponível no CD.
- **Estoque total** — somando o que está a caminho.

Ambas divididas pelo ritmo diário (`forecast_m0 / 30`). As faixas de cor são as
mesmas em todo o sistema: preto (zero), vermelho (< 10), amarelo (10–20), verde
(20–30), azul (30–60), roxo (≥ 60).

### 5. Diagnóstico de ruptura

Para cada posição item × CD rompida na data de referência, uma árvore de decisão
determinística atribui **uma** causa, na ordem em que as perguntas são feitas, e
guarda a prova de cada resposta. A IA não decide a causa — só escreve texto
sobre o resultado.

A árvore completa, com o motivo de cada nó, está em
[`docs/arvore-diagnostico.md`](docs/arvore-diagnostico.md). O PRD que originou o
módulo está em [`root-cause.md`](root-cause.md).

O motor roda **sob demanda** (botão "recalcular", só para administradores) e
grava em `RupturaEvento`. Não roda no fim da importação: a carga diária continua
com a duração de sempre, e uma falha no motor nunca derruba o que está no ar.

---

## Importação de dados

Tudo entra por CSV, pela tela `/uploads` — uma guia por tabela, com importar,
limpar e a tabela paginada — ou pela linha de comando:

```bash
npx tsx --env-file=.env scripts/importar-csv.ts <modelo> <arquivo.csv> [aaaa-mm-dd]
```

A data é opcional e define o snapshot da carga; sem ela, vale a data resolvida
pelo próprio import. A gravação usa `COPY` via `pg-copy-streams`, não `INSERT` em laço. A
configuração de cada modelo — colunas, tipos, regime de snapshot, chave de
atualização — está em [`src/lib/imports/config.ts`](src/lib/imports/config.ts),
que é a fonte única da verdade sobre isto.

| Tabela | Regime | O que acontece ao importar |
|---|---|---|
| Produtos | catálogo | Substitui pela chave `codigo` |
| Fiscal | catálogo | Substitui |
| Rotas | catálogo | Substitui pela chave `codigo_rota` |
| Filiais | catálogo | Substitui pela chave `codigo` |
| Fornecedores | catálogo | Substitui pela chave `fornecedor` |
| Lead Time Fornecedor | catálogo | Substitui |
| SLA Transferências | catálogo | Substitui |
| Pedidos de Compra | cumulativo · dia | Acrescenta o retrato do dia |
| Simulador | cumulativo · dia | Acrescenta o retrato do dia |
| Transferências Abertas | cumulativo · dia | Acrescenta o retrato do dia |
| Forecast | cumulativo · mês | Acrescenta; consulta usa o mês da referência |
| Plano de Compra | cumulativo · mês | Acrescenta |
| Clientes / Grupos | cumulativo · mês | Acrescenta; consulta usa a carga vigente |
| Contratos | cumulativo · mês (`competencia`) | **Acrescenta sem deduplicar** |
| SOP | cumulativo · mês (`competencia`) | **Acrescenta sem deduplicar** |
| Recebimento | incremental | Substitui só as datas presentes no arquivo |
| Histórico de Vendas | incremental | Substitui só as datas presentes no arquivo |

Duas consequências práticas:

- **Cumulativo não apaga.** Subir só o mês corrente de `Contratos`, `SOP`,
  `Forecast` ou `Plano de Compra` preserva os meses anteriores. Consultar um mês
  passado continua lendo a carga daquele mês.
- `Contratos` e `SOP` não têm chave de atualização. Reimportar a **mesma**
  competência duplica as linhas em silêncio.

> ⚠️ **Reimportar Produtos zera o `codigo` de cinco tabelas.** O import apaga a
> tabela antes de inserir, e `Fiscal`, `PedidosDeCompra`, `Forecast`,
> `PlanoCompra` e `TransferenciasAbertas` têm `onDelete: SetNull` na relação. O
> Postgres apaga em cascata, sem erro e sem aviso. Se uma tela ficar vazia logo
> depois de um upload, confira `count(codigo)` por snapshot antes de procurar
> bug na consulta. Detalhes e recuperação em
> [`docs/estado-do-projeto.md`](docs/estado-do-projeto.md).

---

## Telas

Os rótulos abaixo são os da navegação, em `src/components/layout/dashboard-shell.tsx`.

| Rota | Rótulo | O que mostra |
|---|---|---|
| `/` | Painel | **Onde se define a data de referência** e os parâmetros de projeção e cobertura (admin) |
| `/cockpit` | Cockpit | Pauta do dia: tarefas e prioridades |
| `/visao-geral` | Visão geral | Estoque, vendas, compras e transferências por CD, com perfil tributário |
| `/disponibilidade` | Disponibilidade | Dias de cobertura por CD, em barras 100% empilhadas por faixa |
| `/disponibilidade/tabela` | — | O mesmo recorte em tabela |
| `/aceleracao` | Aceleração | Itens cujo ritmo de venda acelerou |
| `/diagnostico-ruptura` | Diagnóstico de ruptura | Causa raiz por posição, com a prova, e novas aberturas de forecast |
| `/compras-urgentes` | Compras urgentes | O que precisa de pedido agora |
| `/transferencias` · `/triangulacoes` | Transferências · Triangulações | Trânsito e rotas com datas projetadas |
| `/triangulacoes/gerencial` | Tracking | Visão gerencial das triangulações, exportável para Excel |
| `/recebimentos` | Recebimentos | Entradas e lead time realizado |
| `/colocacao` | Colocação | Sugestão de compra |
| `/produto` · `/produto/[codigo]` | Produto | Ficha completa: plano, pedidos, transferências e posição por CD |
| `/raio-x` | Raio-X | Visão item por item, cruzando todas as bases |
| `/fornecedores` | Fornecedores | Rupturas por fornecedor, classificadas pelo que chega primeiro |
| `/cenarios` | Cenários | Simulações salvas, exportáveis para Excel |
| `/uploads` | Importar CSV | Importação, uma guia por tabela |
| `/usuarios` · `/console` | Usuários · Console SQL | Administração (admin) |
| `/regressao` | — | Fora da navegação; alcançada por URL |
| `/docs` | — | Documentação da API, gerada dos schemas Zod |

---

## Comandos

```bash
npm run dev           # desenvolvimento
npm run build         # build de produção
npm start             # servidor de produção
npm test              # Vitest, uma vez
npm run test:watch    # Vitest em modo contínuo
npm run typecheck     # tsc --noEmit
npm run lint          # ESLint
npm run admin -- <email>   # promove a administrador
npm run admin -- --listar  # lista as contas e seus papéis
```

Scripts pontuais em `scripts/`, sempre com `--env-file=.env` porque o `tsx` não
carrega `.env` por conta própria:

```bash
npx tsx --env-file=.env scripts/importar-csv.ts <modelo> <arquivo> [aaaa-mm-dd]
npx tsx --env-file=.env scripts/aplicar-migration.ts <nome_da_migration>
```

---

## Testes e qualidade

46 arquivos de teste, 423 testes. Vitest, sem banco: o que se testa é função
pura — projeção de rotas, dias de estoque, CDs virtuais, recorte de janela,
tributação, papéis — mais o teste estrutural da fronteira servidor → cliente.

Os quatro portões, antes de qualquer commit:

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

O que os testes **não** cobrem: SQL e renderização. Consulta nova se verifica
rodando contra o banco; tela nova, abrindo a tela. Uma mudança que passa nos
quatro portões e nunca foi aberta no navegador não está verificada — e dizer
isso explicitamente faz parte de entregar.

---

## Banco de dados e migrations

> ⚠️ **Nunca rode `prisma migrate dev` nem `prisma migrate reset`.** O histórico
> de migrations do banco diverge do diretório desde o baseline de 11/09/2026, e
> esses comandos propõem **resetar o schema** — o que apagaria as bases
> importadas.

As migrations são escritas à mão e registradas pelo script do projeto:

```bash
# 1. criar prisma/migrations/<timestamp>_<nome>/migration.sql
# 2. aplicar e registrar no histórico
npx tsx --env-file=.env scripts/aplicar-migration.ts <timestamp>_<nome>
npx prisma generate
```

No compose, um serviço dedicado aplica as migrations pendentes antes de a
aplicação subir.

---

## Deploy

VPS Ubuntu/Debian, Docker Compose atrás de nginx com TLS. A imagem carrega o
Next já compilado, então mudança de código só chega ao ar por reconstrução:

```bash
cd /opt/drp && bash deploy/atualizar.sh
```

O script traz o código, reconstrói, aplica migrations pendentes e **confere se o
sistema respondeu 200** — "o comando terminou" não é a mesma coisa que "está no
ar". Se não responder em dois minutos, ele falha e diz onde olhar.

| Mudou | Comando |
|---|---|
| Código (`src/`, `prisma/`) | `bash deploy/atualizar.sh` |
| Só o `.env` | `docker compose up -d` |
| Configuração do nginx | `nginx -t && systemctl reload nginx` |

A instalação do zero, com o porquê de cada passo, está em
[`deploy/README.md`](deploy/README.md). Operação do dia a dia — backup,
restauração, importação travada, métricas — em
[`README-operacao.md`](README-operacao.md).

---

## Convenções

- **Tudo em português**: código, comentários, commits, UI. Identificadores
  também (`carregarNovasAberturas`, `estoqueChao`).
- **Comentário explica o porquê, não o quê.** Em particular: a medição que
  motivou a escolha, e o que acontecia antes dela. Esse é o padrão do
  repositório — comentário que narra o código é ruído.
- **Preferir editar arquivo existente a criar novo.**
- **Zod em toda entrada**; `params` e `searchParams` sempre tipados.
- **Toda tabela paginada.**
- **Função pura vai para `utils/`** e ganha teste. É também o jeito de um
  componente cliente usar lógica sem importar módulo de servidor.
- **Autorização verificada no servidor** em toda rota e action, no início.
- Mensagem de commit: título curto no imperativo, corpo explicando a decisão e
  a medição que a sustenta.

Paleta: verde-água `#7FD9CD`, azul-petróleo `#16455C`, verde escuro `#2E9B7C`,
cinza-grafite `#2B2B2B`, cinza claro `#F5F5F5`.

---

## Documentação relacionada

| Arquivo | Conteúdo |
|---|---|
| [`docs/estado-do-projeto.md`](docs/estado-do-projeto.md) | **Estado atual, pendências e armadilhas desta base.** Comece por aqui ao retomar o trabalho. |
| [`docs/arvore-diagnostico.md`](docs/arvore-diagnostico.md) | A árvore de decisão do diagnóstico de ruptura, nó por nó |
| [`deploy/README.md`](deploy/README.md) | Instalação em produção, do zero |
| [`README-operacao.md`](README-operacao.md) | Operação: backup, recuperação, métricas, contas |
| [`root-cause.md`](root-cause.md) | PRD do módulo de diagnóstico |
| [`sec.md`](sec.md) | Checklist de segurança, com o que está pendente |
| [`CLAUDE.md`](CLAUDE.md) | Especificação das tarefas, na ordem em que foram pedidas |
| [`AGENTS.md`](AGENTS.md) | Aviso sobre a versão do Next.js |

---

## Limitações conhecidas

Levantadas e ainda abertas. Nenhuma impede operar; todas custam caro quando
descobertas na hora errada.

- **`EXIGIR_EMAIL_VERIFICADO` não pode ser ligado** antes de o domínio estar
  verificado no Resend **e** as contas existentes estarem marcadas como
  verificadas. Ligar antes tranca todo mundo do lado de fora, sem erro visível.
- **Usuário do banco é superusuário.** O correto é um usuário de migração com
  DDL e um de aplicação só com DML.
- **Backup mora na mesma máquina do banco.** Perder a VPS é perder os dois.
- **CSP com `unsafe-inline`** — remover exige nonce por requisição.
- **Sem trilha de auditoria e sem 2FA para administradores.**
- **`onDelete: SetNull` nas cinco relações com Produtos** — a correção
  estrutural é removê-lo: snapshot é registro histórico e não deve ser mutado
  quando o catálogo é atualizado.
- **O universo item × CD não tem dono.** Onze módulos montam o join
  `forecast` + `simulador` com predicados diferentes; parte da divergência é
  legítima, parte é esquecimento, e nada no código declara qual é qual. É o
  único item desta lista que produz número errado. Diagnóstico completo em
  [`docs/estado-do-projeto.md`](docs/estado-do-projeto.md).
