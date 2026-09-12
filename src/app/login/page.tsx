import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { AuthPanel } from "@/components/auth/auth-panel";

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (session) {
    redirect("/");
  }

  // `flex-col` no celular empilha faixa e formulário; `lg:flex-row` devolve a
  // divisão ao meio do desktop, que não muda.
  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row">
      <FaixaCelular />
      <LogisticsShowcase />
      <div className="flex flex-1 items-center justify-center bg-background px-6 py-12">
        <AuthPanel />
      </div>
    </div>
  );
}

/**
 * Rede de CDs: o desenho que dá identidade à tela de entrada.
 *
 * Extraído para servir às duas versões — a faixa do celular e a metade do
 * desktop — em vez de existir duas vezes com risco de divergir.
 */
function RedeDeNos() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-20"
      viewBox="0 0 400 400"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <g stroke="white" strokeWidth="1">
        <line x1="40" y1="60" x2="200" y2="140" />
        <line x1="200" y1="140" x2="360" y2="90" />
        <line x1="200" y1="140" x2="150" y2="300" />
        <line x1="150" y1="300" x2="320" y2="340" />
        <line x1="150" y1="300" x2="60" y2="360" />
        <line x1="200" y1="140" x2="330" y2="250" />
      </g>
      <g fill="var(--brand-turquoise)">
        <circle cx="40" cy="60" r="6" />
        <circle cx="200" cy="140" r="8" />
        <circle cx="360" cy="90" r="5" />
        <circle cx="150" cy="300" r="7" />
        <circle cx="320" cy="340" r="5" />
        <circle cx="60" cy="360" r="5" />
        <circle cx="330" cy="250" r="5" />
      </g>
    </svg>
  );
}

/**
 * A mesma identidade, em faixa, para telas estreitas.
 *
 * Sem ela o celular abria num retângulo branco com um formulário no meio — sem
 * marca, sem contexto, indistinguível de qualquer tela de login. A faixa é
 * curta de propósito: precisa sobrar altura para o teclado do telefone, que
 * cobre metade da tela quando o campo de senha recebe foco.
 *
 * `lg:hidden` e o showcase `hidden lg:flex` são complementares: em nenhuma
 * largura os dois aparecem juntos, e acima de 1024px o desktop fica exatamente
 * como estava.
 */
function FaixaCelular() {
  return (
    <div className="relative flex h-40 shrink-0 flex-col justify-end overflow-hidden bg-(--brand-petrol) px-6 pb-5 text-white sm:h-48 lg:hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, var(--brand-turquoise) 0%, transparent 35%), radial-gradient(circle at 80% 0%, var(--brand-green) 0%, transparent 40%), radial-gradient(circle at 50% 100%, var(--brand-turquoise) 0%, transparent 45%)",
        }}
      />
      <RedeDeNos />

      <div className="relative z-10 space-y-1">
        <span className="text-xl font-bold tracking-tight">DRP_AI</span>
        <p className="text-sm leading-snug text-white/80">
          Previsibilidade de abastecimento para toda a sua rede de CDs
        </p>
      </div>
    </div>
  );
}

function LogisticsShowcase() {
  return (
    <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-(--brand-petrol) p-12 text-white lg:flex">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, var(--brand-turquoise) 0%, transparent 35%), radial-gradient(circle at 80% 0%, var(--brand-green) 0%, transparent 40%), radial-gradient(circle at 50% 100%, var(--brand-turquoise) 0%, transparent 45%)",
        }}
      />

      <RedeDeNos />

      <div className="relative z-10">
        <span className="text-2xl font-bold tracking-tight">DRP_AI</span>
      </div>

      <div className="relative z-10 max-w-md space-y-4">
        <h1 className="text-3xl font-semibold leading-tight">
          Previsibilidade de abastecimento para toda a sua rede de CDs
        </h1>
        <p className="text-white/80">
          Transações, estoques, pedidos e transferências em um só lugar — com IA
          priorizando riscos de ruptura e sugestões de reabastecimento.
        </p>
      </div>
    </div>
  );
}
