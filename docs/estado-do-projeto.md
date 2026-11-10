# Estado do projeto — retomada de contexto

> **Última atualização:** 10/11/2026 · commit `c63db22` · branch `main`, limpo
> e sincronizado com `origin/main`.

Este documento existe para que o trabalho continue em outra máquina, ou em outra
sessão, sem perder o que já foi decidido. Ele é o **primeiro arquivo a ler**.

O que ele cobre: como montar o ambiente, o que acabou de ser feito, o que está
pendente e **as armadilhas desta base** — as que já custaram tempo e que o
código não revela por si.

> ℹ️ **A memória automática do assistente não viaja com o repositório.** Ela
> fica em `~/.claude/projects/…/memory/` na máquina onde foi escrita. Os quatro
> registros que existiam lá foram transportados para a seção
> [Armadilhas desta base](#armadilhas-desta-base). Se uma nova armadilha
> aparecer, o lugar dela é aqui, não só na memória local.

---

## Sumário

- [Montar o ambiente numa máquina nova](#montar-o-ambiente-numa-máquina-nova)
- [Onde o projeto está](#onde-o-projeto-está)
- [O que foi feito nas últimas sessões](#o-que-foi-feito-nas-últimas-sessões)
- [Pendências](#pendências)
- [Armadilhas desta base](#armadilhas-desta-base)
- [Como trabalhar neste projeto](#como-trabalhar-neste-projeto)

---

## Montar o ambiente numa máquina nova

### 1. Código

```bash
git clone https://github.com/wagngomes/DRP_APP.git DRP_AI
cd DRP_AI
npm ci
npx prisma generate
```

Node 22. A máquina anterior usava 22.14.0.

### 2. Banco local

Na máquina anterior era **PostgreSQL 17 nativo no Windows** (serviço
`postgresql-x64-17`), sem Docker. As ferramentas de linha de comando ficam em
`C:\Program Files\PostgreSQL\17\bin` e **não estão no PATH** — chame-as pelo
caminho completo.

Alternativa igualmente válida, e mais simples de reproduzir: subir só o banco
pelo compose do projeto.

```bash
docker compose up banco
```

### 3. `.env`

Não está no repositório e não deve estar. Parta de
[`env.example`](../env.example) e preencha. Para desenvolvimento, o mínimo é
`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`,
`ORIGENS_CONFIAVEIS` e `EMAIL_DOMINIOS_PERMITIDOS`.

Gerar o segredo:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

> **Nunca** cole o conteúdo de um `.env` numa conversa com o assistente. Ele
> guarda `BETTER_AUTH_SECRET`, `RESEND_API_KEY` e `ANTHROPIC_API_KEY`.

### 4. Migrations

```bash
npx tsx --env-file=.env scripts/aplicar-migration.ts <timestamp>_<nome>
```

Uma por vez, na ordem de `prisma/migrations/`. São 14. **Nunca**
`prisma migrate dev` nem `prisma migrate reset` — ver
[Armadilhas](#nunca-rodar-prisma-migrate-dev).

### 5. Dados reais para desenvolver

Sem dados, metade do trabalho não pode ser verificada: as consultas são SQL
agregado e os números só fazem sentido contra a base de verdade. O caminho é
trazer um dump de produção para o banco local.

**Na VPS:**

```bash
ssh drp@wagngodrp.tech
cd /opt/drp

docker compose exec backup ls -lh /backups        # escolha o mais recente
docker compose cp backup:/backups/<arquivo>.dump /tmp/drp.dump
```

**Na máquina local:**

```bash
scp drp@wagngodrp.tech:/tmp/drp.dump .

"C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" \
  -h localhost -U drp -d drp_ai --clean --if-exists drp.dump
```

Depois, **apague o `/tmp/drp.dump` da VPS** — é a base inteira num diretório
legível.

> O dump é só leitura em produção: `pg_dump` não altera nada, e o serviço
> `backup` já roda sozinho a cada 24h. Copiar e restaurar localmente não toca
> em produção.

> ⚠️ **Nunca aponte ferramenta de desenvolvimento para o banco de produção.**
> `processar()` do diagnóstico apaga e reescreve `ruptura_evento`;
> `aplicar-migration.ts` roda DDL; e o usuário do banco em produção é
> superusuário. A porta do Postgres de produção não é publicada, de propósito.

### 6. Conferir que está tudo de pé

```bash
npm run typecheck && npm test && npm run lint && npm run build
npm run dev
```

---

## Onde o projeto está

Em produção e em uso. `https://wagngodrp.tech`, VPS Hostinger
(2 vCPU, 8 GB), Docker Compose atrás de nginx com TLS.

| | |
|---|---|
| Repositório | `github.com/wagngomes/DRP_APP` (branch `main`) |
| Atualizar produção | `cd /opt/drp && bash deploy/atualizar.sh` |
| Domínio | `wagngodrp.tech` — use o **nome**, não IP decorado (ver [armadilhas](#ip-da-vps-muda)) |
| Tamanho | 26 páginas, 28 models, 14 migrations, 46 arquivos de teste (423 testes) |

Visão geral do produto, da arquitetura e dos conceitos de domínio:
[`README.md`](../README.md).

---

## O que foi feito nas últimas sessões

Em ordem inversa. Só o que ainda tem consequência; o histórico completo está no
`git log`.

### `c63db22` — Novas aberturas: recortes de BU, CD e laboratório

Os três filtros na seção "Novas aberturas", no padrão das outras telas.

A decisão que importa: os filtros têm **parâmetros próprios** (`abBu`, `abFil`,
`abFor`), e não os da lista de ruptura ao lado. O universo é outro — a seção
compara duas cargas de forecast e responde antes de o motor de diagnóstico ter
rodado, e um laboratório pode ter abertura nova sem ter uma única ruptura.

Cada lista de opção é apurada **sem o próprio filtro**, para o número no chip
antecipar o resultado do clique. Medido contra a base restaurada: a soma dos
chips bate com o total (1.050), e os chips de 123 e 54 entregaram 123 e 54.
Total e as três listas saem de uma consulta só, com `recorte` materializado.

**Não foi visto renderizado.** Verificação de compilação por requisição ao
servidor de dev (307 → `/login`, vindo do `exigirSessao()`, pois o projeto não
tem middleware) e de dados por script contra o banco. O JSX nunca desenhou numa
tela.

### `dfc3c8f` — Seção "Novas aberturas" no diagnóstico de ruptura

A seção em si: dois datepickers, comparação de `forecast_m0_atualizado` entre
duas cargas, estoque disponível, pedidos e transferências a caminho no mesmo
workflow da tela de produto, e a data em que o forecast foi criado.

Três decisões com medição por trás, todas documentadas no cabeçalho de
[`src/lib/diagnostico-ruptura/novas-aberturas.ts`](../src/lib/diagnostico-ruptura/novas-aberturas.ts):

1. **Compara duas cargas, não dois meses.** O fato acontece de uma importação
   para a outra.
2. **A data de criação é subconsulta correlacionada, não `JOIN`.** Com `JOIN` e
   `GROUP BY` a mesma resposta levava 23s contra 165ms — o planner trocava o
   índice por varredura completa.
3. **A janela padrão é de ~30 dias, não o último par de cargas.** Entre cargas
   consecutivas o resultado é zero em 7 dos 10 pares de outubro, porque forecast
   novo entra em lote. Abrir a tela com "nenhuma abertura" seria verdade e
   inútil.

Tem também um **aviso de carga magra**: carga inicial com menos de 90% das
posições da final produz aberturas que não aconteceram. Em 19/10 a base trouxe
6.940 posições contra 8.237 no dia seguinte, e a diferença virou 1.335
"aberturas" falsas. A tela avisa quando isso acontece.

### Diagnóstico de ruptura — correções anteriores

`6d67d25`, `5d5effb`, `f13a478`, `8bf90a4`: causalidade invertida na árvore,
par de filiais inativo virando acusação, percurso realizado da mercadoria.
A árvore vigente está em [`arvore-diagnostico.md`](arvore-diagnostico.md).

---

## Pendências

### Bloqueador de dados — resolver primeiro

**100% das linhas de `historico_vendas` de outubro/2026 têm `filial` NULL**
(109.784 linhas). Não há FK na coluna, então a importação aceitou — é
descasamento de cabeçalho no CSV de origem.

Consequência: `carregarVendas` e `vendaDoMesAnterior` filtram
`filial IS NOT NULL`, então "venda do mês anterior" fica **zero para toda
posição** assim que a data de referência passar para novembro. O diagnóstico de
ruptura vai acusar as causas erradas sem avisar.

→ **Reimportar outubro de `historico_vendas` com a coluna FILIAL.** É
pré-requisito dos quatro itens seguintes.

### Diagnóstico de ruptura — quatro itens aguardando decisão

Apresentados ao usuário, nenhum escolhido ainda:

1. **Reprocessar os eventos** depois da reimportação. Os eventos atuais foram
   calculados em 23/10 14:46, quando `historico_vendas` só alcançava 30/09 — o
   replay rodou com consumo zero, o que explica os selos de "balanço não fecha".
2. **Gravar a data de referência em `ruptura_evento`** e avisar na tela quando
   ela diverge da data atual do sistema.
3. **Nomear o mês no texto da evidência.** Hoje a frase cita números de setembro
   enquanto o gráfico mostra outubro e novembro, sem dizer qual é qual.
4. **Desenhar as saídas no gráfico** de dente de serra.

### Decisões oferecidas e não tomadas

| Assunto | Situação |
|---|---|
| `clientes_grupos` com grupos divergentes | 6 CNPJs em que o `DISTINCT ON` escolhe arbitrariamente por falta de critério de desempate no `ORDER BY` — notadamente `REDE DOR` vs `SUL AMERICA`. Corrigir na origem ou adicionar desempate determinístico. |
| Limpar `contratos`/`sop` por competência | Agosto e setembro compartilham o snapshot 24/09, então a tela atual não consegue separá-los. |
| `known_hosts` com o IP antigo da VPS | Entradas obsoletas de `2.25.155.34`. |
| Chave SSH para a VPS | Hoje o acesso é por senha. |

### Carregadas de sessões anteriores

- Arquivo de CNPJ para Insuma / Operadoras.
- Alinhar a venda M0 da tela de produto com `historico_vendas`.
- `carregarSla()`: o fallback para SLA inativo afeta 10 de 81 pares.
- Mapeamento MAT/MED para PREVENA, DERMATOLOGIA, Especialidades, TECNOCOLD.
- `7% Nacional` vs `Nacional 7%` divergindo na Visão Geral.
- 11 pares de SLA a cadastrar.
- Reimportar `plano_compra` do mês órfão.

### Dívida estrutural — decisão adiada pelo usuário

Medida em 06/10/2026. O usuário pediu para **não executar nada** ("o sistema
está funcionando muito bem"). Retomar só quando ele trouxer o assunto.

1. **O universo item × CD não tem dono.** Onze módulos montam o join
   `forecast` + `simulador`, e oito definem predicados diferentes: cinco aplicam
   `torreValidaSql` e `forecast_m0 > 0`, três não. Parte é legítima (a tela de
   produto não deve esconder CD por torre), mas nada no código declara a
   intenção, então não se separa decisão de esquecimento sem perguntar caso a
   caso. **É o único item que produz número errado** — o bug de torre corrigido
   na aceleração era exatamente disso, e foi corrigido em um dos onze.
2. `diasDeEstoque()` existe em `utils` com 2 consumidores, enquanto
   `forecast / DIAS_NO_MES` aparece à mão em 7 lugares. Hoje todos calculam
   igual — sorte, não garantia.
3. Formatadores espalhados: `num()` em 11 arquivos com 3 implementações
   (divergem só em meio negativo), `dataBr()` em 11 com 5 (divergência
   cosmética), `moeda()` em 6 com 2.
4. Encanamento repetido em 25 páginas e funções longas (`ImportTabPanel` 776
   linhas, `carregarRaioX` 358 com 8 consultas).

**Por quê isto não é falta de abstração:** os blocos compartilhados
(`snapshotMensalSql`, `somaSql`, `COLUNAS_ESTOQUE_CHAO`) já têm 11–12
consumidores. O que é copiado é a receita, não os ingredientes — o problema é
abstração no nível errado.

**Caminho acordado, se for retomado:** unificar os onze de uma vez é a forma
mais fácil de criar bug novo. Construir a função com as diferenças como opções
explícitas, migrar **um** módulo, conferir contra o banco que os números não
mudaram, e só então seguir.

### Faxina

- `rm /tmp/drp.dump` na VPS.
- `README-operacao.md` manda `cp .env.example .env`, mas o arquivo é
  `env.example` (sem ponto).

---

## Armadilhas desta base

As que já custaram tempo. Cada uma imita um bug de código e leva a investigar o
lugar errado.

### Reimportar Produtos zera o `codigo` de cinco tabelas

Reimportar **Produtos** pela tela `/uploads` apaga a coluna `codigo` de
`Fiscal`, `PedidosDeCompra`, `Forecast`, `PlanoCompra` e
`TransferenciasAbertas`. O simulador não é afetado (não tem a relação).

**Por quê:** o import de Produtos apaga a tabela antes de inserir, e cada uma
dessas cinco tem `onDelete: SetNull` na relação. O DELETE dispara o SetNull e o
Postgres apaga em cascata, **sem erro e sem aviso**. Diagnosticado em
04/09/2026: Produtos foi reimportada às 17:08 e todos os snapshots de forecast
(inclusive o de 26/08) apareceram com `count(codigo) = 0`.

**Como reconhecer:** tela vazia, ou universo despencando para 1 linha, logo
depois de um upload. Um `GROUP BY codigo` com tudo nulo colapsa em uma linha só.
Confira `count(codigo)` por snapshot nessas cinco tabelas **antes** de procurar
bug na consulta.

**Recuperação:** reimportar os arquivos das cinco tabelas. A correção estrutural
é remover o `onDelete: SetNull` — snapshot é registro histórico e não deve ser
mutado quando o catálogo é atualizado.

### Abertura de forecast: sempre contra o snapshot anterior

A causa `nova_abertura` compara cada carga com a **importação imediatamente
anterior**. Nunca com a abertura do mês, nunca com uma janela de N dias.

**Por quê:** é assim que o fato acontece na operação — ontem aquele CD não tinha
previsão, hoje tem, e o item nasce rompido porque não houve prazo para comprar.
O usuário repetiu a regra duas vezes em 10/10/2026, depois de uma primeira
medição contra a carga de 30 dias antes ter devolvido zero e levado à conclusão
errada de que o fenômeno não existia.

**Como aplicar:** `LAG(data_snapshot) OVER (ORDER BY data_snapshot)` sobre as
cargas de forecast, marcando a posição quando o forecast anterior era zero ou a
linha não existia. Só cargas com `codigo IS NOT NULL` entram na comparação —
senão a carga de 26/08/2026, com 16.178 códigos nulos, faria toda posição
parecer aberta no dia seguinte. Implementado em
[`abertura.ts`](../src/lib/diagnostico-ruptura/abertura.ts), função
`aberturasDeForecast`.

> A seção "Novas aberturas" da tela é outra coisa: ali o usuário escolhe as duas
> cargas. A regra acima vale para a **causa** da árvore, que é automática.

### Disco cheio quebra o Turbopack em silêncio

A máquina anterior vivia perto de zero byte livre no `C:`. Quando enche, o
`next dev` **não acusa erro**: continua respondendo, mas serve rotas antigas e
não compila arquivos novos — uma página recém-criada devolve o resultado errado
como se o código estivesse quebrado.

Já custou tempo três vezes. Ao ver comportamento inexplicável do servidor de
dev, **checar o disco antes de depurar o código**.

Alvo seguro para liberar: `npm cache clean --force` (chegou a 10,9 GB, é 100%
regenerável e não toca no servidor rodando). Apagar `.next` também funciona, mas
**só com o servidor parado** — apagar com ele vivo corrompe o estado e derruba a
aplicação. Depois de esvaziar, reiniciar o servidor: ele não se recupera sozinho
do período degradado.

**Não confie no tamanho de `C:\Users`**: o OneDrive aparece com dezenas de GB
que são marcadores na nuvem, não arquivos reais. Confira o atributo `Offline`
antes de concluir que há o que apagar ali.

### Falta de memória se disfarça de erro de código

Na máquina anterior, com os servidores de dev no ar, o commit do Windows chegava
a 29,78 de 30,81 GB. Sintomas observados, todos sem relação com o código:

- `npm run build` morrendo em "Running TypeScript", **depois** de logar
  `✓ Compiled successfully`;
- `memory allocation of 42432 bytes failed` do Turbopack, antes de compilar;
- `npx tsc --noEmit` saindo com código 3 ou 134;
- Postgres com `could not reattach to shared memory (key=…): error code 1455`;
- `vitest` levando 496s para rodar 2,1s de testes — o resto era paginação.

O maior consumidor **não eram os servidores de dev** (1,5 GB), e sim um
`svchost` com 11,3 GB: o serviço **StorSvc** (Serviço de Armazenamento), um
vazamento conhecido do Windows. `Restart-Service StorSvc` como administrador
devolve esses GB.

Antes de culpar o código: `Get-CimInstance Win32_OperatingSystem` para o commit
livre, e `Get-Process | Sort PrivateMemorySize64 -Desc` para achar o culpado.

### Nunca rodar `prisma migrate dev`

Nem `prisma migrate reset`. O histórico de migrations do banco diverge do
diretório desde o baseline de 11/09/2026, e os dois comandos propõem **resetar o
schema** — o que apagaria as bases importadas.

Use `scripts/aplicar-migration.ts`, que aplica o SQL escrito à mão e o registra
no histórico do Prisma.

### IP da VPS muda

Uma sessão perdeu tempo usando `2.25.155.34`, decorado do `known_hosts`. O
endereço na época era `2.25.208.105`. **Use sempre o nome** `wagngodrp.tech`.

### Nome do model no Prisma Client

O model `ConfiguracaoSistema` é `prisma.configuracaoSistema` no cliente, não
`prisma.configuracao_sistema`. O erro aparece como `undefined`, não como erro de
tipo.

### `tsx` não carrega `.env`

Todo script precisa de `--env-file=.env`, senão o Postgres reclama que
"client password must be a string".

---

## Como trabalhar neste projeto

### Idioma

**Tudo em português**: código, identificadores, comentários, mensagens de
commit, UI e conversa. O usuário escreve em português.

### Comentários e mensagens de commit

O padrão do repositório é alto e deliberado: **o comentário explica a decisão e
a medição que a sustenta**, não o que o código faz. Exemplos do que já está lá:

> A data de criação é subconsulta correlacionada e não um `JOIN` — com `JOIN` e
> `GROUP BY` a mesma resposta levava 23s, contra 165ms assim, porque o planner
> trocava o índice por varredura da tabela inteira.

> O início padrão olha ~30 dias para trás, e não a carga imediatamente anterior.
> Medido nesta base: entre duas cargas consecutivas o resultado é zero em 7 dos
> 10 pares de outubro, porque forecast novo entra em lote.

Mensagem de commit: título curto no imperativo, corpo explicando a decisão, com
os números que a sustentam.

### Verificação

Os quatro portões, antes de commitar:

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Eles **não** cobrem SQL nem renderização. Consulta nova se verifica rodando
contra o banco restaurado — escreva um script em `scripts/`, rode, apague.
Tela nova se verifica abrindo a tela.

**Relate o que ficou sem verificar.** Se a tela nunca foi aberta, diga isso. O
usuário prefere saber que a primeira abertura em produção é o primeiro teste
visual do que receber "está pronto" sem ressalva.

### Limites que não se contornam

- Não forjar credencial de sessão para renderizar página protegida. Uma
  tentativa de gerar cookie do Better Auth foi barrada e não deve ser
  contornada.
- Não colar conteúdo de `.env` na conversa.
- Não apontar ferramenta de desenvolvimento para o banco de produção.
- Não ligar `EXIGIR_EMAIL_VERIFICADO` antes de o envio de e-mail funcionar
  **e** as contas existentes estarem marcadas como verificadas.
- Domínios de e-mail da empresa: `@mafrasaude.com.br`, `@viveo.com.br`.

### E uma frase do usuário que vale guardar

> "a base de produção é outra"

Medição feita no banco local **descreve o banco local**. Ao reportar número,
diga de onde ele veio.
