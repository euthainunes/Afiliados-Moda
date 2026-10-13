import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/cn";

export function Money({ cents, className }: { cents: number; className?: string }) {
  return <span className={cn("tabular-nums", cents < 0 && "text-danger", className)}>{formatCents(cents)}</span>;
}

export function DemoBadge({ show = true }: { show?: boolean }) {
  return show ? <Badge tone="warning">demonstração</Badge> : null;
}

export function StatTile({ label, value, help, nature }: { label: string; value: React.ReactNode; help?: string; nature?: "confirmado" | "estimado" }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <dt className="flex items-center justify-between gap-2 text-sm text-muted">
        <span>{label}</span>
        {nature && <Badge tone={nature === "confirmado" ? "success" : "neutral"}>{nature}</Badge>}
      </dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums sm:text-3xl">{value}</dd>
      {help && <dd className="mt-1 text-xs text-muted">{help}</dd>}
    </div>
  );
}
