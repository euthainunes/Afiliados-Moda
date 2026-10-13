import { Badge } from "@/components/ui/badge";
import { dateTimeFmt } from "@/lib/dates";

const STATUS = { open: ["Aberto", "warning"], answered: ["Respondido", "success"], closed: ["Encerrado", "neutral"] } as const;

export function TicketStatusBadge({ status }: { status: keyof typeof STATUS }) {
  const [label, tone] = STATUS[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function TicketThread({ messages }: { messages: { message: { id: string; body: string; fromStaff: boolean; createdAt: Date }; authorName: string | null }[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {messages.map(({ message, authorName }) => (
        <li key={message.id} className={`rounded-xl border p-4 ${message.fromStaff ? "border-accent/30 bg-success-bg" : "border-line bg-surface"}`}>
          <p className="text-xs text-muted">
            {message.fromStaff ? "Equipe de suporte" : (authorName ?? "Visitante")} · {dateTimeFmt.format(message.createdAt)}
          </p>
          <p className="mt-1 whitespace-pre-wrap">{message.body}</p>
        </li>
      ))}
    </ol>
  );
}
