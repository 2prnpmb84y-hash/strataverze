"use client";

import { useState, useMemo } from "react";
import { meetingZone } from "@/lib/jurisdiction/time-zone";
import { isOpenForVoting, isUpcomingMeeting, meetingStatusLabel, MEETING_STATUS_FILTER_OPTIONS } from "@/lib/meetings/lifecycle";
import { SearchInput } from "@/components/ui/search-input";
import { FilterSelect } from "@/components/ui/filter-select";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { VoteButtons } from "@/app/(portal)/owner/(scheme)/meetings/vote-buttons";

const meetingTypeLabels: Record<string, string> = {
  AGM: "AGM",
  SGM: "SGM",
  COMMITTEE: "Committee",
};

const motionStatusLabels: Record<string, string> = {
  DRAFT: "Draft",
  PROPOSED: "Proposed",
  PASSED: "Passed",
  DEFEATED: "Defeated",
  WITHDRAWN: "Withdrawn",
};

const statusOptions = [{ value: "", label: "All statuses" }, ...MEETING_STATUS_FILTER_OPTIONS];

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
  description: string | null;
  votes: { profileId: string; voteValue: string }[];
};

type MeetingItem = {
  id: string;
  title: string;
  status: string;
  meetingType: string;
  schemeId: string;
  scheduledAt: unknown;
  /** The meeting's time zone; its times are shown in it. */
  timezone?: string | null;
  location: string | null;
  motions: MotionItem[];
};

function getVoteTally(votes: { voteValue: string }[]) {
  const tally = { FOR: 0, AGAINST: 0, ABSTAIN: 0 };
  for (const v of votes) {
    if (v.voteValue in tally) {
      tally[v.voteValue as keyof typeof tally]++;
    }
  }
  return tally;
}

export function OwnerMeetingList({
  meetings,
  schemeNames,
  profileId,
}: {
  meetings: MeetingItem[];
  schemeNames: Record<string, string>;
  profileId: string;
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

  const now = new Date();
  const upcoming = filtered.filter((m) => isUpcomingMeeting(m.status, new Date(String(m.scheduledAt)), now));
  const past = filtered.filter((m) => !isUpcomingMeeting(m.status, new Date(String(m.scheduledAt)), now));

  function getUserVote(votes: { profileId: string; voteValue: string }[]) {
    const vote = votes.find((v) => v.profileId === profileId);
    return vote?.voteValue ?? null;
  }

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
            <p className="text-sm text-ink-muted">
              {meetings.length === 0
                ? "No meetings have been scheduled for your schemes yet."
                : "No meetings match your search."}
            </p>
          </div>
        </Card>
      ) : (
        <>
          {upcoming.length > 0 && (
            <Card className="mb-6">
              <CardHeader
                title="Upcoming"
                description={`${upcoming.length} upcoming meeting${upcoming.length === 1 ? "" : "s"}.`}
              />
              <div className="flex flex-col gap-2">
                {upcoming.map((meeting) => {
                  const scheduledDate = new Date(String(meeting.scheduledAt));
                  const meetingTz = meetingZone(meeting);

                  const typeAccent =
                    meeting.meetingType === "AGM"
                      ? "border-l-turquoise"
                      : meeting.meetingType === "SGM"
                        ? "border-l-amber-500"
                        : "border-l-blue-400";

                  return (
                    <div
                      key={meeting.id}
                      className={`rounded-[var(--radius-card)] bg-white border border-line border-l-4 ${typeAccent} px-4 py-3 shadow-sm`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-ink-muted tracking-wide uppercase">
                            {meetingTypeLabels[meeting.meetingType] ?? meeting.meetingType}
                          </span>
                          <p className="text-sm font-medium text-ink">
                            {meeting.title}
                          </p>
                        </div>
                        <StatusChip status={meetingStatusLabel(meeting.status)} />
                      </div>
                      <p className="text-xs text-ink-muted">
                        {schemeNames[meeting.schemeId] ?? ""}
                        {" · "}
                        {scheduledDate.toLocaleDateString("en-AU", { timeZone: meetingTz,
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {" at "}
                        {scheduledDate.toLocaleTimeString("en-AU", { timeZone: meetingTz,
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                      {meeting.location && (
                        <p className="text-xs text-ink-muted mt-1">
                          📍 {meeting.location}
                        </p>
                      )}

                      {meeting.motions.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs font-medium text-ink-muted uppercase tracking-wide">
                            Motions
                          </p>
                          {meeting.motions.map((motion) => {
                            const tally = getVoteTally(motion.votes);
                            const userVote = getUserVote(motion.votes);
                            const isProposed = motion.status === "PROPOSED" && isOpenForVoting(meeting.status);

                            return (
                              <div
                                key={motion.id}
                                className="rounded-[var(--radius-card)] bg-white border border-line p-3"
                              >
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <p className="text-sm font-medium text-ink">
                                    {motion.title}
                                  </p>
                                  <StatusChip status={motionStatusLabels[motion.status] ?? motion.status} />
                                </div>
                                {motion.description && (
                                  <p className="text-xs text-ink-muted mb-2">
                                    {motion.description}
                                  </p>
                                )}
                                {motion.votes.length > 0 && (
                                  <p className="text-xs text-ink-muted mb-2">
                                    {tally.FOR} For · {tally.AGAINST} Against ·{" "}
                                    {tally.ABSTAIN} Abstain
                                  </p>
                                )}
                                {isProposed && (
                                  <VoteButtons
                                    motionId={motion.id}
                                    currentVote={userVote}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {past.length > 0 && (
            <Card>
              <CardHeader
                title="Past Meetings"
                description={`${past.length} previous meeting${past.length === 1 ? "" : "s"}.`}
              />
              <div className="flex flex-col gap-2">
                {past.map((meeting) => {
                  const scheduledDate = new Date(String(meeting.scheduledAt));
                  const meetingTz = meetingZone(meeting);

                  const typeAccent =
                    meeting.meetingType === "AGM"
                      ? "border-l-turquoise"
                      : meeting.meetingType === "SGM"
                        ? "border-l-amber-500"
                        : "border-l-blue-400";

                  return (
                    <div
                      key={meeting.id}
                      className={`rounded-[var(--radius-card)] bg-white border border-line border-l-4 ${typeAccent} px-4 py-3 shadow-sm opacity-75`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-ink-muted tracking-wide uppercase">
                            {meetingTypeLabels[meeting.meetingType] ?? meeting.meetingType}
                          </span>
                          <p className="text-sm font-medium text-ink">
                            {meeting.title}
                          </p>
                        </div>
                        <StatusChip status={meetingStatusLabel(meeting.status)} />
                      </div>
                      <p className="text-xs text-ink-muted">
                        {schemeNames[meeting.schemeId] ?? ""}
                        {" · "}
                        {scheduledDate.toLocaleDateString("en-AU", { timeZone: meetingTz,
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>

                      {meeting.motions.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs font-medium text-ink-muted uppercase tracking-wide">
                            Motions
                          </p>
                          {meeting.motions.map((motion) => {
                            const tally = getVoteTally(motion.votes);

                            return (
                              <div
                                key={motion.id}
                                className="rounded-[var(--radius-card)] bg-white border border-line p-3"
                              >
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <p className="text-sm font-medium text-ink">
                                    {motion.title}
                                  </p>
                                  <StatusChip status={motionStatusLabels[motion.status] ?? motion.status} />
                                </div>
                                {motion.votes.length > 0 && (
                                  <p className="text-xs text-ink-muted">
                                    {tally.FOR} For · {tally.AGAINST} Against ·{" "}
                                    {tally.ABSTAIN} Abstain
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
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
