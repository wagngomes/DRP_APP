-- CreateTable
CREATE TABLE "produtos" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "codigo" TEXT,
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

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "rotas" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "codigo_rota" TEXT,
    "descricao" TEXT,
    "descricao_cod" TEXT,
    "filial_final" TEXT,
    "filial_final_cod" TEXT,
    "empresa" TEXT,

    CONSTRAINT "rotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos_de_compra" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "codigo" TEXT,
    "descricao" TEXT,
    "armazem" TEXT,
    "cod_fornecedor" TEXT,
    "data_emissao" TIMESTAMP(3),
    "data_entrega" TIMESTAMP(3),
    "filial" TEXT,
    "grupo_marca" TEXT,
    "num_pedido" TEXT,
    "quantidade_entregue" DECIMAL(24,10),
    "quantidade_total" DECIMAL(24,10),
    "quantidade_receber" DECIMAL(24,10),
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
    "lt" DECIMAL(24,10),
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
    "codigo" TEXT,
    "filial" TEXT,
    "rota_compra" TEXT,
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
    "codigo" TEXT,
    "empresa" TEXT,
    "plano_de_compra" DECIMAL(24,10),

    CONSTRAINT "plano_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transferencias_abertas" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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

-- CreateIndex
CREATE UNIQUE INDEX "produtos_codigo_key" ON "produtos"("codigo");

-- CreateIndex
CREATE INDEX "fiscal_codigo_idx" ON "fiscal"("codigo");

-- CreateIndex
CREATE INDEX "pedidos_de_compra_codigo_idx" ON "pedidos_de_compra"("codigo");

-- CreateIndex
CREATE INDEX "simulador_codigo_idx" ON "simulador"("codigo");

-- CreateIndex
CREATE INDEX "forecast_codigo_idx" ON "forecast"("codigo");

-- CreateIndex
CREATE INDEX "plano_compra_codigo_idx" ON "plano_compra"("codigo");

-- CreateIndex
CREATE INDEX "transferencias_abertas_codigo_idx" ON "transferencias_abertas"("codigo");

-- CreateIndex
CREATE INDEX "recebimento_codigo_idx" ON "recebimento"("codigo");

-- CreateIndex
CREATE INDEX "historico_vendas_cod_prod_idx" ON "historico_vendas"("cod_prod");
