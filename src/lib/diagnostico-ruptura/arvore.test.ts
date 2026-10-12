import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ARVORE,
  RAIZ,
  causasAlcancaveis,
  classificar,
  type ContextoArvore,
} from "@/lib/diagnostico-ruptura/arvore";
import { causaPorSlug } from "@/lib/diagnostico-ruptura/catalogo";

/**
 * A árvore de decisão.
 *
 * Dois tipos de teste aqui, e o primeiro é o que mais vale.
 *
 * **Estrutura.** A árvore original tinha sete furos, e quase todos eram ramos
 * que ninguém desenhou: um "não" sem destino, uma pergunta sem saída, um alvo
 * que não existia. São exatamente os defeitos que uma varredura encontra e um
 * par de olhos não — e que voltariam na próxima edição se ninguém varresse.
 *
 * **O desenho é a especificação.** `docs/arvore-diagnostico.md` tem o
 * diagrama, e o último teste compara os dois grafos nó a nó. Rewirar um ramo
 * no código sem atualizar o desenho quebra a suíte, e vice-versa: as duas
 * coisas andam juntas ou não andam.
 */

const IDS = new Set(ARVORE.map((n) => n.id));

/** Contexto mínimo; cada teste sobrescreve o que a sua pergunta olha. */
function contexto(over: Partial<ContextoArvore> = {}): ContextoArvore {
  return {
    evento: {
      codigo: "100",
      filial: "1006",
      inicio: "2026-09-10",
      fim: null,
      dias: 8,
      snapshots: 4,
      valorPerdido: 0,
      tinhaRetido: false,
    },
    de: "2026-09-01",
    ate: "2026-09-18",
    vendas: new Map(),
    chegadas: [],
    forecastMensal: 300,
    leadTime: 8,
    excedenteOutrosCds: 0,
    abertura: {
      codigo: "100",
      filial: "1006",
      disponivel: 500,
      aCaminho: 0,
      politicaDias: 15,
      consumoDiario: 10,
      coberturaDias: 50,
      abaixoDaPolitica: false,
    },
    retido: 0,
    cargaSuspeita: false,
    ...over,
  };
}

describe("estrutura da árvore", () => {
  it("todo destino existe — nó conhecido ou causa do catálogo", () => {
    for (const no of ARVORE) {
      for (const [ramo, destino] of [
        ["sim", no.sim],
        ["não", no.nao],
      ] as const) {
        const ehNo = IDS.has(destino);
        const ehCausa = causaPorSlug(destino) !== undefined;
        expect(
          ehNo || ehCausa,
          `${no.id} --${ramo}--> ${destino} não é nó nem causa`,
        ).toBe(true);
      }
    }
  });

  it("nenhum nó aponta para si mesmo nem some com um ramo", () => {
    for (const no of ARVORE) {
      expect(no.sim, `${no.id} aponta para si no sim`).not.toBe(no.id);
      expect(no.nao, `${no.id} aponta para si no não`).not.toBe(no.id);
      expect(no.sim.length, `${no.id} sem destino no sim`).toBeGreaterThan(0);
      expect(no.nao.length, `${no.id} sem destino no não`).toBeGreaterThan(0);
    }
  });

  it("não há id repetido", () => {
    expect(IDS.size).toBe(ARVORE.length);
  });

  it("todo nó é alcançável a partir da raiz", () => {
    // Nó órfão é pergunta que ninguém faz: o código fica, a regra não roda, e
    // nada acusa.
    const vistos = new Set<string>();
    const fila = [RAIZ];
    while (fila.length > 0) {
      const id = fila.pop()!;
      if (vistos.has(id) || !IDS.has(id)) continue;
      vistos.add(id);
      const no = ARVORE.find((n) => n.id === id)!;
      fila.push(no.sim, no.nao);
    }
    const orfaos = [...IDS].filter((id) => !vistos.has(id));
    expect(orfaos, `nós inalcançáveis: ${orfaos.join(", ")}`).toEqual([]);
  });

  it("a árvore é acíclica — todo caminho termina numa causa", () => {
    const visitar = (id: string, caminho: string[]): void => {
      if (!IDS.has(id)) return; // causa
      expect(
        caminho.includes(id),
        `ciclo: ${[...caminho, id].join(" → ")}`,
      ).toBe(false);
      const no = ARVORE.find((n) => n.id === id)!;
      visitar(no.sim, [...caminho, id]);
      visitar(no.nao, [...caminho, id]);
    };
    visitar(RAIZ, []);
  });

  it("toda causa alcançável está no catálogo", () => {
    for (const slug of causasAlcancaveis()) {
      expect(causaPorSlug(slug), `causa fora do catálogo: ${slug}`).toBeDefined();
    }
  });
});

