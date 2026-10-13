import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="conteudo" className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="text-sm font-medium text-brand">Erro 404</p>
      <h1 className="mt-2 font-display text-3xl font-semibold">Página não encontrada</h1>
      <p className="mt-3 text-muted">O endereço pode estar errado ou a página não existe mais.</p>
      <ButtonLink href="/" className="mt-8">Voltar ao início</ButtonLink>
    </main>
  );
}
