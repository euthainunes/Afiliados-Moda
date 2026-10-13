import { ButtonLink } from "@/components/ui/button";
import { site } from "@/config/site";

const steps = [
  { title: "Monte", text: "Escolha peças reais de marcas parceiras e combine do seu jeito." },
  { title: "Compartilhe", text: "Cada look ganha um link próprio para WhatsApp, Instagram e onde mais quiser." },
  { title: "Ganhe", text: "Quando alguém compra pelo seu look, você acumula recompensas, com regras claras." },
];

// Página inicial provisória da Fase 3. O conteúdo final (looks em destaque, marcas) entra na Fase 4.
export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
      <section className="max-w-2xl">
        <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">{site.tagline}</h1>
        <p className="mt-4 text-lg text-muted">
          Uma vitrine de looks montados por pessoas reais, com links diretos para as peças nas lojas.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/cadastro">Criar meu primeiro look</ButtonLink>
          <ButtonLink href="/entrar" variant="secondary">Já tenho conta</ButtonLink>
        </div>
      </section>
      <section aria-labelledby="como-funciona" className="mt-20">
        <h2 id="como-funciona" className="font-display text-2xl font-semibold">Como funciona</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-xl border border-line bg-surface p-6">
              <span className="text-sm font-medium text-brand">Passo {i + 1}</span>
              <h3 className="mt-1 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-muted">
          O programa de recompensas ainda está em preparação; as condições serão publicadas no regulamento antes do lançamento.
        </p>
      </section>
    </div>
  );
}
