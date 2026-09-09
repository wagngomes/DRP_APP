/**
 * A camada de IA da simulação de cenários.
 *
 * Duas chamadas, com papéis estritamente separados — e nenhuma delas produz
 * número:
 *
 *   1. **Interpretar** a pergunta em português e devolver uma `Premissa`
 *      estruturada. É tradução, não análise: a frase "só começamos a receber
 *      dia 21" vira `{ tipo: "entrada_futura", dataEntrada: "2026-09-21" }`.
 *      O motor faz o resto.
 *
 *   2. **Narrar** o resultado que o motor calculou, e propor contingências
 *      escolhendo dentro de um vocabulário fechado de ações. Essas ações voltam
 *      ao motor, que recalcula o cenário — a terceira seção da tela é simulada
 *      de novo, não descrita.
 *
 * A regra que vale para todo este módulo: se um número aparece na tela, ele
 * veio do motor. O modelo recebe valores prontos e devolve ordenação e texto.
 * Qualquer código de produto ou CD que ele cite é conferido contra o dossiê e
 * descartado se não estiver lá.
 */
import { z } from "zod";

import { extrairJson, gerarTexto } from "@/lib/ia/cliente";
import type { Acao, PosicaoSimulada, Premissa, ResultadoSimulacao } from "./motor";

/** Quantas posições vão no dossiê. As piores bastam para a análise. */
const LIMITE_POSICOES = 60;

/** Trunca em vez de rejeitar: um texto longo demais não deve perder a análise. */
const textoAte = (n: number) =>
  z.string().transform((s) => (s.length > n ? `${s.slice(0, n - 1)}…` : s));

const premissaSchema = z.object({
  tipo: z.literal("entrada_futura"),
  dataEntrada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fracao: z.number().min(0).max(1).optional(),
  /** Como o modelo entendeu a pergunta, para o usuário conferir. */
  interpretacao: textoAte(300),
});

const acaoSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("transferencia"),
    codigo: z.string(),
    origem: z.string(),
    destino: z.string(),
    quantidade: z.number().positive(),
    justificativa: textoAte(300),
  }),
  z.object({
    tipo: z.literal("antecipar_entrada"),
    codigo: z.string().optional(),
    novaData: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    justificativa: textoAte(300),
  }),
  z.object({
    tipo: z.literal("compra_emergencial"),
    codigo: z.string(),
    destino: z.string(),
    quantidade: z.number().positive(),
    chegada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    justificativa: textoAte(300),
  }),
]);

const criticoSchema = z.object({
  codigo: z.string(),
  filial: z.string(),
  titulo: textoAte(120),
  porque: textoAte(500),
});

/** Tetos aplicados no código, por corte — nunca como condição de validação. */
const MAX_CRITICOS = 20;
const MAX_ACOES = 12;

export type AnaliseCenario = {
  resumo: string;
  criticos: z.infer<typeof criticoSchema>[];
  acoes: z.infer<typeof acaoSchema>[];
};
export type AcaoComTexto = z.infer<typeof acaoSchema>;

const SYSTEM = `Você é um especialista em planejamento de abastecimento (DRP) de um distribuidor
farmacêutico e hospitalar brasileiro. Recebe o resultado de uma simulação já calculada e
explica as consequências para o time de planejamento.

REGRAS INVIOLÁVEIS
1. Nunca calcule, estime ou invente número, data, quantidade ou prazo. Todos os valores já
   vêm calculados no dossiê. Se um dado não estiver lá, não o mencione.
2. Nunca invente código de produto nem código de CD. Cite apenas os que aparecem no dossiê.
3. Não afirme que uma ação resolve o problema. O sistema vai recalcular a simulação com as
   ações que você propuser e mostrar o resultado real — sua parte é escolher ações
   plausíveis e dizer por quê.
4. Escreva em português do Brasil, direto, sem jargão de consultoria.

SOBRE AS AÇÕES
Você escolhe entre três tipos, e só eles:
- "transferencia": mover unidades de um CD que tem sobra para um que vai romper. Só proponha
  origem que apareça no dossiê com estoque folgado no mesmo item.
- "antecipar_entrada": negociar com o fornecedor uma data mais cedo. A data proposta
  precisa ser ANTERIOR à data da premissa — repetir a data do cenário não é uma ação.
- "compra_emergencial": compra avulsa entregue direto num CD, fora da rota normal.

Prefira transferência a compra: é mais rápida e não gasta dinheiro novo. Uma ação que chega
depois da ruptura já instalada ajuda pouco — priorize onde o prazo faz diferença.`;

