/**
 * Marca do DRP_AI.
 *
 * O símbolo é um chevron apontando para a frente com três linhas de velocidade
 * atrás — leitura direta de movimento e entrega — dentro de um losango
 * arredondado com o gradiente da paleta (petróleo → turquesa).
 */
export function LogoDrp({ compacto = false }: { compacto?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg
        viewBox="0 0 32 32"
        role="img"
        aria-label="DRP_AI"
        className="size-8 shrink-0"
      >
        <defs>
          <linearGradient id="logo-drp-fundo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--brand-petrol)" />
            <stop offset="55%" stopColor="var(--brand-green)" />
            <stop offset="100%" stopColor="var(--brand-turquoise)" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#logo-drp-fundo)" />
        {/* Linhas de velocidade: diminuem de baixo para cima, dando arranque. */}
        <g stroke="white" strokeWidth="2.2" strokeLinecap="round" opacity="0.75">
          <line x1="6.5" y1="11" x2="11.5" y2="11" />
          <line x1="4.5" y1="16" x2="10.5" y2="16" />
          <line x1="6.5" y1="21" x2="11.5" y2="21" />
        </g>
        <path
          d="M15 8.5 L22.5 16 L15 23.5"
          fill="none"
          stroke="white"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!compacto && (
        /* Turquesa puro não tem contraste sobre fundo claro — no tema claro o
           sufixo vai no verde da paleta, e só no escuro assume o turquesa. */
        <span className="text-lg leading-none font-bold tracking-tight text-(--brand-petrol) dark:text-foreground">
          DRP
          <span className="text-(--brand-green) dark:text-(--brand-turquoise)">_AI</span>
        </span>
      )}
    </span>
  );
}
