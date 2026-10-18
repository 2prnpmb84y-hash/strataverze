"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { SearchInput } from "@/components/ui/search-input";
import { ListToolbar } from "@/components/ui/list-toolbar";

type SchemeItem = {
  id: string;
  name: string;
  planNumber: string;
  suburb: string;
  state: string;
  postcode: string;
  totalLots: number;
};

export function SchemeList({
  schemes,
  portalPrefix = "adviser",
}: {
  schemes: SchemeItem[];
  portalPrefix?: string;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return schemes;
    return schemes.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.planNumber.toLowerCase().includes(q) ||
        s.suburb.toLowerCase().includes(q) ||
        s.postcode.includes(q),
    );
  }, [schemes, search]);

  return (
    <>
      {schemes.length > 0 && (
        <ListToolbar>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by name, plan number, suburb..."
            className="flex-1"
          />
        </ListToolbar>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-[var(--radius-card)] bg-white border border-line p-6 text-center">
          <p className="text-sm text-ink-muted">
            {schemes.length === 0
              ? "No schemes yet."
              : "No schemes match your search."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((scheme) => (
            <Link
              key={scheme.id}
              href={`/${portalPrefix}/schemes/${scheme.id}`}
              className="block rounded-[var(--radius-card)] bg-white border border-line p-5 hover:border-turquoise/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-heading font-semibold text-ink">
                    {scheme.name}
                  </h3>
                  <p className="text-sm text-ink-muted mt-0.5">
                    {scheme.planNumber} &middot; {scheme.suburb},{" "}
                    {scheme.state} {scheme.postcode}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-xs text-ink-muted">
                    {scheme.totalLots} lot{scheme.totalLots === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
