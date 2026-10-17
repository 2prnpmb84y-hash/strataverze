"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type PaginationProps = {
  page: number;
  hasMore: boolean;
};

/**
 * Simple prev/next pagination control.
 * Preserves existing query params while updating the `page` param.
 */
export function Pagination({ page, hasMore }: PaginationProps) {
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

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between border-t border-white/10 pt-4 mt-6"
    >
      <div>
        {page > 1 && (
          <Link
            href={buildHref(page - 1)}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white/70 transition hover:bg-white/5 hover:text-white"
          >
            ← Previous
          </Link>
        )}
      </div>
      <span className="text-sm text-white/50">Page {page}</span>
      <div>
        {hasMore && (
          <Link
            href={buildHref(page + 1)}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white/70 transition hover:bg-white/5 hover:text-white"
          >
            Next →
          </Link>
        )}
      </div>
    </nav>
  );
}
