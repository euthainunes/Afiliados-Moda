import { cn } from "@/lib/cn";

type Tone = "neutral" | "success" | "warning" | "danger";
const tones: Record<Tone, string> = {
  neutral: "bg-line/60 text-ink",
  success: "bg-success-bg text-accent",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
};

// Status sempre com texto (nunca apenas cor).
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}