describe("classificar", () => {
  it("carga quebrada não acusa ninguém, e é a primeira pergunta", () => {
    const r = classificar(contexto({ cargaSuspeita: true }));
    expect(r.causa).toBe("base_inconsistente");
    expect(r.trilha).toHaveLength(1);
  });

  it("estoque retido vem antes de qualquer pergunta de compra", () => {
    const r = classificar(contexto({ retido: 400 }));
    expect(r.causa).toBe("estoque_retido");
    expect(r.trilha.map((p) => p.no)).toEqual(["D0", "D1"]);
  });

  it("forecast aberto ontem não cobra compra de ninguém", () => {
    const r = classificar(
      contexto({
        aberturaForecast: {
          codigo: "100",
          filial: "1006",
          data: "2026-09-06",
          forecast: 300,
          linhaNova: true,
        },
      }),
    );
    expect(r.causa).toBe("nova_abertura");
  });

  it("forecast aberto há mais de um lead time não serve de desculpa", () => {
    const r = classificar(
      contexto({
        aberturaForecast: {
          codigo: "100",
          filial: "1006",
          data: "2026-08-01",
          forecast: 300,
          linhaNova: true,
        },
        planoDoMes: { plano: 0, saldo: 0 },
      }),
    );
    expect(r.causa).not.toBe("nova_abertura");
  });

  it("sem plano no mês cai em fora do plano", () => {
    const r = classificar(contexto({ planoDoMes: { plano: 0, saldo: 0 } }));
    expect(r.causa).toBe("fora_do_plano");
  });

  it("pedido tarde com verba é de compras; sem verba é do plano", () => {
    const base = {
      planoDoMes: { plano: 5000, saldo: 100 },
      pedido: {
        emitidoEm: "2026-09-08",
        quantidade: 5000,
        dataLimite: "2026-09-01",
      },
    };
    expect(
      classificar(contexto({ ...base, saldoNaDataLimite: 900 })).causa,
    ).toBe("pedido_tarde");
    expect(classificar(contexto({ ...base, saldoNaDataLimite: 0 })).causa).toBe(
      "sem_saldo_plano",
    );
  });

  it("pedido no prazo e pequeno demais é comprou pouco", () => {
    // Necessidade = 10/dia × (8 de lead time + 15 de política) = 230.
    const r = classificar(
      contexto({
        planoDoMes: { plano: 5000, saldo: 100 },
        pedido: {
          emitidoEm: "2026-09-01",
          quantidade: 50,
          dataLimite: "2026-09-01",
        },
      }),
    );
    expect(r.causa).toBe("comprou_pouco");
  });

  it("pedido que sumiu sem receber é cancelamento", () => {
    const r = classificar(
      contexto({
        planoDoMes: { plano: 5000, saldo: 100 },
        pedido: {
          emitidoEm: "2026-09-01",
          quantidade: 5000,
          dataLimite: "2026-09-01",
        },
        pedidoSumiuSemReceber: true,
      }),
    );
    expect(r.causa).toBe("pedido_cancelado");
  });

  it("atraso recorrente é cadastro, isolado é fornecedor", () => {
    const entrega = {
      posicao: "100|1006",
      pedido: "P1",
      pedidoEm: "2026-09-01",
      chegouEm: "2026-09-25",
      quantidade: 5000,
      leadReal: 24,
    };
    const base = {
      planoDoMes: { plano: 5000, saldo: 100 },
      pedido: {
        emitidoEm: "2026-09-01",
        quantidade: 5000,
        dataLimite: "2026-09-01",
      },
      pedidoSumiuSemReceber: false,
      triangulado: false,
      entregas: [entrega],
    };
    expect(
      classificar(
        contexto({
          ...base,
          prazo: { cadastrado: 8, realMediano: 24, entregas: 23 },
        }),
      ).causa,
    ).toBe("lead_time_cadastro");
    expect(
      classificar(
        contexto({
          ...base,
          prazo: { cadastrado: 8, realMediano: 8, entregas: 23 },
        }),
      ).causa,
    ).toBe("fornecedor_atrasou");
  });

  it("NÃO culpa o fornecedor quando ele entregou no prazo", () => {
    // O furo do desenho original: o "não" de triangulado levava a atraso do
    // fornecedor, depois de já ter sido respondido que ele cumpriu o prazo.
    const r = classificar(
      contexto({
        planoDoMes: { plano: 5000, saldo: 100 },
        pedido: {
          emitidoEm: "2026-09-01",
          quantidade: 5000,
          dataLimite: "2026-09-01",
        },
        pedidoSumiuSemReceber: false,
        triangulado: false,
        entregas: [
          {
            posicao: "100|1006",
            pedido: "P1",
            pedidoEm: "2026-09-01",
            chegouEm: "2026-09-08",
            quantidade: 5000,
            leadReal: 7,
          },
        ],
        prazo: { cadastrado: 8, realMediano: 7, entregas: 20 },
      }),
    );
    expect(r.causa).not.toBe("fornecedor_atrasou");
    expect(r.causa).not.toBe("lead_time_cadastro");
  });

  it("nó sem dado pára o percurso e devolve indefinida", () => {
    const r = classificar(contexto({ retido: undefined }));
    expect(r.causa).toBe("indefinida");
    expect(r.incompleta).toBe(true);
    // A trilha é o que salva a informação: diz qual pergunta travou.
    expect(r.trilha.at(-1)?.no).toBe("D1");
    expect(r.trilha.at(-1)?.resposta).toBeNull();
  });

  /**
   * O caso que fez esta regra mudar.
   *
   * A carga de `plano_compra` de agosto perdeu os códigos num reimport de
   * Produtos, A2 ficou sem resposta em 196 dos 458 eventos de setembro, e o
   * caminhante antigo — que seguia pelo "não" — devolvia "sem plano no mês
   * anterior" em 44,5% dos casos. Acusação a Planejamento a partir de dado
   * ausente.
   */
  it("NÃO acusa falta de plano quando a carga do mês anterior não existe", () => {
    const semCarga = classificar(
      contexto({
        abertura: {
          codigo: "100",
          filial: "1006",
          disponivel: 0,
          aCaminho: 0,
          politicaDias: 15,
          consumoDiario: 10,
          coberturaDias: 0,
          abaixoDaPolitica: true,
        },
        mesAnterior: {
          codigo: "100",
          filial: "1006",
          vendido: 300,
          forecast: 300,
          indice: 1,
          excedente: 0,
        },
        planoMesAnterior: undefined,
      }),
    );
    expect(semCarga.causa).not.toBe("sem_plano_mes_anterior");
    expect(semCarga.causa).toBe("indefinida");
    expect(semCarga.trilha.at(-1)?.no).toBe("A2");
  });

  it("posição sem pedido nenhum não é pedido tarde", () => {
    const base = {
      planoDoMes: { plano: 1000, saldo: 500 },
      saldoNaDataLimite: 400,
    };
    const semPedido = classificar(contexto({ ...base, pedido: undefined }));
    expect(semPedido.causa).toBe("pedido_nao_colocado");
    // E não ficou incompleta: a ausência de pedido é fato, não falta de dado.
    expect(semPedido.incompleta).toBe(false);

    const tarde = classificar(
      contexto({
        ...base,
        pedido: {
          emitidoEm: "2026-09-08",
          quantidade: 5000,
          dataLimite: "2026-09-01",
        },
      }),
    );
    expect(tarde.causa).toBe("pedido_tarde");
  });

  it("o balanceamento é modificador, não causa", () => {
    const comSobra = classificar(
      contexto({
        planoDoMes: { plano: 0, saldo: 0 },
        podiaTransferirENaoTransferiu: true,
      }),
    );
    expect(comSobra.causa).toBe("fora_do_plano");
    expect(comSobra.balanceamentoNaoRealizado).toBe(true);
  });

  it("o modificador não alcança base inconsistente nem nova abertura", () => {
    const quebrada = classificar(
      contexto({ cargaSuspeita: true, podiaTransferirENaoTransferiu: true }),
    );
    expect(quebrada.balanceamentoNaoRealizado).toBe(false);
  });

  it("a trilha registra cada pergunta com a prova", () => {
    // É o "teste de cada etapa" da tela: sem a evidência, a tela afirma sem
    // mostrar, e ninguém consegue conferir.
    const r = classificar(
      contexto({
        abertura: {
          ...contexto().abertura!,
          disponivel: 50,
          abaixoDaPolitica: true,
        },
        mesAnterior: {
          codigo: "100",
          filial: "1006",
          vendido: 450,
          forecast: 300,
          indice: 1.5,
          excedente: 150,
        },
      }),
    );
    expect(r.causa).toBe("venda_acelerada_mes_anterior");
    const passo = r.trilha.find((p) => p.no === "A1")!;
    expect(passo.evidencia).toMatchObject({ vendido: 450, forecast: 300 });
  });

  it("sempre termina numa causa, em qualquer combinação", () => {
    // Varre as combinações dos sinais booleanos: nenhuma pode sair da árvore
    // sem resposta, e nenhuma pode estourar o teto de passos.
    const booleanos = [true, false, undefined] as const;
    for (const retido of [0, 100]) {
      for (const triangulado of booleanos) {
        for (const sla of booleanos) {
          for (const saida of booleanos) {
            const r = classificar(
              contexto({
                retido,
                triangulado,
                slaInternoEstourado: sla,
                saidaNaoUsual: saida,
                planoDoMes: { plano: 5000, saldo: 100 },
              }),
            );
            expect(causaPorSlug(r.causa)).toBeDefined();
          }
        }
      }
    }
  });
});

