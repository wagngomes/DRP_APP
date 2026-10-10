-- Diagnóstico de ruptura: tabelas de resultado.
--
-- Escrita à mão, e não gerada por `prisma migrate dev`, porque o histórico de
-- migrations deste banco diverge do diretório desde o baseline de 11/09 — o
-- comando propõe resetar o schema, o que apagaria as bases inteiras. O mesmo
-- caminho já foi usado em `20260930120000_papel_console_leitura`.
--
-- Só cria. Nenhuma tabela existente é alterada, e não há chave estrangeira
-- para `produtos`: o import daquela tabela apaga antes de inserir, e uma
-- relação com ON DELETE SET NULL zeraria `codigo` aqui em cascata, sem erro —
-- que foi exatamente como o forecast de agosto perdeu 16 mil códigos.

CREATE TABLE "ruptura_evento" (
    "id"               SERIAL       NOT NULL,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "codigo"           TEXT         NOT NULL,
    "filial"           TEXT         NOT NULL,
    "fornecedor"       TEXT,
    "descricao"        TEXT,
    "inicio"           DATE         NOT NULL,
    "fim"              DATE,
    "dias"             INTEGER      NOT NULL,
    "valor_perdido"    DECIMAL(24,10) NOT NULL,
    "confianca"        TEXT         NOT NULL,
    "dias_explicados"  DECIMAL(10,2)  NOT NULL,
    "aviso_replay"     BOOLEAN      NOT NULL DEFAULT false,
    "abertura_data"    DATE,
    "abertura_origem"  TEXT,
    "herdada_abertura" BOOLEAN      NOT NULL DEFAULT false,
    "versao_regras"    TEXT         NOT NULL,
    "entrada_hash"     TEXT         NOT NULL,
    "calculado_em"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revisao_status"   TEXT         NOT NULL DEFAULT 'pendente',

    CONSTRAINT "ruptura_evento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ruptura_causa" (
    "id"         SERIAL        NOT NULL,
    "eventoId"   INTEGER       NOT NULL,
    "causa"      TEXT          NOT NULL,
    "papel"      TEXT          NOT NULL,
    "dias"       DECIMAL(10,2) NOT NULL,
    "percentual" DECIMAL(6,2)  NOT NULL,
    "evidencias" JSONB         NOT NULL,

    CONSTRAINT "ruptura_causa_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ruptura_revisao" (
    "id"              SERIAL       NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventoId"        INTEGER      NOT NULL,
    "usuario"         TEXT         NOT NULL,
    "acao"            TEXT         NOT NULL,
    "causas_motor"    JSONB        NOT NULL,
    "causas_analista" JSONB,
    "comentario"      TEXT,

    CONSTRAINT "ruptura_revisao_pkey" PRIMARY KEY ("id")
);

-- A versão das regras entra na chave: recalcular com régua nova acrescenta um
-- diagnóstico em vez de apagar o anterior, que é o que permite comparar as duas.
CREATE UNIQUE INDEX "ruptura_evento_codigo_filial_inicio_versao_regras_key"
    ON "ruptura_evento"("codigo", "filial", "inicio", "versao_regras");
CREATE INDEX "ruptura_evento_filial_inicio_idx"   ON "ruptura_evento"("filial", "inicio");
CREATE INDEX "ruptura_evento_inicio_idx"          ON "ruptura_evento"("inicio");
CREATE INDEX "ruptura_evento_herdada_abertura_idx" ON "ruptura_evento"("herdada_abertura");
CREATE INDEX "ruptura_evento_codigo_filial_idx"   ON "ruptura_evento"("codigo", "filial");
-- A tela filtra por fornecedor; sem índice, cada filtro varre a tabela inteira.
CREATE INDEX "ruptura_evento_fornecedor_idx"      ON "ruptura_evento"("fornecedor");

CREATE INDEX "ruptura_causa_eventoId_idx" ON "ruptura_causa"("eventoId");
CREATE INDEX "ruptura_causa_causa_idx"    ON "ruptura_causa"("causa");
CREATE INDEX "ruptura_revisao_eventoId_idx" ON "ruptura_revisao"("eventoId");

-- CASCADE: apagar um evento recalculado leva junto causas e revisões dele.
ALTER TABLE "ruptura_causa"
    ADD CONSTRAINT "ruptura_causa_eventoId_fkey"
    FOREIGN KEY ("eventoId") REFERENCES "ruptura_evento"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ruptura_revisao"
    ADD CONSTRAINT "ruptura_revisao_eventoId_fkey"
    FOREIGN KEY ("eventoId") REFERENCES "ruptura_evento"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
