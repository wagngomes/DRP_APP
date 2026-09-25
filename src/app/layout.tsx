import { cookies } from "next/headers";
import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DRP_AI",
  description: "Previsões de abastecimento e riscos de ruptura em CDs",
};

/**
 * Menu recolhido, carimbado no `<html>` pelo servidor.
 *
 * Vem de cookie e não de `localStorage` por um motivo só: o servidor precisa
 * saber antes de mandar o HTML. Guardado no navegador, a página chegava sempre
 * com o menu aberto e a hidratação o fechava — o piscar que aparecia a cada
 * recarregamento, mais visível no raio-X, onde o filtro é um `<form>` GET e
 * recarrega o documento inteiro a cada consulta.
 *
 * Com o atributo no HTML desde o primeiro byte, o CSS já pinta a largura certa
 * e não há o que corrigir depois.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const recolhido = (await cookies()).get("drp-menu")?.value === "1";

  return (
    <html
      lang="pt-BR"
      data-menu={recolhido ? "recolhido" : undefined}
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
