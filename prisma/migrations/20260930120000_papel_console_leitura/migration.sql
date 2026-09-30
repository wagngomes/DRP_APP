-- Papel restrito para o console SQL administrativo.
--
-- O console roda em transação somente-leitura, o que impede escrita mas não
-- impede leitura: `SELECT token FROM session` funcionava, e token de sessão é
-- login imediato -- basta colá-lo no cookie. Isso transformava "comprometer uma
-- conta admin" em "comprometer todas as contas", e desfazia a separação entre
-- quem administra e os demais.
--
-- O papel abaixo não é usado para conectar. O console faz `SET LOCAL ROLE`
-- dentro da própria transação, e a partir dali as permissões conferidas são as
-- deste papel -- inclusive para o dono das tabelas, que de outra forma passaria
-- por cima de qualquer REVOKE.
--
-- `user` continua legível de propósito: nome, e-mail e papel são informação
-- administrativa útil e não servem para se passar por ninguém. O que sai são as
-- três que guardam credencial.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'console_leitura') THEN
    CREATE ROLE console_leitura NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO console_leitura;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO console_leitura;

-- Tabelas futuras entram automaticamente. Sem isto, uma tabela criada amanhã
-- ficaria invisível no console e o erro apareceria como "permission denied" numa
-- consulta que deveria funcionar.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO console_leitura;

-- As três que guardam credencial: token de sessão, hash de senha e tokens de
-- OAuth, e os códigos de verificação e redefinição.
REVOKE ALL ON "session" FROM console_leitura;
REVOKE ALL ON "account" FROM console_leitura;
REVOKE ALL ON "verification" FROM console_leitura;

-- O usuário da aplicação precisa ser membro para poder assumir o papel.
DO $$
BEGIN
  EXECUTE format('GRANT console_leitura TO %I', current_user);
END $$;
