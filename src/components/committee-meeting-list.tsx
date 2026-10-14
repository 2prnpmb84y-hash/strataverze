"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { SearchInput } from "@/components/ui/search-input";
import { FilterSelect } from "@/components/ui/filter-select";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Card, CardHeader } from "@/components/ui/card";

const meetingTypeLabels: Record<string, string> = {
  AGM: "AGM",
  SGM: "SGM",
  COMMITTEE: "Committee",
};

const statusStyle: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-700",
};

const motionStatusStyle: Record<string, string> = {
  PROPOSED: "bg-blue-100 text-blue-700",
  PASSED: "bg-green-100 text-green-700",
  DEFEATED: "bg-red-100 text-red-700",
  WITHDRAWN: "bg-gray-100 text-gray-700",
};

const statusOptions = [
  { value: "", label: "All statuses" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

const typeOptions = [
  { value: "", label: "All types" },
  { value: "AGM", label: "AGM" },
  { value: "SGM", label: "SGM" },
  { value: "COMMITTEE", label: "Committee" },
];

type MotionItem = {
  id: string;
  title: string;
  status: string;
};

type MeetingItem = {
  id: string;
  title: string;
  status: string;
  meetingType: string;
  schemeId: string;
  scheduledAt: unknown;
  location: string | null;
  motions: MotionItem[];
};

export function CommitteeMeetingList({
  meetings,
  schemeNames,
}: {
  meetings: MeetingItem[];
  schemeNames: Record<string, string>;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return meetings.filter((m) => {
      if (statusFilter && m.status !== statusFilter) return false;
      if (typeFilter && m.meetingType !== typeFilter) return false;
      if (q) {
        const scheme = (schemeNames[m.schemeId] ?? "").toLowerCase();
        if (
          !m.title.toLowerCase().includes(q) &&
          !scheme.includes(q) &&
          !(m.location ?? "").toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [meetings, search, statusFilter, typeFilter, schemeNames]);

  const scheduled = filtered.filter((m) => m.status === "SCHEDULED");
  const completed = filtered.filter(
    (m) => m.status === "COMPLETED" || m.status === "CANCELLED",
  );

  return (
    <>
      <ListToolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search meetings..."
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
          label="Type"
          value={typeFilter}
          onChange={setTypeFilter}
          options={typeOptions}
          className="sm:w-40"
        />
      </ListToolbar>

      {filtered.length === 0 ? (
        <Card>
          <div className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {meetings.length === 0
                ? "No meetings have been scheduled for your schemes yet."
                : "No meetings match your search."}
            </p>
          </div>
        </Card>
      ) : (
        <>
          {scheduled.length > 0 && (
            <Card className="mb-6">
              <CardHeader
                title="Upcoming Meetings"
                description={`${scheduled.length} meeting${scheduled.length === 1 ? "" : "s"} scheduled.`}
              />
              <div className="flex flex-col gap-2">
                {scheduled.map((meeting) => {
                  const scheduledDate = new Date(String(meeting.scheduledAt));
                  const pendingCount = meeting.motions.filter(
                    (mo) => mo.status === "PROPOSED",
                  ).length;

                  return (
                    <div
                      key={meeting.id}
                      className="rounded-lg bg-muted px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <Link
                          href={`/committee/governance/${meeting.id}`}
                          className="text-sm font-medium text-foreground hover:text-primary-600 transition-colors"
                        >
                          {meeting.title}
                        </Link>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[meeting.status]}`}
                        >
                          {meeting.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {schemeNames[meeting.schemeId] ?? ""}
                        {" · "}
                        {meetingTypeLabels[meeting.meetingType] ??
                          meeting.meetingType}
                        {" · "}
                        {scheduledDate.toLocaleDateString("en-AU", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {" at "}
                        {scheduledDate.toLocaleTimeString("en-AU", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                      {meeting.motions.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {meeting.motions.map((motion) => (
                            <span
                              key={motion.id}
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${motionStatusStyle[motion.status] ?? "bg-gray-100 text-gray-700"}`}
                            >
                              {motion.title.length > 30
                                ? `${motion.title.slice(0, 30)}...`
                                : motion.title}
                            </span>
                          ))}
                        </div>
                      )}
                      {pendingCount > 0 && (
                        <p className="text-xs text-yellow-600 mt-1">
                          {pendingCount} motion{pendingCount === 1 ? "" : "s"}{" "}
                          awaiting vote
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
                title="Past Meetings"
                description={`${completed.length} meeting${completed.length === 1 ? "" : "s"} completed.`}
              />
              <div className="flex flex-col gap-2">
                {completed.map((meeting) => {
                  const scheduledDate = new Date(String(meeting.scheduledAt));
                  const passed = meeting.motions.filter(
                    (mo) => mo.status === "PASSED",
                  ).length;
                  const defeated = meeting.motions.filter(
                    (mo) => mo.status === "DEFEATED",
                  ).length;

                  return (
                    <div
                      key={meeting.id}
                      className="flex items-center justify-between rounded-lg bg-muted px-4 py-3"
                    >
                      <div>
                        <Link
                          href={`/committee/governance/${meeting.id}`}
                          className="text-sm font-medium text-foreground hover:text-primary-600 transition-colors"
                        >
                          {meeting.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {schemeNames[meeting.schemeId] ?? ""}
                          {" · "}
                          {scheduledDate.toLocaleDateString("en-AU", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                          {meeting.motions.length > 0 &&
                            ` · ${passed} passed, ${defeated} defeated`}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[meeting.status] ?? "bg-gray-100 text-gray-700"}`}
                      >
                        {meeting.status.charAt(0) +
                          meeting.status.slice(1).toLowerCase()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}
