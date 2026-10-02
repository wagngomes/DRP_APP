import { prisma } from "@/lib/prisma";

/**
 * Histórico de acesso, a partir das sessões que a autenticação já grava.
 *
 * Nada novo é coletado: cada entrada no sistema cria uma linha em `session`, com
 * o instante do login e o da última atividade. Elas não são apagadas ao expirar,
 * então o histórico existe desde que o sistema entrou no ar.
 *
 * **O que o número de minutos é, e o que não é.** É a distância entre o primeiro
 * e o último acesso da sessão — não é tempo de uso. Quem entra às 9h, almoça e
 * volta às 14h aparece com cinco horas. Medir uso de verdade exigiria bater no
 * servidor de tempos em tempos e detectar ociosidade, que é outra coisa e custa
 * escrita constante.
 *
 * Por isso a tela chama de "janela de uso", e não de "tempo no sistema".
 */

export type Acesso = {
  /** Quando entrou. */
  inicio: Date;
  /** Última atividade registrada naquela sessão. */
  fim: Date;
  /** Minutos entre as duas pontas. */
  minutos: number;
  /** A sessão ainda vale — a pessoa pode estar usando agora. */
  ativa: boolean;
  /** Navegador e sistema, resumidos. */
  dispositivo: string;
};

/** Quantos acessos trazer por usuário. */
const LIMITE = 50;

/**
 * Resume o `user-agent` a algo legível.
 *
 * A cadeia crua tem cem caracteres de retrocompatibilidade histórica e não cabe
 * na tela. O que interessa a quem lê é distinguir um acesso de casa no celular
 * de um acesso do computador do escritório.
 */
function dispositivo(agente: string | null): string {
  if (!agente) return "—";

  const navegador = /Edg\//.test(agente)
    ? "Edge"
    : /OPR\//.test(agente)
      ? "Opera"
      : /Chrome\//.test(agente)
        ? "Chrome"
        : /Firefox\//.test(agente)
          ? "Firefox"
          : /Safari\//.test(agente)
            ? "Safari"
            : "outro";

  const sistema = /Android/.test(agente)
    ? "Android"
    : /iPhone|iPad/.test(agente)
      ? "iOS"
      : /Windows/.test(agente)
        ? "Windows"
        : /Mac OS/.test(agente)
          ? "macOS"
          : /Linux/.test(agente)
            ? "Linux"
            : "";

  return sistema ? `${navegador} · ${sistema}` : navegador;
}

/**
 * Acessos dos usuários pedidos, do mais recente para o mais antigo.
 *
 * Uma consulta para todos os usuários da página, e não uma por usuário: são
 * quinze cards, e quinze consultas sequenciais custariam quinze idas ao banco
 * para trazer o que cabe numa.
 */
export async function carregarAcessos(
  usuarios: string[],
): Promise<Map<string, Acesso[]>> {
  if (usuarios.length === 0) return new Map();

  const linhas = await prisma.$queryRawUnsafe<
    {
      userId: string;
      inicio: Date;
      fim: Date;
      minutos: number;
      ativa: boolean;
      agente: string | null;
    }[]
  >(
    `SELECT "userId",
            "createdAt" AS inicio,
            "updatedAt" AS fim,
            GREATEST(0, round(EXTRACT(EPOCH FROM ("updatedAt" - "createdAt")) / 60))::int AS minutos,
            ("expiresAt" > now()) AS ativa,
            "userAgent" AS agente
       FROM session
      WHERE "userId" = ANY($1::text[])
      ORDER BY "userId", "createdAt" DESC`,
    usuarios,
  );

  const porUsuario = new Map<string, Acesso[]>();
  for (const l of linhas) {
    const lista = porUsuario.get(l.userId) ?? [];
    // O corte é por usuário, não no SQL: um `LIMIT` global traria cinquenta
    // linhas no total e deixaria os últimos cards vazios.
    if (lista.length >= LIMITE) continue;
    lista.push({
      inicio: l.inicio,
      fim: l.fim,
      minutos: l.minutos,
      ativa: l.ativa,
      dispositivo: dispositivo(l.agente),
    });
    porUsuario.set(l.userId, lista);
  }

  return porUsuario;
}
