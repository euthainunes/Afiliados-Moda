import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

// Campo de formulário com rótulo, ajuda e erro associados por aria-describedby.
export function Field({
  name,
  label,
  hint,
  errors,
  className,
  idPrefix = "campo",
  ...input
}: ComponentProps<"input"> & { name: string; label: string; hint?: ReactNode; errors?: string[]; idPrefix?: string }) {
  // idPrefix evita ids repetidos quando há mais de um formulário na mesma página.
  const id = input.id ?? `${idPrefix}-${name}`;
  const hintId = hint ? `${id}-ajuda` : undefined;
  const errorId = errors?.length ? `${id}-erro` : undefined;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        className={cn(
          "h-11 w-full min-w-0 rounded-lg border bg-surface px-3 text-base text-ink placeholder:text-muted",
          errors?.length ? "border-danger" : "border-line",
        )}
        {...input}
      />
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {errors?.length ? (
        <p id={errorId} className="text-sm text-danger">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}

export function CheckboxField({
  name,
  children,
  errors,
  idPrefix = "campo",
  ...input
}: ComponentProps<"input"> & { name: string; children: ReactNode; errors?: string[]; idPrefix?: string }) {
  const id = `${idPrefix}-${name}`;
  const errorId = errors?.length ? `${id}-erro` : undefined;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-3">
        <input
          id={id}
          name={name}
          type="checkbox"
          aria-invalid={errors?.length ? true : undefined}
          aria-describedby={errorId}
          className="mt-1 size-5 shrink-0 accent-brand"
          {...input}
        />
        <label htmlFor={id} className="text-sm leading-6">
          {children}
        </label>
      </div>
      {errors?.length ? (
        <p id={errorId} className="text-sm text-danger">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}
