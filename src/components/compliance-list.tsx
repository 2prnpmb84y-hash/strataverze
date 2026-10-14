"use client";

import { useState, useMemo } from "react";
import { SearchInput } from "@/components/ui/search-input";
import { FilterSelect } from "@/components/ui/filter-select";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Card, CardHeader } from "@/components/ui/card";

const statusStyle: Record<string, string> = {
  COMPLIANT: "bg-green-100 text-green-700",
  NON_COMPLIANT: "bg-red-100 text-red-700",
  EXPIRED: "bg-gray-100 text-gray-700",
  PENDING_REVIEW: "bg-yellow-100 text-yellow-700",
};

const statusLabel: Record<string, string> = {
  COMPLIANT: "Compliant",
  NON_COMPLIANT: "Non-Compliant",
  EXPIRED: "Expired",
  PENDING_REVIEW: "Pending Review",
};

const categoryLabels: Record<string, string> = {
  INSURANCE: "Insurance",
  FIRE_SAFETY: "Fire Safety",
  ELECTRICAL: "Electrical",
  ELEVATOR: "Elevator",
  POOL: "Pool",
  WHS: "WH&S",
  OTHER: "Other",
};

const statusOptions = [
  { value: "", label: "All statuses" },
  { value: "NON_COMPLIANT", label: "Non-Compliant" },
  { value: "EXPIRED", label: "Expired" },
  { value: "PENDING_REVIEW", label: "Pending Review" },
  { value: "COMPLIANT", label: "Compliant" },
];

const categoryOptions = [
  { value: "", label: "All categories" },
  { value: "INSURANCE", label: "Insurance" },
  { value: "FIRE_SAFETY", label: "Fire Safety" },
  { value: "ELECTRICAL", label: "Electrical" },
  { value: "ELEVATOR", label: "Elevator" },
  { value: "POOL", label: "Pool" },
  { value: "WHS", label: "WH&S" },
  { value: "OTHER", label: "Other" },
];

type ComplianceItem = {
  id: string;
  title: string;
  status: string;
  category: string;
  schemeId: string;
  dueDate: unknown;
  lastChecked: unknown;
  scheme?: { name: string } | null;
};

export function ComplianceList({
  items,
  schemeNames,
}: {
  items: ComplianceItem[];
  schemeNames: Record<string, string>;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (categoryFilter && item.category !== categoryFilter) return false;
      if (q) {
        const scheme = (
          schemeNames[item.schemeId] ?? item.scheme?.name ?? ""
        ).toLowerCase();
        if (
          !item.title.toLowerCase().includes(q) &&
          !scheme.includes(q) &&
          !(categoryLabels[item.category] ?? item.category)
            .toLowerCase()
            .includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [items, search, statusFilter, categoryFilter, schemeNames]);

  const needsAttention = filtered.filter(
    (i) => i.status === "NON_COMPLIANT" || i.status === "EXPIRED",
  );
  const pendingItems = filtered.filter((i) => i.status === "PENDING_REVIEW");
  const compliantItems = filtered.filter((i) => i.status === "COMPLIANT");

  function renderItem(item: ComplianceItem) {
    return (
      <div
        key={item.id}
        className="flex items-center justify-between rounded-lg bg-muted px-4 py-3"
      >
        <div>
          <p className="text-sm font-medium text-foreground">{item.title}</p>
          <p className="text-xs text-muted-foreground">
            {schemeNames[item.schemeId] ?? item.scheme?.name ?? ""}
            {" · "}
            {categoryLabels[item.category] ?? item.category}
            {item.dueDate
              ? ` · Due ${new Date(String(item.dueDate)).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`
              : null}
            {!item.dueDate && item.lastChecked
              ? ` · Checked ${new Date(String(item.lastChecked)).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`
              : null}
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[item.status] ?? "bg-gray-100 text-gray-700"}`}
        >
          {statusLabel[item.status] ?? item.status.replace("_", " ")}
        </span>
      </div>
    );
  }

  return (
    <>
      <ListToolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search compliance items..."
          className="flex-1"
        />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={statusOptions}
          className="sm:w-44"
        />
        <FilterSelect
          label="Category"
          value={categoryFilter}
          onChange={setCategoryFilter}
          options={categoryOptions}
          className="sm:w-40"
        />
      </ListToolbar>

      {filtered.length === 0 ? (
        <Card>
          <div className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {items.length === 0
                ? "No compliance items are being tracked yet."
                : "No compliance items match your search."}
            </p>
          </div>
        </Card>
      ) : (
        <>
          {needsAttention.length > 0 && (
            <Card className="mb-6 border-red-200">
              <CardHeader
                title="Needs Attention"
                description={`${needsAttention.length} item${needsAttention.length === 1 ? "" : "s"} require${needsAttention.length === 1 ? "s" : ""} action.`}
              />
              <div className="flex flex-col gap-2">
                {needsAttention.map(renderItem)}
              </div>
            </Card>
          )}

          {pendingItems.length > 0 && (
            <Card className="mb-6">
              <CardHeader
                title="Pending Review"
                description={`${pendingItems.length} item${pendingItems.length === 1 ? "" : "s"} awaiting review.`}
              />
              <div className="flex flex-col gap-2">
                {pendingItems.map(renderItem)}
              </div>
            </Card>
          )}

          {compliantItems.length > 0 && (
            <Card>
              <CardHeader
                title="Compliant"
                description={`${compliantItems.length} item${compliantItems.length === 1 ? "" : "s"} up to date.`}
              />
              <div className="flex flex-col gap-2">
                {compliantItems.map(renderItem)}
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}
