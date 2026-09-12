# Imagem da aplicação DRP_AI.
#
# Multi-stage com quatro estágios e dois alvos publicáveis:
#
#   deps      instala as dependências uma vez, em camada própria — só refaz
#             quando package-lock.json muda, não a cada alteração de código
#   builder   gera o cliente Prisma e compila o Next em modo standalone
#   migrator  alvo que só roda `prisma migrate deploy` e sai
#   runner    alvo final: apenas o que o servidor precisa em execução
#
# As migrations ficam num alvo separado de propósito. O `prisma` CLI e os
# engines somam dezenas de megabytes que a aplicação não usa depois do boot —
# colocá-los no runner engordaria a imagem que fica rodando, para um comando que
# roda uma vez. O compose sobe o migrator antes e espera ele terminar.

FROM node:22-alpine AS base
# `libc6-compat` é exigido pelos engines do Prisma no Alpine; sem ele o cliente
# falha ao carregar com erro de símbolo, e só na primeira consulta.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ---------------------------------------------------------------- dependências
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --------------------------------------------------------------------- build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# Telemetria desligada: build de imagem não deve falar com a internet além do
# necessário, e em rede corporativa fechada isso vira espera até o tempo limite.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ------------------------------------------------------------------ migrations
FROM base AS migrator
ENV NODE_ENV=production

# `node_modules` inteiro, e não uma seleção a dedo.
#
# A primeira versão copiava só `prisma`, `@prisma` e `.bin`, para deixar a
# imagem enxuta. Não funciona: o CLI carrega dependências transitivas espalhadas
# pela árvore — `@prisma/config` exige `effect`, que exige outras — e o erro que
# aparece é `Cannot find module`, apontando para uma peça interna que não diz
# nada sobre a causa. Manter essa lista correta exigiria persegui-la a cada
# atualização do Prisma.
#
# A economia também não existia de verdade: este alvo sobe, aplica as migrations
# e morre. Nunca fica em execução, e a camada de dependências é a mesma já
# construída no estágio `deps`, então não há download nem build a mais.
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma
# O schema não declara `url` na datasource: quem diz onde está o banco é este
# arquivo.
COPY prisma.config.ts ./
COPY package.json ./
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]

# ---------------------------------------------------------------------- runner
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Usuário sem privilégio: se a aplicação for comprometida, o processo não é root
# dentro do contêiner.
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# `dumb-init` como PID 1 para encaminhar SIGTERM ao Node. Sem ele o Node vira
# PID 1, ignora o sinal por padrão, e o orquestrador acaba matando o contêiner
# no timeout — cortando requisições em andamento a cada deploy.
RUN apk add --no-cache dumb-init curl

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Consulta a saúde real, que verifica o banco — e não apenas se a porta abriu.
# `start-period` alto porque o primeiro acesso ainda compila rotas sob demanda.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
