import { toggleFavoriteAction } from "@/app/app/looks/actions";
import { cn } from "@/lib/cn";

export function FavoriteButton({ productId, active, className }: { productId: string; active: boolean; className?: string }) {
  return (
    <form action={toggleFavoriteAction} className={className}>
      <input type="hidden" name="productId" value={productId} />
      <button
        type="submit"
        aria-pressed={active}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium",
          active ? "border-brand bg-brand/10 text-brand" : "border-line bg-surface text-ink hover:bg-canvas",
        )}
      >
        <span aria-hidden>{active ? "♥" : "♡"}</span>
        {active ? "Favoritado" : "Favoritar"}
      </button>
    </form>
  );
}
