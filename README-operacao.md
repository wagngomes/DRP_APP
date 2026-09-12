# Operação do DRP_AI

## Subir tudo localmente

```bash
cp .env.example .env      # e preencha BETTER_AUTH_SECRET
docker compose up
```

Sobe banco, aplica as migrations e inicia a aplicação, nessa ordem — a ordem é
garantida por condição de saúde, não por espera. A aplicação fica em
http://localhost:3000.

Com o painel de observabilidade:

```bash
docker compose --profile observabilidade up
```

Acrescenta Prometheus e Grafana. O painel já sobe provisionado em
http://localhost:3001 (usuário e senha em `.env`), na pasta **DRP_AI**.

## Endpoints de operação

| Rota | Para quê | Sessão |
|---|---|---|
| `/api/health` | Saúde com verificação de banco. Responde 503 se o banco não responde. | não |
| `/api/metrics` | Métricas no formato Prometheus. | não |
| `/api/openapi.json` | Especificação OpenAPI 3.0, gerada dos schemas Zod. | não |
| `/docs` | Documentação da API, renderizada no servidor. | não |

`/api/metrics` não é protegido por sessão de propósito: quem consulta é o
Prometheus, que não faz login. A proteção correta é de rede — no compose a porta
não é publicada, e em produção o endpoint fica atrás do gateway.

## O que o painel mostra

- **Serviço**: requisições por minuto, latência p95 e p99, taxa de erro 5xx,
  requisições em processamento e tempo no ar.
- **Rotas**: p95 por rota e um ranking ordenado pelo tempo total consumido —
  rota lenta e muito acessada pesa mais que rota lenta e rara.
- **Banco**: duração e volume das consultas por operação.
- **Processo**: memória, CPU e atraso do event loop.
- **Negócio**: importações de CSV, chamadas ao provedor de IA e erros não
  tratados, todos por resultado.

O painel é código: alterações feitas pela interface do Grafana são sobrescritas
na recarga. Para mudar, edite `observabilidade/grafana/dashboards/drp-ai.json`.

## Testes

```bash
npm test           # uma vez
npm run test:watch # durante o desenvolvimento
npm run typecheck
```

Cobrem as funções puras que produzem os números: aritmética de dias úteis,
parse das duas famílias de rota, faixas de cobertura, separação dos CDs
virtuais, balanço dia a dia da simulação e normalização dos rótulos de métrica.
Componente de tela continua sendo verificado renderizando a página contra o
banco — é o que pega os erros que importam.

## Dimensionamento da máquina

Os limites do `docker-compose.yml` foram calculados para **2 vCPU e 8 GB**, com
até 15 usuários, a partir de medições do banco real:

| Medida | Valor |
|---|---|
| Banco inteiro | 467 MB |
| Crescimento | ~5,6 MB por dia útil (~1,4 GB/ano) |
| Maior carga | `historico_vendas`: 187,5 MB, 512.069 linhas |
| Latência ao banco remoto | 141 ms por ida e volta |

Aquela última linha é a que justifica rodar o banco na mesma máquina: uma
consulta real levava 144 ms, dos quais **141 ms eram rede e 3 ms eram banco**.
Com o Postgres no mesmo host, essa latência some — e as telas ficam mais
rápidas em 2 vCPU do que estavam contra um banco gerenciado do outro lado do
continente.

### Onde está o risco

Não é a navegação. O banco inteiro cabe em cache e a aplicação em regime usa
~300 MB. O risco é a **importação de CSV**, que mantém o arquivo na memória
três vezes ao mesmo tempo — bytes crus, texto decodificado e objetos
parseados. Sobre a maior base isso dá um pico na casa de 1,5 GB, e já derrubou
o sistema por falta de heap uma vez.

Três defesas, todas já no repositório:

- `NODE_OPTIONS=--max-old-space-size=2560` no compose, declarado em vez de
  deixado ao critério do Node — que dimensiona pelo total da máquina e ignora
  que o Postgres mora ali também;
- `mem_limit` em cada serviço, para que um não mate o outro por OOM;
- `IMPORTACAO_SIMULTANEA = 1` em `src/lib/seguranca/limites.ts`, que garante
  uma carga pesada por vez.

### Antes do primeiro `docker compose up` na VPS

Criar 2 GB de swap. Em operação normal nunca é tocado; existe para a
importação grande degradar em vez de morrer:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Se a máquina crescer

Os números do compose escalam por proporção: `shared_buffers` em torno de 1,5×
o tamanho do banco, `work_mem × max_connections` sempre abaixo do teto de
memória do contêiner, e o heap do Node acima do pico da maior importação. O
bloco de comentários no topo do `docker-compose.yml` traz a conta inteira.

## Resiliência

