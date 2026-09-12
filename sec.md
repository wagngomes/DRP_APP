1. Autenticação (better-auth)
(crítico) secret forte (≥ 32 bytes aleatórios), fora do código, único por ambiente
Hashing robusto — better-auth usa scrypt por padrão; confirme e não enfraqueça
Política de senha: mínimo ≥ 12 caracteres, rejeitar senhas já vazadas (Have I Been Pwned via k-anonymity)
(crítico) Verificação de e-mail obrigatória (requireEmailVerification)
2FA/MFA via plugin twoFactor — pelo menos TOTP, obrigatório para admins
Reset de senha com token de uso único, expiração curta, invalidado após uso
Bloqueio/atraso progressivo após N tentativas falhas (anti brute force / credential stuffing)
(crítico) trustedOrigins explícito (nunca *)
Enumeração de usuário mitigada — erros genéricos no login e reset ("credenciais inválidas")
OAuth (se usado): state + PKCE ativos, redirect_uri em allowlist
Reautenticação para ações sensíveis (trocar senha/e-mail, mexer no MFA, excluir conta)
2. Sessões
(crítico) Cookies com httpOnly, secure, sameSite=lax (ou strict)
Expiração absoluta + por inatividade
(crítico) Logout invalida a sessão no servidor, não só apaga cookie
Trocar senha invalida todas as sessões
Sessões no Postgres (não só JWT stateless) para permitir revogação imediata
Novo ID de sessão após login (previne fixação de sessão)
Prefixo de cookie __Host- quando aplicável
3. Autorização e controle de acesso
(crítico) Autorização verificada no servidor em toda rota/ação — nunca confiar no cliente nem em "esconder botão"
Modelo de permissões definido (RBAC ou ABAC) e documentado
Menor privilégio nos papéis de usuário
(crítico) Anti-IDOR: todo acesso valida dono/autorização → where: { id, userId } no Prisma, nunca só where: { id }
Server Actions tratadas como endpoints públicos: toda action revalida sessão + permissão logo no início
Rotas de API protegidas por middleware e verificação dentro do handler (defesa em profundidade)
Segregação de tenant (multi-empresa/filial) garantida em toda query
4. Proteção de dados
(crítico) HTTPS obrigatório + HSTS (includeSubDomains, preload)
Criptografia em repouso (disco/volume do provedor)
Campos muito sensíveis criptografados a nível de aplicação quando necessário
(BR) Minimização — só colete o dado pessoal necessário
Mascaramento/anonimização em dev e homologação
PII nunca em logs, query string de URL ou mensagens de erro
Política de retenção e descarte definida
5. Banco de dados (PostgreSQL)
(crítico) Conexão com sslmode=require (ou verify-full em produção)
(crítico) Usuário da app sem superuser — só DML nas tabelas necessárias
Usuários separados por finalidade (app / migração / read-only para BI)
(crítico) Queries sempre parametrizadas — Prisma já protege; auditar qualquer $queryRaw
Row-Level Security (RLS) considerada para isolar tenant/usuário no próprio banco
(crítico) Banco não exposto à internet — VPC/rede privada, firewall por IP
Credencial do banco em secret manager
Pool de conexões com limite (anti exaustão)
Migrações versionadas e revisadas; sem db push em produção
6. Validação de entrada e injeção
(crítico) Validação de schema server-side (Zod/Valibot) em toda entrada, inclusive Server Actions
Allowlist em vez de blocklist
(crítico) Anti-XSS: evitar dangerouslySetInnerHTML; se inevitável, sanitizar (DOMPurify)
Anti-SSRF em fetch server-side com input do usuário (allowlist de hosts; bloquear IPs internos e 169.254.169.254)
Anti path traversal em manipulação de arquivos
Anti mass assignment — nunca repassar req.body inteiro ao ORM; selecione campos explicitamente
7. Segredos e configuração
(crítico) Nenhum segredo no Git — varra o histórico (gitleaks/trufflehog)
(crítico) Variáveis sensíveis sem prefixo NEXT_PUBLIC_ (esse prefixo expõe ao browser!)
Secret manager em produção (Vault, AWS/GCP Secrets Manager, Doppler…)
.env no .gitignore; .env.example só com chaves, sem valores
Credenciais totalmente separadas entre dev/homolog/produção
Rotação periódica de segredos e chaves de API
8. Headers HTTP e hardening do Next.js
(crítico) CSP restritiva (idealmente com nonce; evitar unsafe-inline/unsafe-eval)
Strict-Transport-Security (HSTS)
X-Content-Type-Options: nosniff
Anti-clickjacking: X-Frame-Options: DENY ou CSP frame-ancestors 'none'
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy restringindo APIs do browser não usadas
Remover X-Powered-By e banners de versão
CORS com origens explícitas (nunca * com credenciais)
Source maps fora de produção
9. Rate limiting e abuso
(crítico) Rate limit nos endpoints de auth (login, reset, cadastro, MFA)
Rate limit global por IP/usuário nas APIs
Anti-bot em cadastro e formulários (CAPTCHA/Turnstile onde couber)
WAF / proteção DDoS na borda (Cloudflare, provedor)
Limite de tamanho de payload
10. Upload de arquivos (se aplicável)
Validar tipo pelo conteúdo real (magic bytes), não pela extensão/MIME informado
Limite de tamanho e quantidade
Armazenar fora do webroot / em bucket dedicado, servir via URL assinada
Nome de arquivo gerado pelo servidor
Varredura de malware em contexto corporativo
11. Logging, auditoria e monitoramento
(crítico) Logar eventos de segurança: login/falha, mudança de senha/permissão, acesso a dado sensível
Trilha de auditoria imutável para ações críticas (quem, o quê, quando)
(crítico) Segredos, senhas, tokens e PII nunca logados
Alertas para anomalias (picos de falha de login, acesso fora de horário)
Centralização de logs com acesso protegido
Rastreamento de erros (Sentry) com scrubbing de dados sensíveis
12. Dependências e supply chain
npm audit / Dependabot / Renovate ativos e triados
Lockfile commitado; builds reproduzíveis
SCA no CI
Cuidado com typosquatting; verificar origem dos pacotes
Imagens Docker base mínimas e escaneadas
13. Infraestrutura, CI/CD e deploy
Segredos do pipeline em cofre do CI, não expostos em logs
Ambientes isolados com contas e redes separadas
Menor privilégio nas credenciais de deploy (IAM restrito)
Acesso administrativo à infra com MFA
Superfície de rede mínima (só portas necessárias)
SAST/DAST no pipeline
Proteção de branch + revisão obrigatória de PR
14. Backup e recuperação
(crítico) Backups automáticos e regulares do banco
Backups criptografados e com acesso restrito
(crítico) Restauração testada periodicamente (backup não testado não é backup)
Retenção definida + cópia off-site/entre regiões
Plano de DR documentado (RTO/RPO definidos)
15. LGPD e conformidade (BR)
Base legal definida para cada tratamento de dado pessoal
Aviso de privacidade e consentimento onde exigido
Direitos do titular: acesso, correção, exclusão, portabilidade
Registro das operações de tratamento (ROPA)
Cláusulas de proteção de dados com fornecedores/subprocessadores
Processo de notificação de incidente à ANPD e aos titulares
Encarregado (DPO) designado se aplicável ao porte
16. Resposta a incidentes
Plano documentado (papéis, contatos, passos)
Procedimento de revogação em massa de sessões + rotação emergencial de segredos
Canal para reporte de vulnerabilidades
Pós-morte sem culpados, com lições registradas
17. Testes de segurança
Testes automatizados de autorização (usuário A não acessa dado de B)
Revisão de código focada em segurança nas partes sensíveis
Pentest antes do go-live e periodicamente
Homologação equivalente à produção
Prioridade para o go-live
Todos os itens (crítico).
HTTPS/HSTS, cookies seguros, rate limit em auth, autorização server-side, banco privado com usuário restrito.
Backup testado + logging de segurança.
Resto como hardening contínuo pós-lançamento.