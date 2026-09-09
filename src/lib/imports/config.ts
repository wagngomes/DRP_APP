import type { Prisma, PrismaClient } from "@/generated/prisma/client";

/**
 * "codigo" é string com normalização de zeros à esquerda: exports do mesmo
 * relatório às vezes vêm com o campo preenchido a 6 dígitos ("001006") e às
 * vezes sem ("1006"), e como esses campos são chave de cruzamento entre as
 * bases, a diferença de formato quebra todos os joins silenciosamente.
 */
export type ImportColumnType =
  | "string"
  | "decimal"
  | "int"
  | "date"
  | "codigo"
  /** CNPJ/CPF: recupera zero à esquerda e descarta notação científica. */
  | "documento";

export type ImportColumn = {
  /** Nome do campo no model Prisma — também é o header esperado no CSV. */
  field: string;
  type: ImportColumnType;
};

export type ImportModelKey =
  | "produtos"
  | "fiscal"
  | "rotas"
  | "filiais"
  | "fornecedores"
  | "lead_time_fornecedor"
  | "pedidos_de_compra"
  | "simulador"
  | "forecast"
  | "plano_compra"
  | "transferencias_abertas"
  | "recebimento"
  | "sla_transferencias"
  | "clientes_grupos"
  | "historico_vendas";

export type ImportReference = {
  /** Campo do próprio model que guarda a chave estrangeira (ex: "codigo"). */
  field: string;
  /** Nome da propriedade do delegate referenciado no PrismaClient (ex: "produtos"). */
  targetDelegate: keyof PrismaClient & string;
  /** Campo único no model referenciado (ex: "codigo"). */
  targetField: string;
  /** Nome amigável da tabela referenciada, usado nas mensagens de linhas ignoradas. */
  label: string;
};

export type ImportModelConfig = {
  key: ImportModelKey;
  label: string;
  /** Nome da propriedade do delegate no PrismaClient (prisma.<delegate>). */
  delegate: keyof PrismaClient & string;
  /**
   * Nome físico da tabela no Postgres (@@map do model), usado pelo COPY —
   * que é SQL puro e não passa pelo mapeamento do Prisma. Só precisa ser
   * informado quando divergir de `key`.
   */
  table?: string;
  columns: ImportColumn[];
  /**
   * Campo usado como chave primária / ordenação da tabela.
   * Padrão "id" (autoincrement) — Produtos sobrescreve para "codigo",
   * já que a própria coluna já é única e serve como chave.
   */
  idField?: string;
  /**
   * Chaves estrangeiras a validar antes de inserir — linhas cujo valor não
   * existir na tabela referenciada são ignoradas (viram skippedRows) em vez
   * de derrubar a importação inteira por violação de FK no banco.
   */
  references?: ImportReference[];
  /**
   * Quando true, o upload NÃO apaga os dados existentes — cada importação é
   * adicionada como um novo snapshot (ex: Pedidos de Compra, um upload por
   * dia, mantendo o histórico). Exige `snapshotField`.
   */
  cumulative?: boolean;
  /** Campo (DateTime @db.Date) preenchido pelo servidor com a data do upload — não vem do CSV. */
  snapshotField?: string;
  /**
   * Como a data de referência do sistema recorta esta tabela nas consultas:
   * - "day": só o snapshot daquele dia exato (bases atualizadas diariamente)
   * - "month": todos os snapshots do mês da data (bases atualizadas 1x por mês)
   * Ausente = a tabela não é recortada por data (cadastros e bases estáveis).
   */
  snapshotScope?: "day" | "month";
};

export function getIdField(model: ImportModelConfig): string {
  return model.idField ?? "id";
}

export function getTableName(model: ImportModelConfig): string {
  return model.table ?? model.key;
}

/**
 * Colunas exibidas na tabela da tela de uploads. Models cumulativos ganham a
 * data do snapshot na frente: como as linhas de vários dias convivem, sem ela
 * não dá para saber de que importação cada linha veio.
 */
export function getDisplayColumns(model: ImportModelConfig): ImportColumn[] {
  if (model.cumulative && model.snapshotField) {
    return [{ field: model.snapshotField, type: "date" }, ...model.columns];
  }
  return model.columns;
}

