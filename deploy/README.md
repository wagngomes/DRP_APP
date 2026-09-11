# Subir o DRP_AI em produção

Roteiro do zero até o sistema no ar, numa VPS Ubuntu/Debian de 2 vCPU e 8 GB.

Cada passo diz **por que** existe. Pular um deles costuma dar um problema que
só aparece depois — e é sempre mais caro de descobrir do que de evitar.

---

## 0. Antes de começar

- [ ] Domínio comprado e o **registro A apontando para o IP da VPS**
- [ ] Acesso SSH à VPS
- [ ] Repositório acessível a partir dela

O DNS precisa estar propagado antes do passo 6: o certbot valida o domínio
fazendo uma requisição de verdade, e falha se o nome ainda não resolve.

---

## 1. Usuário sem root

```bash
adduser drp
usermod -aG sudo,docker drp     # o grupo docker vem no passo 2
```

Daqui em diante, tudo como `drp`. Rodar a aplicação como root significa que
qualquer falha dentro dela é uma falha com poder total sobre a máquina — e não
há nada aqui que precise desse poder.

> Quem está no grupo `docker` consegue virar root pelo próprio Docker. Isso é
> conhecido e aceitável para quem administra a máquina; o que se evita é a
> **aplicação** rodar como root, e o contêiner já usa usuário sem privilégio.

## 1b. Proteger o SSH

Obrigatório quando o acesso é **por senha**. Com chave, o SSH só aceita quem tem
o arquivo; com senha, aceita quem adivinhar — e numa VPS nova as tentativas de
força bruta começam em minutos, vindas de varreduras automáticas.

```bash
sudo apt update && sudo apt install -y fail2ban

sudo tee /etc/fail2ban/jail.local >/dev/null <<'FIM'
[sshd]
enabled  = true
# Cinco erros em dez minutos = uma hora de banimento. Suficiente para tornar a
# força bruta inviável (milhões de tentativas viram dezenas por dia) e folgado
# o bastante para quem só errou a senha duas vezes.
maxretry = 5
findtime = 10m
bantime  = 1h
# Reincidente fica mais tempo fora: quem tentou, foi banido e voltou a tentar
# não está errando a senha.
bantime.increment = true
bantime.factor    = 4
bantime.maxtime   = 1w
FIM

sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd     # confere que a jaula está ativa
```

O `deploy/firewall.sh` já aplica `ufw limit 22/tcp`, que é uma segunda camada:
barra IP que abre conexões demais em pouco tempo, antes mesmo de o SSH pedir
senha.

Duas medidas que valem a pena, mas exigem decisão:

**Trocar a porta do SSH** (ex.: 2222) não é segurança de verdade — quem procura
acha —, mas tira do log 95% do ruído das varreduras automáticas, o que faz uma
tentativa real ficar visível. Se fizer, ajuste o firewall junto, **na mesma
sessão**, e teste em outra janela antes de fechar.

**Acessar por um usuário comum em vez de root.** Força um passo a mais para
quem entra: precisa acertar o usuário *e* a senha, e a conta não tem poder
imediato. Com `PermitRootLogin no`, o alvo mais óbvio some.

> Adicionar chave SSH continua possível depois, pelo painel da Hostinger ou
> copiando a chave pública para `~/.ssh/authorized_keys`. Ela funciona de
> quantas máquinas você quiser — basta uma chave por máquina, ou a mesma chave
> copiada. Não é preciso escolher entre chave e acesso de vários lugares.

## 2. Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo systemctl enable docker      # ← sem isto, um reboot derruba tudo
```

O `enable` é o que faz os contêineres voltarem sozinhos depois de um reinício.
Sem ele, `restart: unless-stopped` não adianta: o daemon nunca sobe para
executá-lo.

## 3. Swap

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Nunca será usado em operação normal. Existe para a importação grande degradar
em vez de morrer: o parse de um CSV de 162 MB tem pico perto de 1,5 GB.

## 4. Firewall

```bash
sudo bash deploy/firewall.sh
```

O script abre SSH (com proteção contra força bruta), 80 e 443 — e nada mais.
Ele evita de propósito o `ufw limit` em 80/443: esse modo bloqueia IP que abra
muitas conexões em pouco tempo, que é o comportamento normal de um navegador
carregando a página e de um upload grande.

**A porta 3000 não entra na lista.** A aplicação escuta em `127.0.0.1:3000`
(definido no compose) e só o nginx da própria máquina a alcança. Abrir a 3000
faria o proxy reverso virar decoração — qualquer um acessaria
`http://IP:3000` sem TLS e sem os limites do nginx.

