import type { ComponentProps } from "react";

export function SelectField({
  name,
  label,
  options,
  errors,
  idPrefix = "campo",
  ...props
}: ComponentProps<"select"> & { name: string; label: string; options: Record<string, string>; errors?: string[]; idPrefix?: string }) {
  const id = `${idPrefix}-${name}`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <select id={id} name={name} className="h-11 w-full min-w-0 rounded-lg border border-line bg-surface px-3" aria-invalid={errors?.length ? true : undefined} {...props}>
        {Object.entries(options).map(([value, text]) => (
          <option key={value} value={value}>{text}</option>
        ))}
      </select>
      {errors?.length ? <p className="text-sm text-danger">{errors[0]}</p> : null}
    </div>
  );
}

export function TextareaField({
  name,
  label,
  hint,
  errors,
  idPrefix = "campo",
  ...props
}: ComponentProps<"textarea"> & { name: string; label: string; hint?: string; errors?: string[]; idPrefix?: string }) {
  const id = `${idPrefix}-${name}`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <textarea id={id} name={name} className="w-full min-w-0 rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm" aria-describedby={hint ? `${id}-ajuda` : undefined} {...props} />
      {hint && <p id={`${id}-ajuda`} className="text-sm text-muted">{hint}</p>}
      {errors?.length ? <p className="text-sm text-danger">{errors[0]}</p> : null}
    </div>
  );
}
