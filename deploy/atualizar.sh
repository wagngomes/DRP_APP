#!/usr/bin/env bash
# Atualiza o DRP_AI na VPS.
#
#   cd /opt/drp && bash deploy/atualizar.sh
#
# Traz o código novo, reconstrói a imagem, aplica as migrations pendentes e
# sobe. Ao final mostra o estado — porque "o comando terminou" não é a mesma
# coisa que "o sistema está no ar".
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Versão atual: $(git rev-parse --short HEAD)"

echo "==> Buscando atualizações"
git pull --ff-only

novo=$(git rev-parse --short HEAD)
echo "==> Versão nova: $novo"

# `--build` sempre: a imagem carrega o Next já compilado, então mudança de
# código só chega ao ar por reconstrução. O Docker reaproveita as camadas que
# não mudaram, e a parte cara — `npm ci` — só refaz quando o package-lock muda.
echo "==> Reconstruindo e subindo (leva alguns minutos em 2 vCPU)"
docker compose up -d --build

echo
echo "==> Migrations"
# O serviço roda e sai; o log é o único lugar onde se vê o que ele aplicou.
docker compose logs migracoes --tail 8

echo
echo "==> Contêineres"
docker compose ps

echo
echo "==> Esperando a aplicação responder"
# Espera de verdade, em vez de perguntar uma vez logo depois do `up`.
#
# A primeira versão checava imediatamente e acusava 502 — não porque algo
# tivesse falhado, mas porque o Next ainda estava carregando. Um script que
# grita "não subiu" quando subiu é pior que script nenhum: ensina a ignorar o
# aviso, e aí o dia em que ele estiver certo passa batido.
#
# O HEALTHCHECK da imagem tem 40s de carência, então dois minutos cobrem uma
# subida normal com folga.
codigo=""
for _ in $(seq 1 40); do
  codigo=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 https://wagngodrp.tech/login || echo "000")
  [ "$codigo" = "200" ] && break
  printf "."
  sleep 3
done
echo
echo "    https://wagngodrp.tech/login -> $codigo"

if [ "$codigo" = "200" ]; then
  echo
  echo "Atualizado para $novo e no ar."
else
  echo
  echo "A aplicação não respondeu 200 em dois minutos. Para investigar:"
  echo "    docker compose logs app --tail 40"
  echo "    docker compose ps"
  exit 1
fi