describe("o código bate com o desenho", () => {
  it("todo nó e todo ramo do diagrama existem no código, e vice-versa", () => {
    const doc = readFileSync("docs/arvore-diagnostico.md", "utf8");
    const bloco = doc.split("```mermaid")[1].split("```")[0];

    // `X -->|sim| Y`, com X podendo trazer o rótulo entre chaves ou colchetes.
    const ramosDoDesenho = new Map<string, string>();
    for (const linha of bloco.split("\n")) {
      const m = linha.match(
        /^\s*([A-Za-z][A-Za-z0-9_]*)(?:\{[^}]*\}|\[[^\]]*\])?\s*-->\s*\|(sim|não)\|\s*([A-Za-z][A-Za-z0-9_]*)/,
      );
      if (m) ramosDoDesenho.set(`${m[1]}:${m[2]}`, m[3]);
    }

    const ramosDoCodigo = new Map<string, string>();
    for (const no of ARVORE) {
      ramosDoCodigo.set(`${no.id}:sim`, no.sim);
      ramosDoCodigo.set(`${no.id}:não`, no.nao);
    }

    const soNoDesenho = [...ramosDoDesenho.keys()].filter(
      (k) => !ramosDoCodigo.has(k),
    );
    const soNoCodigo = [...ramosDoCodigo.keys()].filter(
      (k) => !ramosDoDesenho.has(k),
    );
    expect(soNoDesenho, `ramos só no desenho: ${soNoDesenho.join(", ")}`).toEqual([]);
    expect(soNoCodigo, `ramos só no código: ${soNoCodigo.join(", ")}`).toEqual([]);

    const divergentes = [...ramosDoCodigo.entries()]
      .filter(([k, v]) => ramosDoDesenho.get(k) !== v)
      .map(([k, v]) => `${k} → código ${v}, desenho ${ramosDoDesenho.get(k)}`);
    expect(divergentes, divergentes.join(" · ")).toEqual([]);
  });
});
