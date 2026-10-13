import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-xl border border-line bg-surface p-5 sm:p-6", className)} {...props} />;
}

export function PageTitle({ children, description }: { children: React.ReactNode; description?: React.ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">{children}</h1>
      {description && <p className="mt-2 text-muted">{description}</p>}
    </header>
  );
}
