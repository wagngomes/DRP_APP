/**
 * Cronômetro de toda requisição HTTP que entra no processo.
 *
 * O proxy do Next não serve para isso: roda **antes** do handler e devolve na
 * hora, sem esperar a resposta — mediria o próprio proxy. Envolver rota por
 * rota cobriria só as de API, deixando de fora as páginas, que são as lentas.
 *
 * Então o gancho é no servidor HTTP do Node: para cada evento de requisição o
 * cronômetro começa, e o `finish` da resposta o encerra. É a técnica que
 * agentes de APM usam, e o único ponto que enxerga página, rota de API e
 * arquivo estático com o mesmo critério.
 *
 * Este arquivo existe separado de `instrumentation.ts` para conter as APIs de
 * Node em um módulo só: o Next compila a instrumentação também para o runtime
 * Edge, onde `node:http` não existe, e apontava erro em cada uso.
 */
import { metricas, registrarRequisicao } from "./metricas";

export async function instrumentarServidorHttp(): Promise<void> {
  const http = await import("node:http");

  const proto = http.Server.prototype as unknown as {
    emit: (evento: string, ...args: unknown[]) => boolean;
    __drpInstrumentado?: boolean;
  };
  // Em desenvolvimento o módulo recarrega; sem esta guarda o `emit` seria
  // envolvido várias vezes e cada requisição contaria em duplicidade.
  if (proto.__drpInstrumentado) return;
  proto.__drpInstrumentado = true;

  const emitOriginal = proto.emit;

  proto.emit = function (evento: string, ...args: unknown[]) {
    if (evento === "request") {
      const req = args[0] as { method?: string; url?: string };
      const res = args[1] as {
        statusCode: number;
        on: (e: string, f: () => void) => void;
      };

      const caminho = (req.url ?? "/").split("?")[0];
      const metodo = req.method ?? "GET";

      // O próprio endpoint de métricas fica de fora: o Prometheus o consulta a
      // cada poucos segundos e ele dominaria o painel sem dizer nada útil.
      if (caminho !== "/api/metrics") {
        const m = metricas();
        const inicio = process.hrtime.bigint();
        m.requisicoesEmCurso.inc({ metodo });

        // `finish` e `close` porque nem toda requisição termina respondida:
        // conexões longas (recarga automática em desenvolvimento, SSE) e
        // clientes que desistem disparam só `close`. Contando apenas `finish`,
        // o medidor de requisições em curso só subia e nunca voltava.
        let encerrada = false;
        const encerrar = (respondida: boolean) => {
          if (encerrada) return;
          encerrada = true;
          m.requisicoesEmCurso.dec({ metodo });
          // Só vira amostra de duração o que de fato respondeu; conexão
          // abandonada não é latência de rota e distorceria o percentil.
          if (respondida) {
            const segundos = Number(process.hrtime.bigint() - inicio) / 1e9;
            registrarRequisicao(metodo, caminho, res.statusCode, segundos);
          }
        };

        res.on("finish", () => encerrar(true));
        res.on("close", () => encerrar(false));
      }
    }

    return emitOriginal.apply(this, [evento, ...args] as never);
  };
}