/**
 * Traduz a pergunta em premissa.
 *
 * Recebe a data de referência porque o usuário escreve "dia 21" e não
 * "2026-09-21": sem a âncora, o modelo teria de adivinhar o ano e o mês.
 */
export async function interpretarPergunta(
  pergunta: string,
  fornecedor: string,
  dataReferencia: string
): Promise<
  | { ok: true; premissa: Premissa; interpretacao: string }
  | { ok: false; erro: string }
> {
  const prompt = `Data de referência do sistema: ${dataReferencia}
Fornecedor selecionado: ${fornecedor}

Pergunta do usuário:
"""
${pergunta}
"""

Converta a pergunta em uma premissa de simulação. Hoje o sistema só sabe simular um tipo:

  "entrada_futura" — o saldo de compra do mês que ainda NÃO foi colocado passa a entrar na
  rede a partir de uma data. Pedidos já em aberto continuam chegando normalmente.

Responda APENAS com JSON, sem texto antes ou depois:

{
  "tipo": "entrada_futura",
  "dataEntrada": "AAAA-MM-DD",
  "fracao": 1,
  "interpretacao": "uma frase dizendo o que você entendeu, para o usuário conferir"
}

"fracao" é a parte do saldo que entra nessa data (1 = todo o saldo). Datas relativas devem
ser resolvidas contra a data de referência. Se a pergunta não puder ser convertida nesse
tipo, responda {"erro": "explique em uma frase o que faltou"}.`;

  const resposta = await gerarTexto(SYSTEM, prompt);
  if (!resposta.ok) return { ok: false, erro: resposta.erro };

  const bruto = extrairJson(resposta.texto);
  if (!bruto || typeof bruto !== "object") {
    return { ok: false, erro: "Não consegui interpretar a pergunta. Tente reformular." };
  }

  if ("erro" in bruto && typeof bruto.erro === "string") {
    return { ok: false, erro: bruto.erro };
  }

  const validado = premissaSchema.safeParse(bruto);
  if (!validado.success) {
    return { ok: false, erro: "Não consegui interpretar a pergunta. Tente reformular." };
  }

  return {
    ok: true,
    premissa: {
      tipo: "entrada_futura",
      fornecedor,
      dataEntrada: validado.data.dataEntrada,
      fracao: validado.data.fracao,
    },
    interpretacao: validado.data.interpretacao,
  };
}

/** Uma linha do dossiê: tudo já calculado, nada a deduzir. */
function linhaDossie(p: PosicaoSimulada): string {
  const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "sem data");
  const partes = [
    `${p.codigo}|${p.filial}`,
    `desc=${p.descricao ?? "-"}`,
    `chao=${Math.round(p.estoqueInicial)}`,
    `consumo_dia=${p.consumoDiario.toFixed(1)}`,
    `rompe=${d(p.dataRuptura)}`,
    `dias_descobertos=${p.diasDescobertosAteEntrada}`,
    `falta_un=${p.faltaUnidades}`,
    `entrada_futura=${Math.round(p.entradaFutura)}`,
    `chega=${d(p.chegadaFutura)}`,
  ];
  if (p.percurso.length > 1) {
    partes.push(`rota=${p.percurso.map((x) => `${x.cd}:${d(x.chegada)}`).join(">")}`);
  }
  if (p.aviso) partes.push(`aviso=${p.aviso}`);
  return partes.join(" ");
}

/** Posições com folga, candidatas a origem de transferência. */
function linhasFolga(resultado: ResultadoSimulacao): string {
  return resultado.posicoes
    .filter((p) => !p.rompeAntesDaEntrada && p.estoqueInicial > 0)
    .sort((a, b) => b.estoqueInicial / (b.consumoDiario || 1) - a.estoqueInicial / (a.consumoDiario || 1))
    .slice(0, 25)
    .map(
      (p) =>
        `${p.codigo}|${p.filial} chao=${Math.round(p.estoqueInicial)} ` +
        `cobertura_dias=${(p.estoqueInicial / (p.consumoDiario || 1)).toFixed(0)}`
    )
    .join("\n");
}

