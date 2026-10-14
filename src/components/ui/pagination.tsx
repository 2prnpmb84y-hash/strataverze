import Link from "next/link";

type PaginationProps = {
  currentPage: number;
  totalPages: number;
  basePath: string;
  searchParams?: Record<string, string | undefined>;
};

function buildHref(
  basePath: string,
  page: number,
  searchParams?: Record<string, string | undefined>,
) {
  const params = new URLSearchParams();
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== "") {
        params.set(key, value);
      }
    }
  }
  if (page > 1) {
    params.set("page", String(page));
  } else {
    params.delete("page");
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function Pagination({
  currentPage,
  totalPages,
  basePath,
  searchParams,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  // Build a window of page numbers around the current page
  const pages: (number | "ellipsis")[] = [];
  const delta = 1; // pages either side of current

  for (let i = 1; i <= totalPages; i++) {
    if (
      i === 1 ||
      i === totalPages ||
      (i >= currentPage - delta && i <= currentPage + delta)
    ) {
      pages.push(i);
    } else if (
      pages.length > 0 &&
      pages[pages.length - 1] !== "ellipsis"
    ) {
      pages.push("ellipsis");
    }
  }

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-4 pt-4"
    >
      <p className="text-xs text-muted-foreground">
        Page {currentPage} of {totalPages}
      </p>

      <div className="flex items-center gap-1">
        {currentPage > 1 ? (
          <Link
            href={buildHref(basePath, currentPage - 1, searchParams)}
            className="inline-flex items-center justify-center rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Previous page"
          >
            ←
          </Link>
        ) : (
          <span className="inline-flex items-center justify-center rounded-md px-2.5 py-1.5 text-sm text-muted-foreground/40">
            ←
          </span>
        )}

        {pages.map((page, idx) =>
          page === "ellipsis" ? (
            <span
              key={`ellipsis-${idx}`}
              className="inline-flex items-center justify-center w-8 text-sm text-muted-foreground"
            >
              …
            </span>
          ) : (
            <Link
              key={page}
              href={buildHref(basePath, page, searchParams)}
              className={`inline-flex items-center justify-center rounded-md w-8 h-8 text-sm transition-colors ${
                page === currentPage
                  ? "bg-primary-400 text-white font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              aria-label={`Page ${page}`}
              aria-current={page === currentPage ? "page" : undefined}
            >
              {page}
            </Link>
          ),
        )}

        {currentPage < totalPages ? (
          <Link
            href={buildHref(basePath, currentPage + 1, searchParams)}
            className="inline-flex items-center justify-center rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Next page"
          >
            →
          </Link>
        ) : (
          <span className="inline-flex items-center justify-center rounded-md px-2.5 py-1.5 text-sm text-muted-foreground/40">
            →
          </span>
        )}
      </div>
    </nav>
  );
}
