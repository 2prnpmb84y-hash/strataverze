"use client";

import { useState, useTransition } from "react";
import { SearchInput } from "@/components/ui/search-input";
import { FilterSelect } from "@/components/ui/filter-select";
import { formatLotLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { selectScheme } from "@/lib/actions/scheme-selection";

type SchemeCard = {
  id: string;
  name: string;
  planNumber: string;
  address: string;
  suburb: string;
  state: string;
  postcode: string;
  totalLots: number;
  lotNumber: string | null;
  unitNumber: string | null;
  pendingLevies: number;
  activeWorkOrders: number;
  upcomingMeetings: number;
};

const stateOptions = [
  { value: "", label: "All States" },
  { value: "VIC", label: "VIC" },
  { value: "NSW", label: "NSW" },
  { value: "QLD", label: "QLD" },
  { value: "SA", label: "SA" },
  { value: "WA", label: "WA" },
  { value: "TAS", label: "TAS" },
  { value: "NT", label: "NT" },
  { value: "ACT", label: "ACT" },
];

export function SchemeGrid({
  schemes,
  firstName,
  canAddProperty = false,
}: {
  schemes: SchemeCard[];
  firstName: string;
  /** Only StrataVerze administrators onboard buildings. */
  canAddProperty?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [isPending, startTransition] = useTransition();

  const filtered = schemes.filter((s) => {
    if (stateFilter && s.state !== stateFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        s.planNumber.toLowerCase().includes(q) ||
        s.address.toLowerCase().includes(q) ||
        s.suburb.toLowerCase().includes(q)
      );
    }
    return true;
  });

  function handleSelect(schemeId: string) {
    startTransition(() => {
      selectScheme(schemeId);
    });
  }

  const totalNotifications = (s: SchemeCard) =>
    s.pendingLevies + s.activeWorkOrders + s.upcomingMeetings;

  return (
    <div>
      {/* Greeting */}
      <h1 className="text-2xl sm:text-3xl font-bold font-heading text-ink mb-1">
        G&apos;day, {firstName || "there"}!
      </h1>
      <p className="text-sm text-ink-muted mb-6">
        Select a property to manage.
      </p>

      {/* Add Property button (StrataVerze administrators only) */}
      {canAddProperty && (
        <div className="mb-6">
          <Button href="/owner/add-property">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Add Property
          </Button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <FilterSelect
          label="State"
          value={stateFilter}
          onChange={setStateFilter}
          options={stateOptions}
          className="w-full sm:w-36"
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search properties..."
          className="flex-1"
        />
        {/* View toggle */}
        <div className="flex rounded-[var(--radius-card)] border border-line overflow-hidden shrink-0">
          <button
            type="button"
            onClick={() => setView("grid")}
            className={`px-3 py-2 transition-colors ${
              view === "grid"
                ? "bg-turquoise text-white"
                : "bg-white text-ink-muted hover:text-ink"
            }`}
            aria-label="Grid view"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
              <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
              <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
              <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={`px-3 py-2 transition-colors ${
              view === "list"
                ? "bg-turquoise text-white"
                : "bg-white text-ink-muted hover:text-ink"
            }`}
            aria-label="List view"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M1 3h14M1 8h14M1 13h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Scheme count */}
      <p className="text-xs text-ink-muted mb-4">
        {filtered.length} {filtered.length === 1 ? "property" : "properties"} found
      </p>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="rounded-[var(--radius-card)] bg-white border border-line p-8 text-center">
          <p className="text-ink-muted text-sm">
            {schemes.length === 0
              ? "No properties registered yet. Contact your strata manager to get connected."
              : "No properties match your search."}
          </p>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((scheme) => (
            <button
              key={scheme.id}
              type="button"
              onClick={() => handleSelect(scheme.id)}
              disabled={isPending}
              className="group text-left rounded-[var(--radius-card)] bg-white border border-line overflow-hidden transition-all hover:shadow-md hover:border-mint focus:outline-none focus:ring-2 focus:ring-turquoise focus:ring-offset-2 disabled:opacity-60"
            >
              {/* Colour bar */}
              <div className="h-2 bg-turquoise group-hover:bg-mint-soft0 transition-colors" />

              <div className="p-5">
                {/* Plan badge + notification count */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span className="inline-flex items-center rounded-md bg-mint-soft px-2.5 py-1 text-xs font-semibold text-turquoise">
                    {scheme.planNumber}
                  </span>
                  {totalNotifications(scheme) > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">
                      {totalNotifications(scheme)}
                    </span>
                  )}
                </div>

                {/* Address */}
                <p className="text-sm font-semibold text-ink leading-snug mb-1">
                  {scheme.address}
                </p>
                <p className="text-xs text-ink-muted mb-3">
                  {scheme.suburb}, {scheme.state} {scheme.postcode}
                </p>

                {/* Meta row */}
                <div className="flex items-center gap-3 text-xs text-ink-muted">
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium">
                    {scheme.state}
                  </span>
                  {scheme.lotNumber && (
                    <span>
                      {formatLotLabel(scheme.lotNumber)}
                      {scheme.unitNumber ? ` / Unit ${scheme.unitNumber}` : ""}
                    </span>
                  )}
                  <span>{scheme.totalLots} lots</span>
                </div>

                {/* Notification breakdown */}
                {totalNotifications(scheme) > 0 && (
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-line text-xs text-ink-muted">
                    {scheme.pendingLevies > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-danger" />
                        {scheme.pendingLevies} {scheme.pendingLevies === 1 ? "levy" : "levies"}
                      </span>
                    )}
                    {scheme.activeWorkOrders > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                        {scheme.activeWorkOrders} {scheme.activeWorkOrders === 1 ? "work order" : "work orders"}
                      </span>
                    )}
                    {scheme.upcomingMeetings > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-turquoise" />
                        {scheme.upcomingMeetings} {scheme.upcomingMeetings === 1 ? "meeting" : "meetings"}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      ) : (
        /* List view */
        <div className="flex flex-col gap-2">
          {filtered.map((scheme) => (
            <button
              key={scheme.id}
              type="button"
              onClick={() => handleSelect(scheme.id)}
              disabled={isPending}
              className="group text-left flex items-center gap-4 rounded-[var(--radius-card)] bg-white border border-line px-5 py-4 transition-all hover:shadow-md hover:border-mint focus:outline-none focus:ring-2 focus:ring-turquoise focus:ring-offset-2 disabled:opacity-60"
            >
              {/* Accent dot */}
              <div className="w-3 h-3 rounded-full bg-turquoise shrink-0" />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold text-turquoise">
                    {scheme.planNumber}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-ink-muted">
                    {scheme.state}
                  </span>
                </div>
                <p className="text-sm font-medium text-ink truncate">
                  {scheme.address}, {scheme.suburb} {scheme.postcode}
                </p>
              </div>

              {/* Notification count */}
              {totalNotifications(scheme) > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-danger px-1.5 text-[10px] font-bold text-white shrink-0">
                  {totalNotifications(scheme)}
                </span>
              )}

              {/* Arrow */}
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className="shrink-0 text-ink-muted group-hover:text-ink transition-colors"
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
          ))}
        </div>
      )}
    </div>
  );
}