O que acontece quando algo cai, e o que não acontece sozinho.

| Cenário | Recuperação |
|---|---|
| Processo da app morre (erro fatal, OOM) | `restart: unless-stopped` sobe de novo |
| Processo do banco morre | idem |
| App viva mas **travada** | o serviço `vigia` reinicia após ~90s |
| Banco vivo mas sem responder | o `vigia` reinicia após ~100s de falha contínua |
| `docker compose down` manual | nada sobe — é o que `unless-stopped` significa |
| Reboot da VPS | **só se o daemon do Docker estiver habilitado no boot** |

### Por que o vigia existe

`restart: unless-stopped` só reage ao processo **sair**. Um processo vivo e
travado deixa o contêiner marcado como `unhealthy` para sempre, e o Docker
sozinho não age sobre esse estado. Foi exatamente o que aconteceu aqui depois
de uma importação: processo de pé, nenhuma tela carregando, até alguém
perceber.

O `vigia` observa o status de saúde e reinicia quem estiver doente. Age apenas
sobre contêineres com o rótulo `autoheal: "true"` — hoje, a app e o banco.

Ele recebe o socket do Docker, o que equivale a acesso root ao host. É uma
escolha consciente, proporcional a um sistema interno; o rótulo limita o que
ele faz, não o que poderia fazer.

### Habilitar o Docker no boot

Sem isto, um reboot da VPS derruba tudo até alguém entrar na máquina:

```bash
sudo systemctl enable docker
```

### Conferir que a recuperação funciona

Vale testar uma vez, antes de confiar. Trave a aplicação de propósito e
acompanhe:

```bash
# Em um terminal, observando:
docker compose logs -f vigia

# Em outro, parando o Node sem matar o contêiner:
docker compose exec app kill -STOP 1
```

O contêiner fica `unhealthy` em ~90s (3 falhas × 30s do HEALTHCHECK) e o vigia
reinicia em seguida. `docker compose ps` mostra a transição. Se nada acontecer,
o rótulo `autoheal` não chegou ao contêiner — confira com
`docker inspect --format '{{.Config.Labels}}' $(docker compose ps -q app)`.

### O que ainda não é automático

**A ordem de subida depois de um reboot.** O `depends_on` com
`condition: service_healthy` só vale no `docker compose up`. Quando o daemon
reinicia sozinho, todos os contêineres sobem juntos e a app pode chegar antes
do banco. Na prática ela se recupera — o Prisma reconecta na consulta seguinte
— mas há uma janela de segundos servindo erro.

**Aviso de que algo reiniciou.** O vigia resolve em silêncio. Se um contêiner
estiver reiniciando em laço, só o `docker compose ps` ou o painel do Grafana
mostram. Um alerta no Prometheus sobre `restarts` resolveria, e ainda não
existe.

## Contas e acesso

Dois papéis: **administrador** opera o sistema (cockpit, cenários, exportação,
gestão de usuários); **consulta** vê as telas de análise. Conta nova nasce como
consulta — poder é concedido, não herdado.

### Primeiro acesso num banco vazio

Ninguém é administrador, e a tela que promove alguém exige ser administrador.
A porta de fora:

```bash
npm run admin -- pessoa@empresa.com.br      # promove
npm run admin -- --listar                   # mostra todas as contas
```

Na VPS, sem precisar do repositório:

```bash
docker compose exec banco psql -U drp -d drp_ai   -c "UPDATE \"user\" SET role='admin' WHERE email='pessoa@empresa.com.br'"
```

Depois de promover, é preciso sair e entrar de novo para a sessão recarregar.

### Quem pode criar conta

O formulário de cadastro é público. Duas travas, que respondem a perguntas
diferentes:

| Variável | Pergunta que responde |
|---|---|
| `EMAIL_DOMINIOS_PERMITIDOS` | Essa pessoa é da empresa? |
| `EXIGIR_EMAIL_VERIFICADO` | Esse endereço é mesmo dela? |

A primeira é a que fecha o buraco: confirmar um e-mail do Gmail prova que a
caixa existe, não que a pessoa pertence à companhia — e a conta criada enxerga
estoque, vendas, fornecedores e clientes.

### Ligar a verificação de e-mail

Depende de o domínio estar verificado no Resend. Com o remetente de sandbox
(`onboarding@resend.dev`), a mensagem **só chega ao dono da conta Resend** — as
demais pessoas se cadastram e nunca recebem o link, sem erro visível.

1. No Resend, adicionar o domínio; ele exibe os registros DNS (SPF, DKIM e o de
   retorno)
2. Colar esses registros na zona DNS do provedor do domínio
3. Aguardar a verificação no painel do Resend
4. No `.env`: `EMAIL_FROM="DRP_AI <nao-responda@seudominio.com.br>"` e
   `EXIGIR_EMAIL_VERIFICADO="true"`

