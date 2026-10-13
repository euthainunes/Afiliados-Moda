import { Alert } from "@/components/ui/alert";

// Página legal provisória: o texto definitivo depende de revisão jurídica (docs/06, D10/D11).
export function DraftLegalPage({ title, version, topics }: { title: string; version: string; topics: string[] }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-display text-3xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted">Versão {version}</p>
      <div className="mt-6">
        <Alert tone="warning" title="Rascunho em revisão jurídica">
          Este documento ainda não é a versão definitiva. Os tópicos abaixo serão detalhados antes do lançamento.
        </Alert>
      </div>
      <ul className="mt-6 list-disc space-y-2 pl-6">
        {topics.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