export function montarDossie(resultado: ResultadoSimulacao, pergunta: string): string {
  const criticas = resultado.posicoes.filter((p) => p.rompeAntesDaEntrada);
  const mostradas = criticas.slice(0, LIMITE_POSICOES);
  const diasTotais = criticas.reduce((a, p) => a + p.diasDescobertosAteEntrada, 0);
  const faltaTotal = criticas.reduce((a, p) => a + p.faltaUnidades, 0);

  return `PERGUNTA DO USUÁRIO
${pergunta}

CENÁRIO SIMULADO
fornecedor=${resultado.premissa.fornecedor}
data_base=${resultado.dataBase}
entrada_do_saldo=${resultado.premissa.dataEntrada}
saldo_a_colocar=${Math.round(resultado.saldoTotal)} un em ${resultado.itensComSaldo} itens
posicoes_avaliadas=${resultado.posicoes.length}
posicoes_que_rompem_antes_da_carga=${resultado.totalRompem}
posicoes_ja_zeradas_hoje=${resultado.jaZeradas}
dias_descobertos_somados=${diasTotais}
unidades_faltando=${faltaTotal}
posicoes_sem_projecao=${resultado.semProjecao}

POSICOES CRITICAS (${mostradas.length} de ${criticas.length}, piores primeiro)
${mostradas.map(linhaDossie).join("\n")}

POSICOES COM FOLGA (candidatas a origem de transferência)
${linhasFolga(resultado) || "nenhuma"}`;
}

/**
 * Escreve a análise e propõe contingências.
 *
 * Descarta silenciosamente qualquer posição ou ação que cite código/CD fora do
 * dossiê — é a mesma guarda contra alucinação usada no cockpit, e ela já pegou
 * casos reais neste projeto.
 */
export async function analisarCenario(
  resultado: ResultadoSimulacao,
  pergunta: string
): Promise<{ ok: true; analise: AnaliseCenario } | { ok: false; erro: string }> {
  const dossie = montarDossie(resultado, pergunta);

  const prompt = `${dossie}

---

Responda APENAS com um objeto JSON válido, sem texto antes ou depois:

{
  "resumo": "2 a 5 frases: o tamanho do problema, o padrão que se repete, o que mais pesa. Cite os números do dossiê.",
  "criticos": [
    { "codigo": "...", "filial": "...", "titulo": "até 10 palavras", "porque": "por que esta posição é a mais grave, citando o número que sustenta" }
  ],
  "acoes": [
    { "tipo": "transferencia", "codigo": "...", "origem": "CD", "destino": "CD", "quantidade": 0, "justificativa": "..." },
    { "tipo": "antecipar_entrada", "novaData": "AAAA-MM-DD", "justificativa": "..." },
    { "tipo": "compra_emergencial", "codigo": "...", "destino": "CD", "quantidade": 0, "chegada": "AAAA-MM-DD", "justificativa": "..." }
  ]
}

No máximo 20 posições em "criticos" e 12 em "acoes". Selecionar é parte do trabalho: uma
lista curta e bem escolhida vale mais que uma longa. Em "quantidade" use o falta_un da
posição — é o déficit já calculado.`;

  // Uma repetição quando as duas listas voltam vazias. O dossiê é o mesmo e
  // está completo — listas vazias com resumo preenchido são variação do modelo,
  // e repetir sai mais barato e mais honesto que qualquer heurística de resgate.
  const primeira = await tentarAnalise(resultado, prompt);
  if (
    primeira.ok &&
    primeira.analise.criticos.length === 0 &&
    primeira.analise.acoes.length === 0
  ) {
    console.warn("[cenario] análise sem críticos nem ações; repetindo uma vez");
    const segunda = await tentarAnalise(resultado, prompt);
    if (
      segunda.ok &&
      (segunda.analise.criticos.length > 0 || segunda.analise.acoes.length > 0)
    ) {
      return segunda;
    }
  }
  return primeira;
}

