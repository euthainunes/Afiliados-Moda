const TZ = "America/Sao_Paulo";

// "AAAA-MM-DD" no fuso de São Paulo, para campos <input type="date">.
export function toDateInput(date: Date | null | undefined): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: TZ });
export const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: TZ });
