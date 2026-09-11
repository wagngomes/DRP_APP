-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos" (
    "codigo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "descricao" TEXT,
    "tipo" TEXT,
    "unidade" TEXT,
    "cod_barras" TEXT,
    "cod_fabrica" TEXT,
    "cod_marca" TEXT,
    "marca" TEXT,
    "grp_marca" TEXT,
    "d_grp_marca" TEXT,
    "grupo" TEXT,
    "tag_medic" TEXT,
    "tipo_medicamento" TEXT,
    "principio_ativo" TEXT,
    "usa_refrig" TEXT,

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "fiscal" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "codigo" TEXT,
    "segmento_pricing" TEXT,
    "categoria_gc" TEXT,
    "classe" TEXT,
    "ean" TEXT,
    "uf_fornecedor" TEXT,
    "tributacao" TEXT,

    CONSTRAINT "fiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "filiais" (
    "codigo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sigla" TEXT,
    "descricao" TEXT,

    CONSTRAINT "filiais_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "fornecedores" (
    "fornecedor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fornecedor_normalizado" TEXT,

    CONSTRAINT "fornecedores_pkey" PRIMARY KEY ("fornecedor")
);

-- CreateTable
CREATE TABLE "cenario_salvo" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fornecedor" TEXT NOT NULL,
    "pergunta" TEXT NOT NULL,
    "data_base" DATE NOT NULL,
    "data_entrada" DATE NOT NULL,
    "rompem" INTEGER NOT NULL,
    "dias_descobertos" INTEGER NOT NULL,
    "unidades_faltando" INTEGER NOT NULL,
    "resultado" JSONB NOT NULL,

    CONSTRAINT "cenario_salvo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analise_ia" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_snapshot" DATE NOT NULL,
    "modelo" TEXT NOT NULL,
    "parametros" JSONB NOT NULL,
    "resultado" JSONB NOT NULL,
    "entrada_hash" TEXT NOT NULL,
    "tokens_entrada" INTEGER NOT NULL DEFAULT 0,
    "tokens_saida" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "analise_ia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_time_fornecedor" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fornecedor" TEXT NOT NULL,
    "cd" TEXT NOT NULL,
    "lead_time" INTEGER,

    CONSTRAINT "lead_time_fornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rotas" (
    "codigo_rota" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "descricao" TEXT,
    "descricao_cod" TEXT,
    "filial_final" TEXT,
    "filial_final_cod" TEXT,
    "empresa" TEXT,

    CONSTRAINT "rotas_pkey" PRIMARY KEY ("codigo_rota")
);