async function tentarAnalise(
  resultado: ResultadoSimulacao,
  prompt: string
): Promise<{ ok: true; analise: AnaliseCenario } | { ok: false; erro: string }> {
  const resposta = await gerarTexto(SYSTEM, prompt);
  if (!resposta.ok) return { ok: false, erro: resposta.erro };

  const bruto = extrairJson(resposta.texto);
  if (!bruto || typeof bruto !== "object") {
    // Registra o texto cru: sem isto, um formato novo do modelo vira um erro
    // genérico na tela e não há como descobrir o que ele devolveu.
    console.error("[cenario] resposta não parseável:", resposta.texto.slice(0, 800));
    return { ok: false, erro: "A análise não voltou em JSON. Tente rodar de novo." };
  }

  // Validação peça a peça, e não do bloco inteiro: um item malformado — ou um
  // a mais do que o teto — não pode derrubar uma análise que está boa no resto.
  // Os tetos viram corte, não condição.
  const obj = bruto as Record<string, unknown>;
  const resumo = typeof obj.resumo === "string" ? obj.resumo.slice(0, 1200) : "";

  const posicoesValidas = new Set(
    resultado.posicoes.map((p) => `${p.codigo}|${p.filial}`)
  );
  const cds = new Set(resultado.posicoes.map((p) => p.filial));
  const itens = new Set(resultado.posicoes.map((p) => p.codigo));

  const criticosBrutos = Array.isArray(obj.criticos) ? obj.criticos : [];
  const criticos: AnaliseCenario["criticos"] = [];
  for (const bruta of criticosBrutos) {
    if (criticos.length >= MAX_CRITICOS) break;
    const c = criticoSchema.safeParse(bruta);
    if (!c.success) continue;
    // Espaço em volta do código acontece e não deveria custar o item.
    const item = { ...c.data, codigo: c.data.codigo.trim(), filial: c.data.filial.trim() };
    if (posicoesValidas.has(`${item.codigo}|${item.filial}`)) criticos.push(item);
  }

  const acoesBrutas = Array.isArray(obj.acoes) ? obj.acoes : [];
  const acoes: AnaliseCenario["acoes"] = [];
  for (const bruta of acoesBrutas) {
    if (acoes.length >= MAX_ACOES) break;
    const parsed = acaoSchema.safeParse(bruta);
    if (!parsed.success) continue;
    const a = parsed.data;
    const valida =
      a.tipo === "antecipar_entrada"
        ? // Antecipar para a mesma data (ou depois) não é contingência, é
          // repetir o cenário — e apareceria na tela como ação sem efeito.
          a.novaData < resultado.premissa.dataEntrada && (!a.codigo || itens.has(a.codigo))
        : a.tipo === "transferencia"
          ? itens.has(a.codigo) && cds.has(a.origem) && cds.has(a.destino)
          : itens.has(a.codigo) && cds.has(a.destino);
    if (valida) acoes.push(a);
  }

  // Descarte total com itens na resposta é sinal de formato divergente — o
  // modelo devolveu algo, e nada casou. Sem registrar isso, a tela mostraria
  // uma seção vazia e não haveria como descobrir o porquê.
  if (criticosBrutos.length > 0 && criticos.length === 0) {
    console.error(
      "[cenario] todos os %d críticos descartados. Amostra: %s",
      criticosBrutos.length,
      JSON.stringify(criticosBrutos[0]).slice(0, 300)
    );
  }
  if (acoesBrutas.length > 0 && acoes.length === 0) {
    console.error(
      "[cenario] todas as %d ações descartadas. Amostra: %s",
      acoesBrutas.length,
      JSON.stringify(acoesBrutas[0]).slice(0, 300)
    );
  }

  // Só falha quando não sobrou nada aproveitável.
  if (!resumo && criticos.length === 0 && acoes.length === 0) {
    console.error("[cenario] resposta sem conteúdo aproveitável:", resposta.texto.slice(0, 500));
    return {
      ok: false,
      erro: "A análise voltou vazia. Tente rodar de novo ou reformular a pergunta.",
    };
  }

  return { ok: true, analise: { resumo, criticos, acoes } };
}

/** Remove o texto das ações, deixando só o que o motor entende. */
export function paraAcoesDoMotor(acoes: AcaoComTexto[]): Acao[] {
  return acoes.map((a) => {
    if (a.tipo === "transferencia") {
      const { justificativa: _, ...resto } = a;
      return resto;
    }
    if (a.tipo === "antecipar_entrada") {
      const { justificativa: _, ...resto } = a;
      return resto;
    }
    const { justificativa: _, ...resto } = a;
    return resto;
  });
}
