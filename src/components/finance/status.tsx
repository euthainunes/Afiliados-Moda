import { Badge } from "@/components/ui/badge";

const CONVERSION = {
  registered: ["Registrada", "neutral"],
  in_validation: ["Em validação", "neutral"],
  approved: ["Aprovada", "success"],
  rejected: ["Não elegível", "danger"],
  canceled: ["Cancelada", "danger"],
} as const;

const PAYOUT = {
  requested: ["Solicitado", "neutral"],
  approved: ["Aprovado", "warning"],
  rejected: ["Recusado", "danger"],
  paid: ["Pago", "success"],
  canceled: ["Cancelado", "neutral"],
} as const;

export function ConversionStateBadge({ state, eligible }: { state: keyof typeof CONVERSION; eligible?: boolean }) {
  if (state === "approved" && eligible) return <Badge tone="success">Liberada para resgate</Badge>;
  const [label, tone] = CONVERSION[state];
  return <Badge tone={tone}>{label}</Badge>;
}

export function PayoutStatusBadge({ status, simulated }: { status: keyof typeof PAYOUT; simulated?: boolean }) {
  const [label, tone] = PAYOUT[status];
  return <Badge tone={tone}>{status === "paid" && simulated ? "Pago (simulado)" : label}</Badge>;
}
