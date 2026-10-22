"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Loader2, Receipt, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Filtro de lista fechada com autocompletar, em lista suspensa.
 *
 * Nasceu para laboratório (coluna `fornecedor` do simulador): são 353 valores —
 * muitos para um select e poucos para justificar busca no servidor. Um
 * `datalist` nativo dá autocompletar sobre a lista inteira sem dependência
 * nova, e o valor vai para a URL para que as consultas (que rodam no servidor)
 * enxerguem o filtro e o link fique compartilhável.
 *
 * Serve a qualquer recorte com o mesmo formato — tributação, por exemplo —
 * através de `param` e `rotulo`. Os padrões mantêm as sete telas que já o usam
 * como laboratório funcionando sem mudança.
 */
const ICONES = { laboratorio: FlaskConical, tributacao: Receipt } as const;

export function FiltroFornecedor({
  fornecedores,
  atual,
  basePath = "/visao-geral",
  extras,
  param = "fornecedor",
  rotulo = "Laboratório",
  icone = "laboratorio",
  /** Texto do campo vazio; o padrão descreve a lista de laboratórios. */
  placeholder = "Todos os laboratórios",
  /** Aviso quando o texto digitado não está na lista. */
  avisoDesconhecido = "Laboratório não encontrado na base desta data.",
  compacto = false,
}: {
  fornecedores: string[];
  atual?: string;
  /** Página que recebe o filtro — o mesmo controle serve a mais de uma tela. */
  basePath?: string;
  /**
   * Outros recortes da página, preservados ao aplicar ou limpar este.
   *
   * Sem isto, escolher um laboratório jogava fora o filtro de CD da tela de
   * triangulações — a URL era remontada do zero.
   */
  extras?: Record<string, string | undefined>;
  /** Nome do parâmetro na URL. Muda o recorte que este controle governa. */
  param?: string;
  rotulo?: string;
  /**
   * Ícone, escolhido por nome e não pelo componente.
   *
   * Componente é função, e função não atravessa a fronteira servidor→cliente:
   * quem chama este controle é um componente de servidor, e passar o ícone
   * pronto quebra em runtime sem o typecheck acusar. O teste de fronteira do
   * projeto pega isso — e pegou, nesta mudança.
   */
  icone?: keyof typeof ICONES;
  placeholder?: string;
  avisoDesconhecido?: string;
  /**
   * Campo mais estreito, para dois destes caberem na mesma linha.
   *
   * Cada controle carrega o próprio par de botões, então dois deles com a
   * largura cheia estouram a linha e quebram — foi o que aconteceu no Tracking
   * quando a tributação entrou ao lado do laboratório.
   */
  compacto?: boolean;
}) {
  const [valor, setValor] = useState(atual ?? "");
  const [aplicando, iniciar] = useTransition();
  const router = useRouter();

  function aplicar(proximo: string) {
    iniciar(() => {
      const p = new URLSearchParams();
      if (proximo) p.set(param, proximo);
      for (const [k, v] of Object.entries(extras ?? {})) if (v) p.set(k, v);
      const qs = p.toString();
      const url = qs ? `${basePath}?${qs}` : basePath;
      // Só o push. As páginas que usam este filtro são `force-dynamic`, então
      // navegar para uma URL nova já refaz a consulta no servidor — o
      // `router.refresh()` que havia aqui disparava uma segunda busca e um
      // segundo troca-conteúdo, o que numa tela de 1,6s por consulta aparecia
      // como a página saltando duas vezes.
      router.push(url, { scroll: false });
    });
  }

  const conhecido = !valor || fornecedores.includes(valor);

  return (
    // `relative` porque o aviso é posicionado fora do fluxo: no fluxo, ele
    // crescia o bloco em 20px no instante em que o nome digitado deixava de ser
    // conhecido, empurrando a tela inteira enquanto se digita.
    <div className="relative flex w-full flex-wrap items-end gap-2 sm:w-auto">
      <div className="w-full space-y-1.5 sm:w-auto">
        {/* Ids derivados de `param`: dois destes controles na mesma tela
            dividiriam o mesmo `datalist` se o id fosse fixo, e o segundo
            herdaria as opções do primeiro. */}
        <Label htmlFor={`filtro-${param}`} className="text-xs text-muted-foreground">
          {rotulo}
        </Label>
        <div className="relative">
          {(() => {
            const Icone = ICONES[icone];
            return (
              <Icone className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            );
          })()}
          <Input
            id={`filtro-${param}`}
            list={`lista-${param}`}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && conhecido) aplicar(valor);
            }}
            placeholder={placeholder}
            // Largura fixa só a partir de `sm`: 16rem num celular de 375px
            // estoura a linha e empurra o botão para fora da tela.
            className={`w-full pl-8 ${compacto ? "sm:w-52" : "sm:w-64"}`}
            disabled={aplicando}
            aria-invalid={!conhecido}
          />
          <datalist id={`lista-${param}`}>
            {fornecedores.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </div>
      </div>

      <Button
        onClick={() => aplicar(valor)}
        disabled={aplicando || !conhecido || valor === (atual ?? "")}
        className="bg-(--brand-turquoise) text-(--brand-petrol) hover:bg-(--brand-turquoise)/90"
      >
        {/* O lugar do ícone existe sempre: trocar entre nada e um spinner muda
            a largura do botão, e ele pula no clique — justo quando o olho está
            nele. */}
        <span className="inline-flex size-4 items-center justify-center">
          {aplicando ? <Loader2 className="size-4 animate-spin" /> : null}
        </span>
        Filtrar
      </Button>

      {/* "Limpar" fica no layout mesmo sem filtro aplicado, apenas invisível:
          aparecendo e sumindo, ele reposicionava tudo à direita a cada filtro.
          No modo compacto fica só o ícone — dois controles lado a lado
          reservariam 180px de espaço morto para um botão que quase sempre está
          invisível. */}
      <Button
        variant="ghost"
        size={compacto ? "icon" : undefined}
        onClick={() => {
          setValor("");
          aplicar("");
        }}
        disabled={aplicando || !atual}
        className={atual ? "" : "invisible"}
        aria-hidden={!atual}
        aria-label="Limpar filtro"
        title="Limpar filtro"
        tabIndex={atual ? undefined : -1}
      >
        <X className="size-4" />
        {compacto ? null : "Limpar"}
      </Button>

      {!conhecido ? (
        <p className="absolute top-full left-0 mt-0.5 text-xs text-destructive">
          {avisoDesconhecido}
        </p>
      ) : null}
    </div>
  );
}