> Atenção: o Docker escreve regras direto no iptables, **antes** das do ufw.
> Uma porta publicada como `"3000:3000"` fica aberta mesmo com o ufw negando.
> A proteção real é o `127.0.0.1:` no compose, não o firewall.

## 5. Código e configuração

```bash
git clone https://github.com/wagngomes/DRP_APP.git drp
cd drp
cp env.example .env
```

Gerar o segredo da sessão — **um novo, nunca o de desenvolvimento**:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Preencher o `.env`:

```ini
DATABASE_URL="postgresql://drp:SENHA_FORTE@banco:5432/drp_ai"
POSTGRES_USER="drp"
POSTGRES_PASSWORD="SENHA_FORTE"
POSTGRES_DB="drp_ai"

BETTER_AUTH_SECRET="<o que o comando acima gerou>"
BETTER_AUTH_URL="https://seudominio.com.br"
NEXT_PUBLIC_APP_URL="https://seudominio.com.br"

EMAIL_DOMINIOS_PERMITIDOS="suaempresa.com.br"
EXIGIR_EMAIL_VERIFICADO="false"

RESEND_API_KEY="re_..."
EMAIL_FROM="DRP_AI <nao-responda@seudominio.com.br>"
ANTHROPIC_API_KEY="sk-ant-..."
```

Três pontos que costumam passar batido:

- `BETTER_AUTH_URL` com **https** — é daí que o Better Auth conclui que a
  conexão é segura e marca o cookie de sessão como `secure`.
- O host do banco é `banco`, o nome do serviço no compose — não `localhost`.
- `EMAIL_DOMINIOS_PERMITIDOS` é o que impede qualquer pessoa da internet de
  criar conta e ler a base inteira. Vazio libera todo mundo.

## 6. nginx e TLS

```bash
sudo apt install nginx certbot python3-certbot-nginx

sudo cp deploy/nginx-drp.conf /etc/nginx/sites-available/drp
sudo sed -i 's/SEUDOMINIO.COM.BR/seudominio.com.br/g' /etc/nginx/sites-available/drp
sudo ln -s /etc/nginx/sites-available/drp /etc/nginx/sites-enabled/drp
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d seudominio.com.br
```

O arquivo já traz os dois ajustes que quebram a aplicação se faltarem:
`client_max_body_size 300m` (o padrão do nginx é **1 MB**, e mataria toda
importação) e `proxy_read_timeout 600s` (o padrão de 60 s corta a conexão no
meio de uma carga grande).

## 7. Subir

```bash
docker compose up -d
docker compose logs -f app
```

O compose sobe banco, migrações, aplicação, backup e o vigia que reinicia
contêiner travado. Para incluir o painel de métricas:

```bash
docker compose --profile observabilidade up -d
```

## 8. Primeira conta

Criar a conta pela tela, em `https://seudominio.com.br`. Ela nasce como
consulta — promover exige a porta de fora:

```bash
docker compose exec banco psql -U drp -d drp_ai \
  -c "UPDATE \"user\" SET role='admin' WHERE email='voce@suaempresa.com.br'"
```

Sair e entrar de novo para a sessão recarregar o papel.

## 9. Conferir antes de liberar para a equipe

```bash
# HTTPS válido e headers no ar
curl -sI https://seudominio.com.br/login | grep -iE "^HTTP|strict-transport|content-security"

# A porta 3000 NÃO pode responder de fora — teste de outra máquina:
curl -m 5 http://IP-DA-VPS:3000     # deve dar timeout ou recusa

# Saúde
curl -s https://seudominio.com.br/api/health

# Backup rodou na subida
docker compose exec backup ls -lh /backups
```

Depois, uma vez, o teste que quase ninguém faz e que é o único que prova algo:
**restaurar um backup**. O procedimento está no `README-operacao.md`.

## 10. Ligar a verificação de e-mail

Só depois de o domínio estar verificado no Resend — com o remetente de sandbox
a mensagem só chega ao dono da conta Resend, e todo mundo mais fica trancado do
lado de fora sem erro visível. Passo a passo no `README-operacao.md`.

---

## O que fica pendente

Nenhum destes impede subir, mas todos estavam no levantamento de segurança:

- **Usuário do banco sem superuser** — hoje a aplicação usa o superusuário do
  Postgres. O correto é um usuário de migração com DDL e um de aplicação só com
  DML.
- **Cópia do backup para fora do host** — o volume mora na mesma máquina do
  banco; perder a VPS é perder os dois.
- **CSP sem `unsafe-inline`** — exige nonce por requisição.
- **Trilha de auditoria e 2FA para administradores.**
