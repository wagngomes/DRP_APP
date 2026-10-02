"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Clock, Monitor } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SeletorPapel } from "@/components/usuarios/seletor-papel";
import type { Acesso } from "@/lib/usuarios/acessos";
import type { Papel } from "@/lib/autorizacao";

/**
 * Um usuário e o histórico de acesso dele.
 *
 * O cartão abre e mostra os acessos porque a pergunta "quem anda usando o
 * sistema" não se responde com uma coluna a mais na tabela — ela precisa de
 * datas, e datas em tabela larga viram ruído para quem só quer conferir papéis.
 */

function dataHora(d: Date | string): string {
  const data = typeof d === "string" ? new Date(d) : d;
  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function hora(d: Date | string): string {
  const data = typeof d === "string" ? new Date(d) : d;
  return data.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "2h15" é mais rápido de ler que "135 min". */
function duracao(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

export function CartaoUsuario({
  usuario,
  papel,
  acessos,
  ehVoce,
}: {
  usuario: {
    id: string;
    name: string;
    email: string;
    createdAt: Date | string;
  };
  /**
   * Papel já validado pelo servidor.
   *
   * Vem pronto em vez de sair de um `role as Papel` aqui: o texto da coluna é
   * livre no banco, e o cast silenciaria um valor inesperado em vez de tratá-lo.
   */
  papel: Papel;
  acessos: Acesso[];
  ehVoce: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const ultimo = acessos[0];

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-3 p-3">
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={aberto}
        >
          {aberto ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{usuario.name}</span>
              {ehVoce ? (
                <span className="text-xs text-muted-foreground">você</span>
              ) : null}
              {ultimo?.ativa ? (
                <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                  sessão ativa
                </Badge>
              ) : null}
            </span>
            <span className="block truncate text-sm text-muted-foreground">
              {usuario.email}
            </span>
          </span>
        </button>

        {/* O último acesso fica visível sem abrir: é o que se quer saber na
            maioria das vezes, e abrir quinze cartões para descobrir quem anda
            sumido seria pior que não ter o dado. */}
        <span className="shrink-0 text-right text-xs text-muted-foreground">
          {ultimo ? (
            <>
              <span className="block">último acesso</span>
              <span className="font-mono tabular-nums">
                {dataHora(ultimo.inicio)}
              </span>
            </>
          ) : (
            <span className="italic">nunca entrou</span>
          )}
        </span>

        <SeletorPapel id={usuario.id} papel={papel} ehVoce={ehVoce} />
      </div>

      {aberto ? (
        <div className="border-t bg-muted/20 p-3">
          {acessos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Esta conta foi criada em {dataHora(usuario.createdAt)} e ainda não
              registrou nenhum acesso.
            </p>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{`${acessos.length} acesso(s) registrado(s)`}</span>
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  {/* O nome importa: é a distância entre o primeiro e o último
                      clique da sessão, com almoço e reunião dentro. Chamar de
                      "tempo no sistema" seria dizer mais do que o dado sustenta. */}
                  janela de uso, não tempo efetivo
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[30rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="py-1.5 text-left font-medium">Entrada</th>
                      <th className="py-1.5 text-left font-medium">
                        Última atividade
                      </th>
                      <th className="py-1.5 text-right font-medium">Janela</th>
                      <th className="py-1.5 text-left font-medium">
                        Dispositivo
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {acessos.map((a, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-1.5 font-mono text-xs tabular-nums">
                          {dataHora(a.inicio)}
                        </td>
                        <td className="py-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                          {hora(a.fim)}
                          {a.ativa ? (
                            <span className="ml-1.5 text-emerald-700 dark:text-emerald-400">
                              em curso
                            </span>
                          ) : null}
                        </td>
                        <td className="py-1.5 text-right font-mono text-xs tabular-nums">
                          {duracao(a.minutos)}
                        </td>
                        <td className="py-1.5 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Monitor className="size-3 shrink-0" />
                            {a.dispositivo}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
