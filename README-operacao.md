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
