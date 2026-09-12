"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImportTabPanel } from "@/components/imports/import-tab-panel";
import { IMPORT_MODELS, type ImportModelConfig } from "@/lib/imports/config";

/**
 * Cadência de atualização de cada base, usada só para colorir as guias.
 * Deriva do `snapshotScope`: quem tem recorte por dia é carregado todo dia,
 * quem tem por mês é mensal, e o resto é cadastro ou carga eventual.
 */
type Cadencia = "diaria" | "mensal" | "cadastro";

function cadenciaDe(model: ImportModelConfig): Cadencia {
  if (model.snapshotScope === "day") return "diaria";
  if (model.snapshotScope === "month") return "mensal";
  return "cadastro";
}

/**
 * As guias diárias ganham fundo e fonte próprios: são as que exigem atenção
 * todo dia, e misturá-las com os cadastros fazia perder de vista o que precisa
 * ser atualizado. O estado ativo é `data-active` (Base UI).
 */
/**
 * Correções de layout comuns a todas as guias.
 *
 * O componente base assume uma única linha de abas: usa `flex-1` (cada aba
 * divide o espaço), `h-[calc(100%-1px)]` (altura relativa ao container) e
 * `transition-all`. Com 12 abas quebrando em várias linhas isso faz elas
 * mudarem de tamanho e animarem o layout a cada clique. Aqui a largura passa a
 * ser a do conteúdo, a altura fica fixa e só a cor transiciona.
 */
const BASE_TAB =
  "flex-none h-8 px-3 transition-colors";

const ESTILO: Record<Cadencia, string> = {
  diaria:
    "bg-(--brand-petrol)/10 text-(--brand-petrol) data-active:bg-(--brand-petrol) data-active:text-white dark:bg-(--brand-turquoise)/15 dark:text-(--brand-turquoise) dark:data-active:bg-(--brand-turquoise) dark:data-active:text-(--brand-petrol)",
  mensal:
    "bg-(--brand-turquoise)/20 text-(--brand-petrol) data-active:bg-(--brand-turquoise) data-active:text-(--brand-petrol) dark:text-(--brand-turquoise) dark:data-active:text-(--brand-petrol)",
  cadastro: "",
};

const LEGENDA: { cadencia: Cadencia; rotulo: string; amostra: string }[] = [
  { cadencia: "diaria", rotulo: "Atualização diária", amostra: "bg-(--brand-petrol)" },
  { cadencia: "mensal", rotulo: "Atualização mensal", amostra: "bg-(--brand-turquoise)" },
  { cadencia: "cadastro", rotulo: "Cadastro", amostra: "border bg-muted" },
];

export function ImportsWorkspace({ podeEditar }: { podeEditar: boolean }) {
  return (
    <Tabs defaultValue={IMPORT_MODELS[0].key} className="w-full gap-4">
      <div className="space-y-2">
        {/*
          `group-data-horizontal/tabs:h-auto` é obrigatório: o componente base
          fixa `group-data-horizontal/tabs:h-8`, e um `h-auto` sem variante não
          sobrescreve uma classe com variante — as duas convivem e a prefixada
          vence, deixando o container com 32px enquanto as abas quebram em duas
          linhas e invadem o que vem abaixo.
        */}
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 group-data-horizontal/tabs:h-auto">
          {IMPORT_MODELS.map((model) => (
            <TabsTrigger
              key={model.key}
              value={model.key}
              className={`${BASE_TAB} ${ESTILO[cadenciaDe(model)]}`}
            >
              {model.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {LEGENDA.map((item) => (
            <li key={item.cadencia} className="flex items-center gap-1.5 text-xs">
              <span className={`size-2.5 shrink-0 rounded-[2px] ${item.amostra}`} />
              <span className="text-muted-foreground">{item.rotulo}</span>
            </li>
          ))}
        </ul>
      </div>

      {IMPORT_MODELS.map((model) => (
        <TabsContent key={model.key} value={model.key}>
          <ImportTabPanel podeEditar={podeEditar} model={model} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
