/**
 * Shared pagination utilities for list queries.
 *
 * Queries accept optional `page` and `pageSize` parameters.
 * The default page size caps unbounded result sets while remaining
 * large enough that most schemes never need a second page.
 */

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export type PaginationParams = {
  page?: number;
  pageSize?: number;
};

export type PaginatedResult<T> = {
  data: T[];
  page: number;
  pageSize: number;
  hasMore: boolean;
};

/**
 * Normalise raw pagination input into safe offset/limit values.
 */
export function normalisePagination(params?: PaginationParams) {
  const page = Math.max(1, params?.page ?? 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, params?.pageSize ?? DEFAULT_PAGE_SIZE),
  );
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset, limit: pageSize + 1 };
}

/**
 * Slice a fetched-with-limit+1 array into a PaginatedResult.
 * The extra row tells us whether more data exists without a COUNT.
 */
export function paginate<T>(
  rows: T[],
  page: number,
  pageSize: number,
): PaginatedResult<T> {
  const hasMore = rows.length > pageSize;
  return {
    data: hasMore ? rows.slice(0, pageSize) : rows,
    page,
    pageSize,
    hasMore,
  };
}

/**
 * Parse page number from search params.
 */
export function parsePage(
  sp: Record<string, string | string[] | undefined>,
): { page: number } {
  const raw = typeof sp.page === "string" ? sp.page : "1";
  const page = Math.max(1, parseInt(raw, 10) || 1);
  return { page };
}

/**
 * Client-side pagination of an already-fetched array.
 * Returns a slice of items and metadata for the Pagination component.
 */
export function paginateArray<T>(
  items: T[],
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): { data: T[]; meta: { page: number; hasMore: boolean } } {
  const start = (page - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  const hasMore = start + pageSize < items.length;
  return {
    data: slice,
    meta: { page, hasMore },
  };
}
