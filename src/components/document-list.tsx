"use client";

import { useState, useMemo } from "react";
import { SearchInput } from "@/components/ui/search-input";
import { FilterSelect } from "@/components/ui/filter-select";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Card, CardHeader } from "@/components/ui/card";
import { formatDateIn, PLATFORM_TIME_ZONE } from "@/lib/jurisdiction/time-zone";

const categoryLabels: Record<string, string> = {
  MINUTES: "Meeting Minutes",
  INSURANCE: "Insurance",
  BYLAW: "By-laws / Rules",
  FINANCIAL: "Financial Reports",
  COMPLIANCE: "Compliance",
  OTHER: "Other",
};

const categoryOrder = [
  "INSURANCE",
  "BYLAW",
  "FINANCIAL",
  "MINUTES",
  "COMPLIANCE",
  "OTHER",
];

const categoryOptions = [
  { value: "", label: "All categories" },
  ...categoryOrder.map((c) => ({ value: c, label: categoryLabels[c] ?? c })),
];

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type DocumentItem = {
  id: string;
  title: string;
  category: string;
  schemeId: string;
  fileUrl: string;
  fileSize: number | null;
  createdAt: unknown;
};

export function DocumentList({
  documents,
  schemeNames,
  schemeTimeZones,
}: {
  documents: DocumentItem[];
  schemeNames: Record<string, string>;
  /** Each building's time zone, by scheme id, for upload dates. */
  schemeTimeZones: Record<string, string>;
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return documents.filter((doc) => {
      if (categoryFilter && doc.category !== categoryFilter) return false;
      if (q) {
        const scheme = (schemeNames[doc.schemeId] ?? "").toLowerCase();
        if (
          !doc.title.toLowerCase().includes(q) &&
          !scheme.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [documents, search, categoryFilter, schemeNames]);

  // Group by category
  const byCategory = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const doc of filtered) {
      const existing = map.get(doc.category) ?? [];
      existing.push(doc);
      map.set(doc.category, existing);
    }
    return map;
  }, [filtered]);

  const sortedCategories = categoryOrder.filter((c) => byCategory.has(c));

  return (
    <>
      <ListToolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search documents..."
          className="flex-1"
        />
        <FilterSelect
          label="Category"
          value={categoryFilter}
          onChange={setCategoryFilter}
          options={categoryOptions}
          className="sm:w-48"
        />
      </ListToolbar>

      {filtered.length === 0 ? (
        <Card>
          <div className="p-6 text-center">
            <p className="text-sm text-ink-muted">
              {documents.length === 0
                ? "No documents have been uploaded yet."
                : "No documents match your search."}
            </p>
          </div>
        </Card>
      ) : (
        sortedCategories.map((category) => {
          const docs = byCategory.get(category) ?? [];
          return (
            <Card key={category} className="mb-6">
              <CardHeader
                title={categoryLabels[category] ?? category}
                description={`${docs.length} document${docs.length === 1 ? "" : "s"}`}
              />
              <div className="flex flex-col gap-2">
                {docs.map((doc) => {
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-ink">
                          {doc.title}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {schemeNames[doc.schemeId] ?? ""}
                          {" · "}
                          {formatDateIn(schemeTimeZones[doc.schemeId] ?? PLATFORM_TIME_ZONE, String(doc.createdAt), {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                          {" · "}
                          {formatFileSize(doc.fileSize)}
                        </p>
                      </div>
                      {doc.fileUrl ? (
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-turquoise hover:text-turquoise transition-colors"
                        >
                          Download
                        </a>
                      ) : (
                        <span className="text-xs text-ink-muted">Unavailable</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })
      )}
    </>
  );
}
