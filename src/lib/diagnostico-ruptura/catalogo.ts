/**
 * O catálogo de causas.
 *
 * Cada causa tem um `slug` fixo, que vai para o banco e nunca muda — renomear
 * um slug invalidaria os diagnósticos já gravados e as revisões dos analistas
 * feitas contra eles. O rótulo, esse sim, pode mudar: é só texto de tela.
 *
 * A **etapa** diz em que ponto da cadeia a falha aconteceu, e é ela que a tela
 * usa para mostrar "onde a corrente quebra". O **dono** existe para priorizar
 * conversa, não para atribuir culpa — e por isso a tela agrupa por etapa, não
 * por dono.
 *
 * A ordem do catálogo é a ordem da cadeia: o que acontece antes aparece antes.
 * Importa porque duas causas podem explicar os mesmos dias, e a mais profunda
 * tem precedência — venda acelerada no mês anterior explica a abertura
 * descoberta, não o contrário.
 */

export type Etapa =
  | "dados"
  | "partida"
  | "demanda"
  | "plano"
  | "compra"
  | "fornecedor"
  | "movimentacao";

export type Causa = {
  slug: string;
  rotulo: string;
  etapa: Etapa;
  dono: string;
  /** Uma frase: o que precisa ser verdade para esta causa valer. */
  regra: string;
};

/** Rótulo e ordem de cada etapa, para a tela desenhar a cadeia. */
export const ETAPAS: { id: Etapa; rotulo: string }[] = [
  { id: "dados", rotulo: "Dados" },
  { id: "partida", rotulo: "Ponto de partida" },
  { id: "demanda", rotulo: "Demanda" },
  { id: "plano", rotulo: "Plano" },
  { id: "compra", rotulo: "Compra" },
  { id: "fornecedor", rotulo: "Fornecedor" },
  { id: "movimentacao", rotulo: "Movimentação interna" },
];

/**
 * As causas da primeira fatia.
 *
 * Escolhidas pela medição, não pelo catálogo inteiro do PRD: 86% das posições
 * rompidas abriram o mês zeradas ou abaixo da política, então o eixo do ponto
 * de partida é onde está o peso. As causas de disponibilidade travada —
 * quarentena, bloqueio, reserva — valem 11%, 2% e 1%, e ficam para depois.
 */
export const CAUSAS: Causa[] = [
  {
    slug: "base_inconsistente",
    rotulo: "Dado da carga não confiável",
    etapa: "dados",
    dono: "TI e Planejamento",
    regra:
      "a carga do dia falhou no teste de sanidade — nenhuma área é responsabilizada sobre dado quebrado",
  },
  {
    slug: "venda_acelerada_mes_anterior",
    rotulo: "Venda do mês anterior acelerada",
    etapa: "partida",
    dono: "Demanda e Comercial",
    regra:
      "o mês anterior vendeu acima do previsto e consumiu o estoque que abriria este mês",
  },
  {
    slug: "abertura_descoberta",
    rotulo: "Mês começou descoberto",
    etapa: "partida",
    dono: "Planejamento",
    regra:
      "na foto de abertura o estoque estava abaixo da política e o que vinha a caminho não cobria o consumo até a ruptura",
  },
  {
    slug: "nova_abertura",
    rotulo: "Forecast aberto sem tempo de comprar",
    etapa: "demanda",
    dono: "Comercial e Planejamento",
    regra:
      "o CD passou a ter forecast há menos de um lead time — não houve prazo para abastecer",
  },
  {
    slug: "venda_acima_forecast",
    rotulo: "Venda acima do forecast",
    etapa: "demanda",
    dono: "Demanda e Comercial",
    regra: "a venda do mês superou o forecast proporcional aos dias decorridos",
  },
  {
    slug: "fora_do_plano",
    rotulo: "Fora do plano de compras",
    etapa: "plano",
    dono: "Planejamento",
    regra: "o item não tinha plano de compra no mês, ou o plano era zero",
  },
  {
    slug: "plano_insuficiente",
    rotulo: "Plano de compras insuficiente",
    etapa: "plano",
    dono: "Planejamento",
    regra: "havia plano, mas abaixo da necessidade do período",
  },
  {
    slug: "fornecedor_atrasou",
    rotulo: "Fornecedor atrasou a entrega",
    etapa: "fornecedor",
    dono: "Fornecedor e Compras",
    regra:
      "a entrega chegou depois do prazo cadastrado, de forma isolada — não é o padrão deste fornecedor neste CD",
  },
  {
    slug: "lead_time_cadastro",
    rotulo: "Prazo cadastrado desatualizado",
    etapa: "compra",
    dono: "Planejamento",
    regra:
      "o prazo real estoura o cadastrado na maioria das entregas — não é atraso, é cadastro errado, e ele alimenta toda data limite de compra do sistema",
  },
  {
    slug: "transferencia_nao_feita",
    rotulo: "Transferência não feita",
    etapa: "movimentacao",
    dono: "Planejamento e Logística",
    regra:
      "outro CD tinha cobertura folgada quando a ruptura ficou previsível, e nenhuma transferência saiu",
  },
  {
    slug: "sem_evidencia",
    rotulo: "Sem evidência suficiente",
    etapa: "dados",
    dono: "TI e Planejamento",
    regra: "os dias que nenhuma causa testada conseguiu explicar",
  },
];

const PORSLUG = new Map(CAUSAS.map((c) => [c.slug, c]));

export function causaPorSlug(slug: string): Causa | undefined {
  return PORSLUG.get(slug);
}

/**
 * O papel de uma causa num evento.
 *
 * `causa` leva dias; as outras duas não. A distinção existe porque uma regra
 * pode falhar sem ter causado nada — comprou pouco, mas o pedido chegou a
 * tempo mesmo assim. Dizer "isto também estava errado, e não foi o que
 * quebrou" é informação; somá-la aos dias seria mentira.
 */
export type Papel = "causa" | "oportunidade" | "observacao";
