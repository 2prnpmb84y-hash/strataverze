"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

type PaginationProps = {
  page: number;
  totalPages?: number;
  hasMore: boolean;
};

/**
 * Figma-aligned pagination: centred page numbers with mint-soft current page circle.
 * Preserves existing query params while updating the `page` param.
 */
export function Pagination(props: PaginationProps) {
  return (
    <Suspense fallback={null}>
      <PaginationInner {...props} />
    </Suspense>
  );
}

function PaginationInner({ page, totalPages, hasMore }: PaginationProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (page <= 1 && !hasMore) return null;

  function buildHref(targetPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (targetPage <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(targetPage));
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  // Build page numbers to show
  const pageNumbers: number[] = [];
  if (totalPages && totalPages > 1) {
    const maxVisible = 5;
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    const end = Math.min(totalPages, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);
    for (let i = start; i <= end; i++) pageNumbers.push(i);
  }

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-center gap-1 pt-4 mt-4"
    >
      {/* Previous */}
      {page > 1 ? (
        <Link
          href={buildHref(page - 1)}
          className="flex items-center justify-center w-8 h-8 rounded-full text-ink-muted hover:text-ink transition-colors"
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </Link>
      ) : (
        <span className="flex items-center justify-center w-8 h-8 rounded-full text-ink-muted/30">
          <ChevronLeft size={16} />
        </span>
      )}

      {/* Page numbers */}
      {pageNumbers.length > 0 ? (
        pageNumbers.map((n) => (
          <Link
            key={n}
            href={buildHref(n)}
            className={`flex items-center justify-center w-6 h-6 rounded-full text-[13px] font-medium transition-colors ${
              n === page
                ? "bg-mint-soft text-ink"
                : "text-ink-muted hover:text-ink"
            }`}
            aria-current={n === page ? "page" : undefined}
          >
            {n}
          </Link>
        ))
      ) : (
        <span className="text-sm text-ink-muted tabular-nums">
          Page {page}
        </span>
      )}

      {/* Next */}
      {hasMore ? (
        <Link
          href={buildHref(page + 1)}
          className="flex items-center justify-center w-8 h-8 rounded-full text-ink-muted hover:text-ink transition-colors"
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </Link>
      ) : (
        <span className="flex items-center justify-center w-8 h-8 rounded-full text-ink-muted/30">
          <ChevronRight size={16} />
        </span>
      )}
    </nav>
  );
}
