export const DEFAULT_PAGE_SIZE = 15;

export type PaginationMeta = {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
};

/**
 * Parse and clamp the page number from searchParams.
 */
export function parsePage(
  searchParams: Record<string, string | string[] | undefined>,
  pageSize = DEFAULT_PAGE_SIZE,
): { page: number; offset: number; limit: number } {
  const raw = searchParams.page;
  const parsed = typeof raw === "string" ? parseInt(raw, 10) : 1;
  const page = Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;

  return {
    page,
    offset: (page - 1) * pageSize,
    limit: pageSize,
  };
}

/**
 * Paginate an already-fetched array in memory.
 * Use when the query doesn't support limit/offset natively.
 */
export function paginateArray<T>(
  items: T[],
  page: number,
  pageSize = DEFAULT_PAGE_SIZE,
): { data: T[]; meta: PaginationMeta } {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const offset = (currentPage - 1) * pageSize;

  return {
    data: items.slice(offset, offset + pageSize),
    meta: {
      currentPage,
      totalPages,
      totalItems,
      pageSize,
    },
  };
}
