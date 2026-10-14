"use client";

import { Button, ButtonLink } from "@/components/ui/button";

// Erro inesperado numa página. Os detalhes técnicos ficam só no registro do servidor; a pessoa vê
// um código (digest) que o suporte usa para localizar o evento.
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main id="conteudo" className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="text-sm font-medium text-brand">Algo deu errado</p>
      <h1 className="mt-2 font-display text-3xl font-semibold">Não conseguimos carregar esta página</h1>
      <p className="mt-3 text-muted">Tente de novo em instantes. Se continuar, fale com o suporte informando o código abaixo.</p>
      {error.digest && (
        <p className="mt-4 rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm" data-testid="codigo-erro">
          Código: {error.digest}
        </p>
      )}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button type="button" onClick={() => retry()}>Tentar de novo</Button>
        <ButtonLink href="/" variant="secondary">Voltar ao início</ButtonLink>
      </div>
    </main>
  );
}
