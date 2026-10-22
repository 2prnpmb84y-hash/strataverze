"use client";

import { useState, useTransition, useActionState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import {
  createCommitteeMotionAction,
  castCommitteeVoteAction,
  type MotionFormState,
} from "./actions";

type Motion = {
  id: string;
  title: string;
  description: string;
  motionType: string;
  status: string;
  outcome: string | null;
  raisedBy: { firstName: string; lastName: string; email: string };
  votes: {
    id: string;
    voteValue: string;
    profile: { firstName: string; lastName: string; email: string; id: string };
  }[];
};

export function MotionSection({
  meetingId,
  motions,
  meetingStatus,
  currentProfileId,
}: {
  meetingId: string;
  motions: Motion[];
  meetingStatus: string;
  currentProfileId: string;
}) {
  const [showForm, setShowForm] = useState(false);

  const createAction = createCommitteeMotionAction.bind(null, meetingId);
  const [formState, formAction, isCreating] = useActionState<
    MotionFormState,
    FormData
  >(createAction, {});

  const motionTypeLabels: Record<string, string> = {
    ORDINARY: "Ordinary Resolution",
    SPECIAL: "Special Resolution",
    UNANIMOUS: "Unanimous Resolution",
  };

  const statusStyle: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-700",
    OPEN: "bg-blue-100 text-blue-700",
    CARRIED: "bg-green-100 text-green-700",
    DEFEATED: "bg-red-100 text-red-700",
    WITHDRAWN: "bg-yellow-100 text-yellow-700",
    PROPOSED: "bg-blue-100 text-blue-700",
    PASSED: "bg-green-100 text-green-700",
  };

  return (
    <Card className="mb-6">
      <CardHeader
        title="Motions"
        description={
          motions.length === 0
            ? "No motions have been added yet."
            : `${motions.length} motion${motions.length === 1 ? "" : "s"} on the agenda.`
        }
        action={
          meetingStatus === "SCHEDULED" && !showForm ? (
            <Button variant="secondary" onClick={() => setShowForm(true)}>
              Create Motion
            </Button>
          ) : undefined
        }
      />

      {/* New motion form */}
      {showForm && meetingStatus === "SCHEDULED" && (
        <div className="rounded-[var(--radius-card)] border border-line p-4 mb-4">
          <h3 className="text-sm font-semibold text-ink mb-3">
            New Motion
          </h3>
          <form action={formAction} className="space-y-3">
            {formState.error && (
              <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {formState.error}
              </div>
            )}

            <FormField
              label="Motion Title"
              name="title"
              required
              placeholder="e.g. Approve Annual Budget"
              error={formState.fieldErrors?.title}
            />

            <div>
              <label
                htmlFor="motionDescription"
                className="block text-sm font-medium text-ink mb-1.5"
              >
                Description
                <span className="text-red-500 ml-0.5">*</span>
              </label>
              <textarea
                id="motionDescription"
                name="description"
                rows={3}
                required
                placeholder="Details of the motion..."
                className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors resize-y"
              />
              {formState.fieldErrors?.description && (
                <p className="mt-1.5 text-xs text-red-500">
                  {formState.fieldErrors.description}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={isCreating}>
                {isCreating ? "Creating..." : "Create Motion"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Motions list */}
      {motions.length > 0 && (
        <div className="flex flex-col gap-3">
          {motions.map((motion) => (
            <MotionItem
              key={motion.id}
              motion={motion}
              meetingId={meetingId}
              meetingStatus={meetingStatus}
              currentProfileId={currentProfileId}
              motionTypeLabels={motionTypeLabels}
              statusStyle={statusStyle}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function MotionItem({
  motion,
  meetingId,
  meetingStatus,
  currentProfileId,
  motionTypeLabels,
  statusStyle,
}: {
  motion: Motion;
  meetingId: string;
  meetingStatus: string;
  currentProfileId: string;
  motionTypeLabels: Record<string, string>;
  statusStyle: Record<string, string>;
}) {
  const [isPending, startTransition] = useTransition();

  const forCount = motion.votes.filter((v) => v.voteValue === "FOR").length;
  const againstCount = motion.votes.filter(
    (v) => v.voteValue === "AGAINST",
  ).length;
  const abstainCount = motion.votes.filter(
    (v) => v.voteValue === "ABSTAIN",
  ).length;

  const userVote = motion.votes.find(
    (v) => v.profile.id === currentProfileId,
  );

  function handleVote(value: string) {
    startTransition(async () => {
      await castCommitteeVoteAction(meetingId, motion.id, value);
    });
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-line p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">
            {motion.title}
          </h3>
          <p className="text-xs text-ink-muted mt-0.5">
            {motionTypeLabels[motion.motionType] ?? motion.motionType} · Raised
            by{" "}
            {`${motion.raisedBy.firstName} ${motion.raisedBy.lastName}`.trim() ||
              motion.raisedBy.email}
          </p>
        </div>
        <span
          className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[motion.status] ?? "bg-gray-100 text-gray-700"}`}
        >
          {motion.status.charAt(0) + motion.status.slice(1).toLowerCase()}
        </span>
      </div>

      <p className="text-sm text-ink mb-3 whitespace-pre-wrap">
        {motion.description}
      </p>

      {/* Vote tallies */}
      {motion.votes.length > 0 && (
        <div className="flex gap-4 mb-3">
          <span className="text-xs font-medium text-green-600">
            For: {forCount}
          </span>
          <span className="text-xs font-medium text-red-600">
            Against: {againstCount}
          </span>
          <span className="text-xs font-medium text-gray-500">
            Abstain: {abstainCount}
          </span>
        </div>
      )}

      {motion.outcome && (
        <p className="text-xs text-ink-muted mb-3">
          Outcome: {motion.outcome}
        </p>
      )}

      {/* Vote buttons or voted indicator */}
      {motion.status === "OPEN" && meetingStatus === "SCHEDULED" && (
        <div className="flex flex-wrap gap-2">
          {userVote ? (
            <span className="text-xs font-medium text-ink-muted">
              You voted: {userVote.voteValue}
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={() => handleVote("FOR")}
                disabled={isPending}
                className="text-xs font-medium text-green-600 hover:text-green-700 transition-colors disabled:opacity-50"
              >
                Vote For
              </button>
              <button
                type="button"
                onClick={() => handleVote("AGAINST")}
                disabled={isPending}
                className="text-xs font-medium text-red-600 hover:text-red-700 transition-colors disabled:opacity-50"
              >
                Vote Against
              </button>
              <button
                type="button"
                onClick={() => handleVote("ABSTAIN")}
                disabled={isPending}
                className="text-xs font-medium text-gray-500 hover:text-gray-600 transition-colors disabled:opacity-50"
              >
                Abstain
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
