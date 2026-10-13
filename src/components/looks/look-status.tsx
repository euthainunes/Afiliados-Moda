import { Badge } from "@/components/ui/badge";

const LABELS = {
  draft: ["Rascunho", "neutral"],
  published: ["Publicado", "success"],
  unpublished: ["Despublicado", "warning"],
  removed: ["Removido pela moderação", "danger"],
} as const;

export function LookStatusBadge({ status }: { status: keyof typeof LABELS }) {
  const [label, tone] = LABELS[status];
  return <Badge tone={tone}>{label}</Badge>;
}
