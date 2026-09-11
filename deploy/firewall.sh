#!/usr/bin/env bash
# Firewall da VPS do DRP_AI.
#
#   sudo bash deploy/firewall.sh
#
# Abre o mínimo: SSH, HTTP e HTTPS. Nada mais.
#
# ---------------------------------------------------------------------------
# O que este arquivo NÃO faz, e é importante saber
# ---------------------------------------------------------------------------
# Ele não protege porta publicada pelo Docker. O Docker escreve as próprias
# regras na cadeia DOCKER do iptables, que é avaliada **antes** das do ufw —
# uma porta publicada como "3000:3000" fica acessível da internet mesmo com o
# ufw negando tudo, e sem nenhum aviso.
#
# A proteção real da aplicação é o prefixo `127.0.0.1:` na seção `ports` do
# docker-compose.yml. Este firewall é a segunda camada, não a primeira.
#
# ---------------------------------------------------------------------------
# Sobre upload travando
# ---------------------------------------------------------------------------
# O ufw com estas regras não interfere em upload grande: ele decide por porta,
# no início da conexão, e não olha o que trafega depois. Quando uma importação
# "trava", a causa quase sempre é o nginx — `client_max_body_size` estourado
# devolve 413 e fecha a conexão enquanto o navegador ainda envia, e o sintoma é
# uma barra de progresso que congela em vez de uma mensagem de erro.
#
# Por isso NÃO se usa `ufw limit` em 80/443 aqui. Esse modo bloqueia um IP que
# abra muitas conexões em pouco tempo — comportamento normal de um navegador
# carregando uma página com vários recursos, e de um upload grande. Em SSH faz
# sentido (é defesa contra força bruta); em HTTP derruba usuário legítimo.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode como root: sudo bash deploy/firewall.sh" >&2
  exit 1
fi

echo "==> Regras padrão: nega entrada, permite saída"
ufw default deny incoming
ufw default allow outgoing

echo "==> SSH"
# `limit` só aqui: barra força bruta sem atrapalhar uso legítimo, porque
# ninguém abre dezenas de sessões SSH por minuto.
ufw limit 22/tcp comment 'SSH com proteção contra força bruta'

echo "==> HTTP e HTTPS (nginx)"
ufw allow 80/tcp  comment 'HTTP — redireciona para HTTPS e responde ao certbot'
ufw allow 443/tcp comment 'HTTPS'

# A aplicação (3000), o banco (5432) e o Grafana (3001) ficam de fora de
# propósito: todos escutam apenas em 127.0.0.1 ou na rede interna do Docker.
# Para acessar o Grafana de fora, use um túnel SSH em vez de abrir a porta:
#   ssh -L 3001:127.0.0.1:3001 drp@IP-DA-VPS

echo "==> Ativando"
ufw --force enable

echo
ufw status verbose

cat <<'FIM'

---------------------------------------------------------------------------
Confira, de OUTRA máquina, que a aplicação não responde direto:

  curl -m 5 http://IP-DA-VPS:3000     # deve dar timeout ou recusa

Se responder, o compose está publicando em 0.0.0.0 — corrija a seção `ports`
do serviço `app` para "127.0.0.1:3000:3000" e recrie o contêiner. O firewall
sozinho não resolve esse caso.
---------------------------------------------------------------------------
FIM
