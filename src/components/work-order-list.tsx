"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { SearchInput } from "@/components/ui/search-input";
import { FilterSelect } from "@/components/ui/filter-select";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Card, CardHeader } from "@/components/ui/card";

const priorityStyle: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-700",
  MEDIUM: "bg-blue-100 text-blue-700",
  HIGH: "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700",
};

const statusStyle: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-yellow-100 text-yellow-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-700",
};

const statusOptions = [
  { value: "", label: "All statuses" },
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

const priorityOptions = [
  { value: "", label: "All priorities" },
  { value: "URGENT", label: "Urgent" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

type WorkOrderItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  schemeId: string;
  assignedTo: string | null;
  actualCost: unknown;
  raisedBy: { firstName: string; lastName: string; email: string };
  comments: { id: string }[];
};

export function WorkOrderList({
  workOrders,
  schemeNames,
  basePath,
}: {
  workOrders: WorkOrderItem[];
  schemeNames: Record<string, string>;
  basePath: string;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return workOrders.filter((wo) => {
      if (statusFilter && wo.status !== statusFilter) return false;
      if (priorityFilter && wo.priority !== priorityFilter) return false;
      if (q) {
        const name =
          `${wo.raisedBy.firstName} ${wo.raisedBy.lastName}`.trim().toLowerCase();
        const scheme = (schemeNames[wo.schemeId] ?? "").toLowerCase();
        if (
          !wo.title.toLowerCase().includes(q) &&
          !name.includes(q) &&
          !scheme.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [workOrders, search, statusFilter, priorityFilter, schemeNames]);

  const active = filtered.filter(
    (wo) => wo.status === "OPEN" || wo.status === "IN_PROGRESS",
  );
  const completed = filtered.filter(
    (wo) => wo.status === "COMPLETED" || wo.status === "CANCELLED",
  );

  return (
    <>
      <ListToolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search work orders..."
          className="flex-1"
        />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={statusOptions}
          className="sm:w-40"
        />
        <FilterSelect
          label="Priority"
          value={priorityFilter}
          onChange={setPriorityFilter}
          options={priorityOptions}
          className="sm:w-40"
        />
      </ListToolbar>

      {filtered.length === 0 ? (
        <Card>
          <div className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {workOrders.length === 0
                ? "No work orders have been raised yet."
                : "No work orders match your search."}
            </p>
          </div>
        </Card>
      ) : (
        <>
          {active.length > 0 && (
            <Card className="mb-6">
              <CardHeader
                title="Active"
                description={`${active.length} request${active.length === 1 ? "" : "s"} in progress.`}
              />
              <div className="flex flex-col gap-2">
                {active.map((wo) => {
                  const raisedByName =
                    `${wo.raisedBy.firstName} ${wo.raisedBy.lastName}`.trim() ||
                    wo.raisedBy.email;

                  return (
                    <div
                      key={wo.id}
                      className="rounded-lg bg-muted px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <Link
                          href={`${basePath}/${wo.id}`}
                          className="text-sm font-medium text-foreground hover:text-primary-600 transition-colors"
                        >
                          {wo.title}
                        </Link>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityStyle[wo.priority]}`}
                          >
                            {wo.priority}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[wo.status]}`}
                          >
                            {wo.status.replace("_", " ")}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {schemeNames[wo.schemeId] ?? ""}
                        {" · Raised by "}
                        {raisedByName}
                        {wo.assignedTo && ` · Assigned to ${wo.assignedTo}`}
                      </p>
                      {wo.comments.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {wo.comments.length} comment
                          {wo.comments.length === 1 ? "" : "s"}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {completed.length > 0 && (
            <Card>
              <CardHeader
                title="Completed"
                description={`${completed.length} request${completed.length === 1 ? "" : "s"} resolved.`}
              />
              <div className="flex flex-col gap-2">
                {completed.map((wo) => (
                  <div
                    key={wo.id}
                    className="flex items-center justify-between rounded-lg bg-muted px-4 py-3"
                  >
                    <div>
                      <Link
                        href={`${basePath}/${wo.id}`}
                        className="text-sm font-medium text-foreground hover:text-primary-600 transition-colors"
                      >
                        {wo.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {schemeNames[wo.schemeId] ?? ""}
                        {wo.actualCost
                          ? ` · $${Number(wo.actualCost).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`
                          : null}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[wo.status] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {wo.status.replace("_", " ")}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}