function col(field: string, type: ImportColumnType = "string"): ImportColumn {
  return { field, type };
}

export const IMPORT_MODELS: ImportModelConfig[] = [
  {
    key: "produtos",
    label: "Produtos",
    delegate: "produtos",
    idField: "codigo",
    columns: [
      col("codigo", "codigo"),
      col("descricao"),
      col("tipo"),
      col("unidade"),
      col("cod_barras"),
      col("cod_fabrica"),
      col("cod_marca"),
      col("marca"),
      col("grp_marca"),
      col("d_grp_marca"),
      col("grupo"),
      col("tag_medic"),
      col("tipo_medicamento"),
      col("principio_ativo"),
      col("usa_refrig"),
    ],
  },
  {
    key: "fiscal",
    label: "Fiscal",
    delegate: "fiscal",
    references: [
      { field: "codigo", targetDelegate: "produtos", targetField: "codigo", label: "Produtos" },
    ],
    columns: [
      col("codigo", "codigo"),
      col("segmento_pricing"),
      col("categoria_gc"),
      col("classe"),
      col("ean"),
      col("uf_fornecedor"),
      col("tributacao"),
    ],
  },
  {
    key: "rotas",
    label: "Rotas",
    delegate: "rotas",
    idField: "codigo_rota",
    columns: [
      col("codigo_rota", "codigo"),
      col("descricao"),
      col("descricao_cod"),
      col("filial_final"),
      col("filial_final_cod", "codigo"),
      col("empresa"),
    ],
  },
  {
    key: "filiais",
    label: "Filiais",
    delegate: "filiais",
    idField: "codigo",
    columns: [col("codigo", "codigo"), col("sigla"), col("descricao")],
  },
  {
    key: "fornecedores",
    label: "Fornecedores",
    delegate: "fornecedores",
    idField: "fornecedor",
    columns: [col("fornecedor"), col("fornecedor_normalizado")],
  },
  {
    key: "lead_time_fornecedor",
    label: "Lead Time Fornecedor",
    delegate: "leadTimeFornecedor",
    // Sem `idField`: a chave é (fornecedor, cd), composta, então o import
    // substitui a tabela inteira — mesmo tratamento de SLA Transferências.
    columns: [col("fornecedor"), col("cd", "codigo"), col("lead_time", "int")],
  },
  {
    key: "pedidos_de_compra",
    label: "Pedidos de Compra",
    delegate: "pedidosDeCompra",
    cumulative: true,
    snapshotField: "data_snapshot",
    snapshotScope: "day",
    references: [
      { field: "codigo", targetDelegate: "produtos", targetField: "codigo", label: "Produtos" },
    ],
    columns: [
      col("codigo", "codigo"),
      col("descricao"),
      col("armazem"),
      col("cod_fornecedor"),
      col("data_emissao", "date"),
      col("data_entrega", "date"),
      col("filial", "codigo"),
      col("grupo_marca"),
      col("num_pedido"),
      col("quantidade_entregue", "int"),
      col("quantidade_total", "int"),
      col("quantidade_receber", "int"),
      col("unidade"),
      col("saldo_ajustado", "decimal"),
      col("tp_ped_transf"),
      col("tp_ped_transf_descricao"),
      col("rota_final", "codigo"),
      col("porcentagem_entregue", "decimal"),
      col("categoria"),
      col("comprador"),
      col("tributacao"),
      col("supridor"),
      col("provider"),
      col("lt", "int"),
      col("bo"),
      col("frete"),
      col("cob_cd", "decimal"),
      col("cob_br", "decimal"),
      col("data_pedra", "date"),
      col("status_lt"),
      col("ruptura_cd"),
      col("ruptura_br"),
      col("nota_fiscal"),
      col("status_logistica"),
      col("data_agendada"),
    ],
  },
  {
    key: "simulador",
    label: "Simulador",
    delegate: "simulador",
    cumulative: true,
    snapshotField: "data_snapshot",
    snapshotScope: "day",
    columns: [
      col("cod_prod_cod_filial"),
      col("codigo", "codigo"),
      col("filial", "codigo"),
      col("produto"),
      col("marca"),
      col("fornecedor"),
      col("est_arm_01", "decimal"),
      col("est_arm_11", "decimal"),
      col("est_arm_26", "decimal"),
      col("est_arm_nac", "decimal"),
      col("est_arm_q40", "decimal"),
      col("est_arm_rc", "decimal"),
      col("estoque_cmv", "decimal"),
      col("cmv_unitario", "decimal"),
      col("cmv_unitario_1", "decimal"),
      col("compras_arm_01", "decimal"),
      col("compras_arm_26", "decimal"),
      col("compras_arm_nac", "decimal"),
      col("valor_pedido_aberto_bruto", "decimal"),
      col("valor_pedido_aberto_cmv", "decimal"),
      col("em_transf_arm_01", "decimal"),
      col("em_transf_arm_11", "decimal"),
      col("em_transf_arm_26", "decimal"),
      col("total_trans", "decimal"),
      col("reserva", "decimal"),
      col("qtd_pendente", "decimal"),
      col("bloqueio"),
      col("vendido_m0_arm_01", "decimal"),
      col("vendido_m0_arm_26", "decimal"),
      col("vendido_m0_arm_11", "decimal"),
      col("vendido_m0_arm_tr", "decimal"),
    ],
  },
  {
    key: "forecast",
    label: "Forecast",
    delegate: "forecast",
    cumulative: true,
    snapshotField: "data_snapshot",
    // Forecast é do mês: a carga do dia 3 vale para agosto inteiro.
    snapshotScope: "month",
    references: [
      { field: "codigo", targetDelegate: "produtos", targetField: "codigo", label: "Produtos" },
    ],
    columns: [
      col("codigo", "codigo"),
      col("filial", "codigo"),
      col("rota_compra"),
      col("curva"),
      col("b_u"),
      col("analista"),
      col("forecast_m0", "decimal"),
      col("forecast_m0_atualizado", "decimal"),
      col("politica", "decimal"),
      col("politica_plano", "decimal"),
      col("torre"),
      col("m_4", "decimal"),
      col("m_3", "decimal"),
      col("m_2", "decimal"),
      col("m_1", "decimal"),
    ],
  },
  {
    key: "plano_compra",
    label: "Plano de Compra",
    delegate: "planoCompra",
    // Carga mensal — o histórico dos meses anteriores é preservado.
    cumulative: true,
    snapshotField: "data_snapshot",
    // A carga é mensal: filtrar pelo dia exato devolveria vazio em quase todo
    // dia do mês, então o recorte é pelo mês da data de referência.
    snapshotScope: "month",
    references: [
      { field: "codigo", targetDelegate: "produtos", targetField: "codigo", label: "Produtos" },
    ],
    columns: [col("codigo", "codigo"), col("empresa"), col("plano_de_compra", "decimal")],
  },
  {
    key: "transferencias_abertas",
    label: "Transferências Abertas",
    delegate: "transferenciasAbertas",
    cumulative: true,
    snapshotField: "data_snapshot",
    snapshotScope: "day",
    references: [
      { field: "codigo", targetDelegate: "produtos", targetField: "codigo", label: "Produtos" },
    ],
    columns: [
      col("tipo_nf_saida"),
      col("filial_codigo_saida", "codigo"),
      col("serie_nf_saida"),
      col("numero_nf_saida"),
      col("cfop"),
      col("cliente_codigo"),
      col("loja_codigo"),
      col("empresa_saida"),
      col("cnpj_saida", "documento"),
      col("uf_saida"),
      col("data_emissao", "date"),
      col("linha_item", "decimal"),
      col("codigo", "codigo"),
      col("un_produto"),
      col("descricao_produto"),
      col("qtde", "decimal"),
      col("valor", "decimal"),
      col("valor_sd2_custo_1", "decimal"),
      col("valor_icms_saida", "decimal"),
      col("valor_icms_st", "decimal"),
      col("local"),
      col("pedido_venda_protheus"),
      col("item_pedido_venda", "decimal"),
      col("pedido_bo"),
      col("status_classificada"),
      col("empresa_entrada"),
      col("filial_codigo_entrada", "codigo"),
      col("descricao_filial_entrada"),
      col("cnpj_entrada", "documento"),
      col("estado_entrada"),
      col("lote"),
      col("validade_lote", "date"),
      col("tipo_produto"),
      col("rota"),
      col("passo", "decimal"),
      col("qtde_passo", "decimal"),
      col("usuario_pedido_venda"),
    ],
  },
  {
    key: "recebimento",
    label: "Recebimento",
    delegate: "recebimento",
    columns: [
      col("armazem"),
      col("arq"),
      col("tes"),
      col("definicao"),
      col("cfop"),
      col("cidade"),
      col("cnpj", "documento"),
      col("ol"),
      col("loja"),
      col("nome"),
      col("data_emissao", "date"),
      col("data", "date"),
      col("data_pedido", "date"),
      col("lead_time", "decimal"),
      col("documento"),
      col("estado"),
      col("filial", "codigo"),
      col("cod_marca_cadastro"),
      col("nome_marca_cadastro"),
      col("nome_grupo_marca"),
      col("grupo_marca_oficial"),
      col("quantidade", "decimal"),
      col("codigo", "codigo"),
      col("produto"),
      col("pedido"),
      col("lote"),
      col("data_validade", "date"),
      col("custo", "decimal"),
      col("valor_total", "decimal"),
      col("cofins", "decimal"),
      col("pis", "decimal"),
      col("ipi", "decimal"),
      col("icms", "decimal"),
      col("icms_complementar", "decimal"),
      col("icms_st", "decimal"),
      col("origem"),
      col("pis_cofins"),
      col("tributacao"),
      col("codigo_tributario"),
      col("grupo_tributario"),
      col("ncm"),
      col("cst_pis"),
      col("tipo_credito"),
      col("aliq_icms", "decimal"),
    ],
  },
  {
    key: "sla_transferencias",
    label: "SLA Transferências",
    delegate: "slaTransferencias",
    columns: [
      col("filial_orig", "codigo"),
      col("filial_dest", "codigo"),
      col("mat_med"),
      col("ativo", "decimal"),
      col("transit_time", "decimal"),
    ],
  },
  {
    key: "clientes_grupos",
    label: "Clientes / Grupos",
    delegate: "clientesGrupos",
    columns: [
      col("cliente_codigo"),
      col("cliente_loja"),
      col("cliente_nome"),
      col("cliente_cnpj", "documento"),
      col("cliente_grupo"),
    ],
  },
  {
    key: "historico_vendas",
    label: "Histórico de Vendas",
    delegate: "historicoVendas",
    columns: [
      col("unidade_negocio_mov"),
      col("data", "date"),
      col("documento"),
      col("total", "decimal"),
      col("ano", "decimal"),
      col("mes"),
      col("cod_prod", "codigo"),
      col("armazem"),
      col("produto"),
      col("nome"),
      col("cidade"),
      col("cfop"),
      col("cnpj", "documento"),
      col("nome_marca_cadastro"),
      col("nicho"),
      col("mercado"),
      col("cliente_money"),
      col("definicao"),
      col("grupo_marca_oficial"),
      col("estado"),
      col("filial", "codigo"),
      col("quantidade", "decimal"),
      col("custo", "decimal"),
      col("cliente_contr_icms"),
      col("empresa"),
      col("check_empresa"),
      col("bu"),
      col("bu_ajustada"),
      col("regra"),
      col("filial_ideal_final"),
      col("tributacao"),
      col("cpf_ou_cnpj"),
      col("nome_grupo_marca"),
    ],
  },
];

export const IMPORT_MODEL_KEYS = IMPORT_MODELS.map((m) => m.key) as [
  ImportModelKey,
  ...ImportModelKey[],
];

export function getImportModel(key: string): ImportModelConfig | undefined {
  return IMPORT_MODELS.find((m) => m.key === key);
}

export function humanizeColumn(field: string): string {
  return field
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export type { Prisma };
