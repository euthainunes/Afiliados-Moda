import Link from "next/link";
import { buttonClasses } from "./button";

export function Pagination({ page, pages, href }: { page: number; pages: number; href: (page: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Paginação" className="mt-8 flex items-center justify-center gap-3 text-sm">
      {page > 1 && (
        <Link className={buttonClasses("secondary", "sm")} href={href(page - 1)}>
          Anterior
        </Link>
      )}
      <span className="text-muted">
        Página {page} de {pages}
      </span>
      {page < pages && (
        <Link className={buttonClasses("secondary", "sm")} href={href(page + 1)}>
          Próxima
        </Link>
      )}
    </nav>
  );
}
