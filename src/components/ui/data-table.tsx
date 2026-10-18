"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type DataTableColumn<T> = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  render?: (row: T, index: number) => React.ReactNode;
  className?: string;
};

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  data: T[];
  /** Show a checkbox column. Selection state is managed internally unless controlled externally. */
  selectable?: boolean;
  /** Rows per page. Defaults to 15. Pass 0 to disable pagination. */
  pageSize?: number;
  /** Toolbar rendered above the table (filter pills, search, etc.) */
  toolbar?: React.ReactNode;
  /** Called when a row is clicked */
  onRowClick?: (row: T, index: number) => void;
  /** Key extractor for rows */
  rowKey?: (row: T, index: number) => string;
  /** Empty state message */
  emptyMessage?: string;
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  selectable = false,
  pageSize = 15,
  toolbar,
  onRowClick,
  rowKey,
  emptyMessage = "No data to display",
}: DataTableProps<T>) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const paginated = pageSize > 0;
  const totalPages = paginated ? Math.max(1, Math.ceil(data.length / pageSize)) : 1;
  const currentPage = Math.min(page, totalPages);
  const rows = paginated
    ? data.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : data;

  const allSelected = rows.length > 0 && rows.every((_, i) => {
    const absIdx = paginated ? (currentPage - 1) * pageSize + i : i;
    return selected.has(absIdx);
  });

  function toggleAll() {
    const next = new Set(selected);
    rows.forEach((_, i) => {
      const absIdx = paginated ? (currentPage - 1) * pageSize + i : i;
      if (allSelected) next.delete(absIdx);
      else next.add(absIdx);
    });
    setSelected(next);
  }

  function toggleRow(absIdx: number) {
    const next = new Set(selected);
    if (next.has(absIdx)) next.delete(absIdx);
    else next.add(absIdx);
    setSelected(next);
  }

  // Page numbers to show
  const pageNumbers: number[] = [];
  const maxVisible = 5;
  let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  const end = Math.min(totalPages, start + maxVisible - 1);
  start = Math.max(1, end - maxVisible + 1);
  for (let i = start; i <= end; i++) pageNumbers.push(i);

  return (
    <div>
      {toolbar && <div className="mb-4">{toolbar}</div>}

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-peach">
              {selectable && (
                <th className="w-10 px-3 py-2.5 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="rounded border-ink-muted"
                    aria-label="Select all rows"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-3 py-2.5 font-semibold text-ink whitespace-nowrap ${
                    col.align === "right"
                      ? "text-right"
                      : col.align === "center"
                        ? "text-center"
                        : "text-left"
                  } ${col.className ?? ""}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="px-3 py-12 text-center text-ink-muted"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => {
                const absIdx = paginated
                  ? (currentPage - 1) * pageSize + i
                  : i;
                const key = rowKey ? rowKey(row, absIdx) : String(absIdx);

                return (
                  <tr
                    key={key}
                    className={`h-9 border-b border-line hover:bg-[#FAFAFA] transition-colors ${
                      onRowClick ? "cursor-pointer" : ""
                    }`}
                    onClick={
                      onRowClick ? () => onRowClick(row, absIdx) : undefined
                    }
                  >
                    {selectable && (
                      <td className="w-10 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(absIdx)}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleRow(absIdx);
                          }}
                          className="rounded border-ink-muted"
                          aria-label={`Select row ${absIdx + 1}`}
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-3 py-2 text-ink ${
                          col.align === "right"
                            ? "text-right"
                            : col.align === "center"
                              ? "text-center"
                              : "text-left"
                        } ${col.className ?? ""}`}
                      >
                        {col.render
                          ? col.render(row, absIdx)
                          : (row[col.key] as React.ReactNode) ?? ""}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {paginated && totalPages > 1 && (
        <nav
          aria-label="Table pagination"
          className="flex items-center justify-center gap-1 mt-4 pt-4"
        >
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="flex items-center justify-center w-8 h-8 rounded-full text-ink-muted hover:text-ink disabled:opacity-30 transition-colors"
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
          </button>

          {pageNumbers.map((n) => (
            <button
              key={n}
              onClick={() => setPage(n)}
              className={`flex items-center justify-center w-6 h-6 rounded-full text-[13px] font-medium transition-colors ${
                n === currentPage
                  ? "bg-mint-soft text-ink"
                  : "text-ink-muted hover:text-ink"
              }`}
              aria-current={n === currentPage ? "page" : undefined}
            >
              {n}
            </button>
          ))}

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="flex items-center justify-center w-8 h-8 rounded-full text-ink-muted hover:text-ink disabled:opacity-30 transition-colors"
            aria-label="Next page"
          >
            <ChevronRight size={16} />
          </button>
        </nav>
      )}
    </div>
  );
}
