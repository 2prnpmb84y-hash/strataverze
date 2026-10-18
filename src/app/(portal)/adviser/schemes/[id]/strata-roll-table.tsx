"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

type StrataRollRow = {
  id: string;
  lotNumber: string;
  unitNumber: string | null;
  entitlement: number;
  ownerNames: string;
  opening: number;
  annual: number;
  special: number;
  paid: number;
  closing: number;
  interestPaid: number;
};

const ROWS_PER_PAGE = 15;

const filterTabs = [
  { key: "lot", label: "Lot" },
  { key: "unit", label: "Unit" },
  { key: "owner", label: "Owner" },
] as const;

type FilterTab = (typeof filterTabs)[number]["key"];

function formatCurrency(value: number) {
  return value.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  });
}

export function StrataRollTable({
  rows,
  schemeId,
}: {
  rows: StrataRollRow[];
  schemeId: string;
}) {
  const [activeFilter, setActiveFilter] = useState<FilterTab>("lot");
  const [filterValue, setFilterValue] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = useMemo(() => {
    if (!filterValue.trim()) return rows;
    const q = filterValue.toLowerCase();

    return rows.filter((row) => {
      switch (activeFilter) {
        case "lot":
          return row.lotNumber.toLowerCase().includes(q);
        case "unit":
          return (row.unitNumber ?? "").toLowerCase().includes(q);
        case "owner":
          return row.ownerNames.toLowerCase().includes(q);
        default:
          return true;
      }
    });
  }, [rows, activeFilter, filterValue]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paged = filtered.slice(
    (safePage - 1) * ROWS_PER_PAGE,
    safePage * ROWS_PER_PAGE,
  );

  function handleFilterChange(tab: FilterTab) {
    setActiveFilter(tab);
    setFilterValue("");
    setCurrentPage(1);
  }

  function handleSearch(value: string) {
    setFilterValue(value);
    setCurrentPage(1);
  }

  return (
    <div>
      {/* Filter tabs and search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
        <div className="flex rounded-[var(--radius-card)] border border-line overflow-hidden">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleFilterChange(tab.key)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeFilter === tab.key
                  ? "bg-primary-400 text-white"
                  : "bg-white text-ink-muted hover:text-ink hover:bg-muted"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={filterValue}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={`Filter by ${activeFilter}...`}
          className="w-full sm:w-56 rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th scope="col" className="px-3 py-2.5 text-left font-medium text-ink-muted whitespace-nowrap">
                Lot
              </th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium text-ink-muted whitespace-nowrap">
                Unit
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium text-ink-muted whitespace-nowrap">
                UOE
              </th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium text-ink-muted whitespace-nowrap">
                Owner
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium text-ink-muted whitespace-nowrap">
                Opening
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium text-ink-muted whitespace-nowrap">
                +Annual
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium text-ink-muted whitespace-nowrap">
                +Special
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium text-ink-muted whitespace-nowrap">
                ~Paid
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium text-ink-muted whitespace-nowrap">
                ~Closing
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium text-ink-muted whitespace-nowrap">
                Interest Paid
              </th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="px-3 py-8 text-center text-ink-muted"
                >
                  {filterValue
                    ? "No lots match your filter."
                    : "No lots registered yet."}
                </td>
              </tr>
            ) : (
              paged.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-line hover:bg-muted/30 transition-colors"
                >
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/adviser/schemes/${schemeId}/lots/${row.id}`}
                      className="font-medium text-ink hover:text-turquoise transition-colors"
                    >
                      {row.lotNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-ink-muted">
                    {row.unitNumber ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-variant-numeric tabular-nums">
                    {row.entitlement}
                  </td>
                  <td className="px-3 py-2.5 text-ink-muted max-w-[200px] truncate">
                    {row.ownerNames || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-variant-numeric tabular-nums text-ink-muted">
                    {formatCurrency(row.opening)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-variant-numeric tabular-nums">
                    {formatCurrency(row.annual)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-variant-numeric tabular-nums">
                    {formatCurrency(row.special)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-variant-numeric tabular-nums text-green-600">
                    {formatCurrency(row.paid)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-variant-numeric tabular-nums font-medium">
                    {formatCurrency(row.closing)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-variant-numeric tabular-nums text-ink-muted">
                    {formatCurrency(row.interestPaid)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-4">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
            className="px-2 py-1 rounded text-sm text-ink-muted hover:text-ink disabled:opacity-40 transition-colors"
            aria-label="Previous page"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M10 4l-4 4 4 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              type="button"
              onClick={() => setCurrentPage(page)}
              className={`min-w-[28px] h-7 rounded text-sm font-medium transition-colors ${
                page === safePage
                  ? "bg-primary-400 text-white"
                  : "text-ink-muted hover:text-ink hover:bg-muted"
              }`}
            >
              {page}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
            className="px-2 py-1 rounded text-sm text-ink-muted hover:text-ink disabled:opacity-40 transition-colors"
            aria-label="Next page"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M6 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Row count */}
      <p className="text-xs text-ink-muted text-center mt-2">
        {filtered.length} {filtered.length === 1 ? "lot" : "lots"}
        {filterValue && ` matching "${filterValue}"`}
      </p>
    </div>
  );
}
