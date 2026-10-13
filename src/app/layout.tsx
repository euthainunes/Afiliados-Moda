import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { connection } from "next/server";
import { EnvironmentBanner } from "@/components/environment-banner";
import { site } from "@/config/site";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: site.name, template: `%s · ${site.name}` },
  description: site.tagline,
};

export const viewport: Viewport = { themeColor: "#faf7f4" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Toda página é renderizada por requisição: é o que permite aplicar o nonce da CSP (src/proxy.ts)
  // aos scripts do Next. Páginas pré-geradas no build não teriam o nonce e seriam bloqueadas.
  await connection();
  return (
    <html lang="pt-BR" className={`${inter.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2"
        >
          Pular para o conteúdo
        </a>
        <EnvironmentBanner />
        {children}
      </body>
    </html>
  );
}