-- CreateTable
CREATE TABLE "pedidos_de_compra" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_snapshot" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "codigo" TEXT,
    "descricao" TEXT,
    "armazem" TEXT,
    "cod_fornecedor" TEXT,
    "data_emissao" TIMESTAMP(3),
    "data_entrega" TIMESTAMP(3),
    "filial" TEXT,
    "grupo_marca" TEXT,
    "num_pedido" TEXT,
    "quantidade_entregue" INTEGER,
    "quantidade_total" INTEGER,
    "quantidade_receber" INTEGER,
    "unidade" TEXT,
    "saldo_ajustado" DECIMAL(24,10),
    "tp_ped_transf" TEXT,
    "tp_ped_transf_descricao" TEXT,
    "rota_final" TEXT,
    "porcentagem_entregue" DECIMAL(24,10),
    "categoria" TEXT,
    "comprador" TEXT,
    "tributacao" TEXT,
    "supridor" TEXT,
    "provider" TEXT,
    "lt" INTEGER,
    "bo" TEXT,
    "frete" TEXT,
    "cob_cd" DECIMAL(24,10),
    "cob_br" DECIMAL(24,10),
    "data_pedra" TIMESTAMP(3),
    "status_lt" TEXT,
    "ruptura_cd" TEXT,
    "ruptura_br" TEXT,
    "nota_fiscal" TEXT,
    "status_logistica" TEXT,
    "data_agendada" TEXT,

    CONSTRAINT "pedidos_de_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulador" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_snapshot" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cod_prod_cod_filial" TEXT,
    "codigo" TEXT,
    "filial" TEXT,
    "produto" TEXT,
    "marca" TEXT,
    "fornecedor" TEXT,
    "est_arm_01" DECIMAL(24,10),
    "est_arm_11" DECIMAL(24,10),
    "est_arm_26" DECIMAL(24,10),
    "est_arm_nac" DECIMAL(24,10),
    "est_arm_q40" DECIMAL(24,10),
    "est_arm_rc" DECIMAL(24,10),
    "estoque_cmv" DECIMAL(24,10),
    "cmv_unitario" DECIMAL(24,10),
    "cmv_unitario_1" DECIMAL(24,10),
    "compras_arm_01" DECIMAL(24,10),
    "compras_arm_26" DECIMAL(24,10),
    "compras_arm_nac" DECIMAL(24,10),
    "valor_pedido_aberto_bruto" DECIMAL(24,10),
    "valor_pedido_aberto_cmv" DECIMAL(24,10),
    "em_transf_arm_01" DECIMAL(24,10),
    "em_transf_arm_11" DECIMAL(24,10),
    "em_transf_arm_26" DECIMAL(24,10),
    "total_trans" DECIMAL(24,10),
    "reserva" DECIMAL(24,10),
    "qtd_pendente" DECIMAL(24,10),
    "bloqueio" TEXT,
    "vendido_m0_arm_01" DECIMAL(24,10),
    "vendido_m0_arm_26" DECIMAL(24,10),
    "vendido_m0_arm_11" DECIMAL(24,10),
    "vendido_m0_arm_tr" DECIMAL(24,10),

    CONSTRAINT "simulador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecast" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_snapshot" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "codigo" TEXT,
    "filial" TEXT,
    "rota_compra" TEXT,
    "curva" TEXT,
    "b_u" TEXT,
    "analista" TEXT,
    "forecast_m0" DECIMAL(24,10),
    "forecast_m0_atualizado" DECIMAL(24,10),
    "politica" DECIMAL(24,10),
    "politica_plano" DECIMAL(24,10),
    "torre" TEXT,
    "m_4" DECIMAL(24,10),
    "m_3" DECIMAL(24,10),
    "m_2" DECIMAL(24,10),
    "m_1" DECIMAL(24,10),

    CONSTRAINT "forecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plano_compra" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_snapshot" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "codigo" TEXT,
    "empresa" TEXT,
    "plano_de_compra" DECIMAL(24,10),

    CONSTRAINT "plano_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transferencias_abertas" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_snapshot" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo_nf_saida" TEXT,
    "filial_codigo_saida" TEXT,
    "serie_nf_saida" TEXT,
    "numero_nf_saida" TEXT,
    "cfop" TEXT,
    "cliente_codigo" TEXT,
    "loja_codigo" TEXT,
    "empresa_saida" TEXT,
    "cnpj_saida" TEXT,
    "uf_saida" TEXT,
    "data_emissao" TIMESTAMP(3),
    "linha_item" DECIMAL(24,10),
    "codigo" TEXT,
    "un_produto" TEXT,
    "descricao_produto" TEXT,
    "qtde" DECIMAL(24,10),
    "valor" DECIMAL(24,10),
    "valor_sd2_custo_1" DECIMAL(24,10),
    "valor_icms_saida" DECIMAL(24,10),
    "valor_icms_st" DECIMAL(24,10),
    "local" TEXT,
    "pedido_venda_protheus" TEXT,
    "item_pedido_venda" DECIMAL(24,10),
    "pedido_bo" TEXT,
    "status_classificada" TEXT,
    "empresa_entrada" TEXT,
    "filial_codigo_entrada" TEXT,
    "descricao_filial_entrada" TEXT,
    "cnpj_entrada" TEXT,
    "estado_entrada" TEXT,
    "lote" TEXT,
    "validade_lote" TIMESTAMP(3),
    "tipo_produto" TEXT,
    "rota" TEXT,
    "passo" DECIMAL(24,10),
    "qtde_passo" DECIMAL(24,10),
    "usuario_pedido_venda" TEXT,

    CONSTRAINT "transferencias_abertas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recebimento" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "armazem" TEXT,
    "arq" TEXT,
    "tes" TEXT,
    "definicao" TEXT,
    "cfop" TEXT,
    "cidade" TEXT,
    "cnpj" TEXT,
    "ol" TEXT,
    "loja" TEXT,
    "nome" TEXT,
    "data_emissao" TIMESTAMP(3),
    "data" TIMESTAMP(3),
    "data_pedido" TIMESTAMP(3),
    "lead_time" DECIMAL(24,10),
    "documento" TEXT,
    "estado" TEXT,
    "filial" TEXT,
    "cod_marca_cadastro" TEXT,
    "nome_marca_cadastro" TEXT,
    "nome_grupo_marca" TEXT,
    "grupo_marca_oficial" TEXT,
    "quantidade" DECIMAL(24,10),
    "codigo" TEXT,
    "produto" TEXT,
    "pedido" TEXT,
    "lote" TEXT,
    "data_validade" TIMESTAMP(3),
    "custo" DECIMAL(24,10),
    "valor_total" DECIMAL(24,10),
    "cofins" DECIMAL(24,10),
    "pis" DECIMAL(24,10),
    "ipi" DECIMAL(24,10),
    "icms" DECIMAL(24,10),
    "icms_complementar" DECIMAL(24,10),
    "icms_st" DECIMAL(24,10),
    "origem" TEXT,
    "pis_cofins" TEXT,
    "tributacao" TEXT,
    "codigo_tributario" TEXT,
    "grupo_tributario" TEXT,
    "ncm" TEXT,
    "cst_pis" TEXT,
    "tipo_credito" TEXT,
    "aliq_icms" DECIMAL(24,10),

    CONSTRAINT "recebimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_transferencias" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filial_orig" TEXT,
    "filial_dest" TEXT,
    "mat_med" TEXT,
    "ativo" DECIMAL(24,10),
    "transit_time" DECIMAL(24,10),

    CONSTRAINT "sla_transferencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes_grupos" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cliente_codigo" TEXT,
    "cliente_loja" TEXT,
    "cliente_nome" TEXT,
    "cliente_cnpj" TEXT,
    "cliente_grupo" TEXT,

    CONSTRAINT "clientes_grupos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historico_vendas" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unidade_negocio_mov" TEXT,
    "data" TIMESTAMP(3),
    "documento" TEXT,
    "total" DECIMAL(24,10),
    "ano" DECIMAL(24,10),
    "mes" TEXT,
    "cod_prod" TEXT,
    "armazem" TEXT,
    "produto" TEXT,
    "nome" TEXT,
    "cidade" TEXT,
    "cfop" TEXT,
    "cnpj" TEXT,
    "nome_marca_cadastro" TEXT,
    "nicho" TEXT,
    "mercado" TEXT,
    "cliente_money" TEXT,
    "definicao" TEXT,
    "grupo_marca_oficial" TEXT,
    "estado" TEXT,
    "filial" TEXT,
    "quantidade" DECIMAL(24,10),
    "custo" DECIMAL(24,10),
    "cliente_contr_icms" TEXT,
    "empresa" TEXT,
    "check_empresa" TEXT,
    "bu" TEXT,
    "bu_ajustada" TEXT,
    "regra" TEXT,
    "filial_ideal_final" TEXT,
    "tributacao" TEXT,
    "cpf_ou_cnpj" TEXT,
    "nome_grupo_marca" TEXT,

    CONSTRAINT "historico_vendas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarefa_cockpit" (
    "id" SERIAL NOT NULL,
    "data_snapshot" DATE NOT NULL,
    "codigo" TEXT NOT NULL,
    "filial" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "concluida_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluida_por" TEXT NOT NULL,

    CONSTRAINT "tarefa_cockpit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "fiscal_codigo_idx" ON "fiscal"("codigo");

-- CreateIndex
CREATE INDEX "fornecedores_fornecedor_normalizado_idx" ON "fornecedores"("fornecedor_normalizado");

-- CreateIndex
CREATE INDEX "cenario_salvo_createdAt_idx" ON "cenario_salvo"("createdAt");

-- CreateIndex
CREATE INDEX "analise_ia_data_snapshot_createdAt_idx" ON "analise_ia"("data_snapshot", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "lead_time_fornecedor_fornecedor_cd_key" ON "lead_time_fornecedor"("fornecedor", "cd");

-- CreateIndex
CREATE INDEX "pedidos_de_compra_codigo_idx" ON "pedidos_de_compra"("codigo");

-- CreateIndex
CREATE INDEX "pedidos_de_compra_data_snapshot_idx" ON "pedidos_de_compra"("data_snapshot");

-- CreateIndex
CREATE INDEX "pedidos_codigo_snapshot_idx" ON "pedidos_de_compra"("codigo", "data_snapshot");

-- CreateIndex
CREATE INDEX "simulador_codigo_idx" ON "simulador"("codigo");

-- CreateIndex
CREATE INDEX "simulador_data_snapshot_idx" ON "simulador"("data_snapshot");

-- CreateIndex
CREATE INDEX "simulador_snapshot_codigo_idx" ON "simulador"("data_snapshot", "codigo");

-- CreateIndex
CREATE INDEX "forecast_codigo_idx" ON "forecast"("codigo");

-- CreateIndex
CREATE INDEX "forecast_data_snapshot_idx" ON "forecast"("data_snapshot");

-- CreateIndex
CREATE INDEX "forecast_snapshot_codigo_idx" ON "forecast"("data_snapshot", "codigo");

-- CreateIndex
CREATE INDEX "plano_compra_codigo_idx" ON "plano_compra"("codigo");

-- CreateIndex
CREATE INDEX "plano_compra_data_snapshot_idx" ON "plano_compra"("data_snapshot");

-- CreateIndex
CREATE INDEX "plano_snapshot_codigo_idx" ON "plano_compra"("data_snapshot", "codigo");

-- CreateIndex
CREATE INDEX "transferencias_abertas_codigo_idx" ON "transferencias_abertas"("codigo");

-- CreateIndex
CREATE INDEX "transferencias_abertas_data_snapshot_idx" ON "transferencias_abertas"("data_snapshot");

-- CreateIndex
CREATE INDEX "transf_snapshot_codigo_idx" ON "transferencias_abertas"("data_snapshot", "codigo");

-- CreateIndex
CREATE INDEX "recebimento_codigo_idx" ON "recebimento"("codigo");

-- CreateIndex
CREATE INDEX "recebimento_codigo_datas_idx" ON "recebimento"("codigo", "data_pedido", "data");

-- CreateIndex
CREATE INDEX "historico_vendas_cod_prod_idx" ON "historico_vendas"("cod_prod");

-- CreateIndex
CREATE INDEX "historico_vendas_data_idx" ON "historico_vendas"("data");

-- CreateIndex
CREATE INDEX "historico_vendas_cod_prod_data_idx" ON "historico_vendas"("cod_prod", "data");

-- CreateIndex
CREATE INDEX "tarefa_cockpit_data_snapshot_idx" ON "tarefa_cockpit"("data_snapshot");

-- CreateIndex
CREATE UNIQUE INDEX "tarefa_cockpit_data_snapshot_codigo_filial_key" ON "tarefa_cockpit"("data_snapshot", "codigo", "filial");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

