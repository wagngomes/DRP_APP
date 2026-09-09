/**
 * Contrato da resposta do modelo.
 *
 * A IA devolve **ordem e texto**. Número, data e seção vêm do motor e são
 * reconferidos aqui na volta: item que chegar com seção diferente da atribuída
 * pelo cálculo é corrigido, e item cujo (código, filial) não estava no dossiê é
 * descartado. É o que impede o modelo de reclassificar criticidade ou inventar
 * SKU.
 *
 * Se a resposta não passar por este schema, a tela mantém a análise anterior em
 * vez de exibir algo inválido.
 */
import { z } from "zod";

export const SECOES = ["urgente", "recomendada", "alerta", "aviso"] as const;

/**
 * Texto livre com corte, em vez de rejeição.
 *
 * Um limite rígido de tamanho jogaria fora a análise inteira — dois minutos de
 * processamento e o custo da chamada — porque uma frase veio dez caracteres mais
 * longa. Perder o fim de uma frase é muito melhor que perder tudo. A rejeição
 * fica reservada para problema estrutural: campo faltando, tipo errado.
 */
function textoAte(limite: number) {
  return z
    .string()
    .min(1)
    .transform((s) => (s.length <= limite ? s : `${s.slice(0, limite - 1).trimEnd()}…`));
}

export const itemAnaliseSchema = z.object({
  codigo: z.string().min(1),
  filial: z.string().min(1),
  secao: z.enum(SECOES),
  /** Frase curta que nomeia o problema. */
  titulo: textoAte(140),
  /** Por que este item está nesta posição, citando o dado que sustenta. */
  justificativa: textoAte(600),
  /** O que fazer. */
  acao: textoAte(300),
});

export const temaSchema = z.object({
  titulo: textoAte(140),
  resumo: textoAte(600),
  /** Códigos que o tema agrupa; conferidos contra o dossiê. */
  codigos: z.array(z.string()).max(50),
});

/**
 * Itens e temas entram como desconhecidos e são validados um a um.
 *
 * Um item malformado — o modelo tentando transformar uma aceleração de venda,
 * que não tem CD, em item — não pode descartar a análise inteira. O item ruim
 * cai fora e é contado; o resto sobrevive. Dois minutos de processamento e o
 * custo da chamada não podem depender de nenhum item sair perfeito.
 */
export const analiseSchema = z.object({
  /** Abertura executiva: o que muda hoje em relação a ontem. */
  briefing: textoAte(1600),
  itens: z.array(z.unknown()).max(200),
  /** Padrões que atravessam vários itens (um fornecedor, uma rota, um CD). */
  temas: z.array(z.unknown()).max(10).default([]),
});

export type ItemAnalise = z.infer<typeof itemAnaliseSchema>;
export type Tema = z.infer<typeof temaSchema>;
export type Analise = {
  briefing: string;
  itens: ItemAnalise[];
  temas: Tema[];
};

/** Chave de conferência de um item contra o dossiê. */
export function chaveItem(codigo: string, filial: string): string {
  return `${codigo}|${filial}`;
}

export type ResultadoValidacao =
  | { ok: true; analise: Analise; descartados: number; secoesCorrigidas: number }
  | { ok: false; erro: string };

/**
 * Valida a resposta e a reconcilia com o motor.
 *
 * `secoesEsperadas` mapeia `codigo|filial` para a seção que o cálculo atribuiu.
 * Itens fora desse mapa não existem no recorte analisado e saem.
 */
export function validarAnalise(
  bruto: unknown,
  secoesEsperadas: Map<string, (typeof SECOES)[number]>
): ResultadoValidacao {
  const parsed = analiseSchema.safeParse(bruto);
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  let descartados = 0;
  let secoesCorrigidas = 0;

  const itens = parsed.data.itens.flatMap((bruto): ItemAnalise[] => {
    // Item malformado cai fora sozinho; não derruba a análise.
    const item = itemAnaliseSchema.safeParse(bruto);
    if (!item.success) {
      descartados += 1;
      return [];
    }
    const esperada = secoesEsperadas.get(chaveItem(item.data.codigo, item.data.filial));
    if (!esperada) {
      descartados += 1;
      return [];
    }
    if (item.data.secao !== esperada) {
      secoesCorrigidas += 1;
      return [{ ...item.data, secao: esperada }];
    }
    return [item.data];
  });

  const codigosValidos = new Set(
    [...secoesEsperadas.keys()].map((k) => k.split("|")[0])
  );
  const temas = parsed.data.temas.flatMap((bruto): Tema[] => {
    const tema = temaSchema.safeParse(bruto);
    if (!tema.success) return [];
    return [{ ...tema.data, codigos: tema.data.codigos.filter((c) => codigosValidos.has(c)) }];
  });

  return {
    ok: true,
    analise: { briefing: parsed.data.briefing, itens, temas },
    descartados,
    secoesCorrigidas,
  };
}
