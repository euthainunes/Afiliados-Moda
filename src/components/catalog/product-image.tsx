import Image from "next/image";
import { cn } from "@/lib/cn";

// Imagens locais em SVG (catálogo fictício) não passam pelo otimizador; imagens remotas sim.
export function ProductImage({
  src,
  alt,
  sizes,
  className,
  priority,
}: {
  src: string | null;
  alt: string;
  sizes: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div className={cn("relative aspect-[3/4] overflow-hidden bg-line/40", className)}>
      {src ? (
        <Image src={src} alt={alt} fill sizes={sizes} priority={priority} unoptimized={src.endsWith(".svg")} className="object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted">Sem imagem</div>
      )}
    </div>
  );
}