## Backup

O serviço `backup` roda `pg_dump -Fc` a cada 24h no volume `dados_backup`, com
14 dias de retenção. Um dump roda na subida do contêiner, para configuração
errada aparecer na hora e não no dia seguinte.

```bash
docker compose logs backup                              # acompanhar
docker compose exec backup ls -lh /backups              # listar
```

### Restaurar

```bash
docker compose exec backup   pg_restore -d drp_ai --clean --if-exists /backups/drp_ai-AAAAMMDD-HHMMSS.dump
```

O formato custom também permite trazer **uma tabela só**, que é o caso comum
quando uma importação estraga uma base:

```bash
docker compose exec backup   pg_restore -d drp_ai --clean --if-exists -t simulador /backups/ARQUIVO.dump
```

### Duas coisas que ainda faltam

**Cópia fora do host.** O volume mora na mesma máquina do banco. Perder a VPS é
perder os dois. Um `rsync` ou `rclone` do volume para outro lugar fecha isso.

**Restauração testada.** Backup que nunca foi restaurado não é backup — é um
arquivo com nome bonito. Vale fazer uma vez, contra um banco descartável, e
anotar quanto tempo levou.

## Registro de eventos de segurança

Login, falha de login, cadastro bloqueado, troca de papel, acesso negado e teto
de requisições saem em JSON no stdout da aplicação, prefixados com `SEGURANCA`:

```bash
docker compose logs app | grep SEGURANCA
```

Vai para stdout e não para uma tabela de propósito: sobrevive quando o banco é o
que está com problema, e nenhuma ação da aplicação consegue apagar o próprio
rastro. Nenhum segredo, senha ou token é registrado.

## Quando a importação "trava"

Sintoma: a barra de progresso chega ao fim e congela, sem mensagem de erro.
Quase sempre **não é travamento, é `413`** — o arquivo passou do limite, o
servidor fechou a conexão e o navegador seguiu enviando sem perceber.

Há três limites em série, e todos precisam concordar:

| Onde | Diretiva | Valor | Se for menor |
|---|---|---|---|
| nginx | `client_max_body_size` | 300m | 413 que parece travamento |
| Aplicação | `TAMANHO_MAXIMO_BYTES` | 300 MB | 413 com mensagem clara |
| nginx | `proxy_read_timeout` | 600s | 504 no meio da carga |

**O padrão do nginx é 1 MB** — sem a linha no arquivo de configuração, toda
importação morre.

O firewall não entra nessa lista: o ufw decide por porta, no início da conexão,
e não olha o que trafega depois. Upload grande não é problema dele.

### Importação que "termina" sem gravar nada

Sintoma enganoso: a tela não acusa erro e a tabela continua vazia. A causa é o
processo morrer no meio — a transação é desfeita pelo Postgres e não sobra
rastro no banco.

O diagnóstico é direto:

```bash
docker inspect drp-app-1 --format 'OOMKilled={{.State.OOMKilled}} Restarts={{.RestartCount}}'
docker compose logs app 2>&1 | grep -iE "heap|FATAL|out of memory" | tail -5
```

Duas mortes diferentes, com correções diferentes:

| Sinal | Causa | Correção |
|---|---|---|
| `JavaScript heap out of memory` | O heap do Node acabou | `--max-old-space-size` maior |
| `OOMKilled=true` | O contêiner passou do `mem_limit` | `mem_limit` maior |

`OOMKilled=false` com `Restarts` maior que zero é o primeiro caso: o Node
encerrou sozinho, então para o Docker foi saída normal.

Aconteceu com o histórico de vendas (166 MB): o teto estava em 2,5 GB, baseado
numa estimativa de pico que se mostrou otimista. Meio milhão de linhas com 33
colunas são 16 milhões de strings, cada uma com cabeçalho próprio — o consumo
não acompanha o tamanho do arquivo, acompanha a contagem de campos.

Dois outros culpados possíveis, se o sintoma persistir:

- **Cloudflare na frente** limita o corpo da requisição a 100 MB nos planos
  gratuitos, e o erro chega antes de o nginx ver qualquer coisa.
- **Importação simultânea**: `IMPORTACAO_SIMULTANEA = 1` faz a segunda carga
  esperar. É proposital — cada arquivo grande tem pico perto de 1,5 GB de
  memória — mas para quem enviou parece lentidão sem explicação.

Para descobrir qual é, a ordem é olhar o log do nginx primeiro:

```bash
sudo tail -f /var/log/nginx/error.log        # 413 e 504 aparecem aqui
docker compose logs -f app | grep -i import  # o que a aplicação viu
```
