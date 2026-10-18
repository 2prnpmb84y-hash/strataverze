"use client";

import { useState, useTransition, useActionState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField, SelectField } from "@/components/ui/form-field";
import {
  createMotionAction,
  updateMotionStatusAction,
  deleteMotionAction,
  castVoteAction,
  type MotionFormState,
} from "../actions";

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
    profile: { firstName: string; lastName: string; email: string };
  }[];
};

export function MotionSection({
  schemeId,
  meetingId,
  motions,
  meetingStatus,
  currentProfileId,
}: {
  schemeId: string;
  meetingId: string;
  motions: Motion[];
  meetingStatus: string;
  currentProfileId: string;
}) {
  const [showForm, setShowForm] = useState(false);

  const createAction = createMotionAction.bind(null, schemeId, meetingId);
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
              Add Motion
            </Button>
          ) : undefined
        }
      />

      {/* New motion form */}
      {showForm && meetingStatus === "SCHEDULED" && (
        <div className="rounded-lg border border-border p-4 mb-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">
            New Motion
          </h3>
          <form action={formAction} className="space-y-3">
            {formState.error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
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
                className="block text-sm font-medium text-foreground mb-1.5"
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
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-colors resize-y"
              />
              {formState.fieldErrors?.description && (
                <p className="mt-1.5 text-xs text-red-500">
                  {formState.fieldErrors.description}
                </p>
              )}
            </div>

            <SelectField
              label="Resolution Type"
              name="motionType"
              required
              defaultValue="ORDINARY"
              options={[
                { value: "ORDINARY", label: "Ordinary Resolution" },
                { value: "SPECIAL", label: "Special Resolution (75%)" },
                { value: "UNANIMOUS", label: "Unanimous Resolution" },
              ]}
              error={formState.fieldErrors?.motionType}
            />

            <div className="flex gap-2">
              <Button type="submit" disabled={isCreating}>
                {isCreating ? "Adding..." : "Add Motion"}
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
              schemeId={schemeId}
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
  schemeId,
  meetingId,
  meetingStatus,
  currentProfileId: _currentProfileId,
  motionTypeLabels,
  statusStyle,
}: {
  motion: Motion;
  schemeId: string;
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

  function handleStatusChange(status: string, outcome?: string) {
    startTransition(async () => {
      await updateMotionStatusAction(
        schemeId,
        meetingId,
        motion.id,
        status,
        outcome,
      );
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteMotionAction(schemeId, meetingId, motion.id);
    });
  }

  function handleVote(value: string) {
    startTransition(async () => {
      await castVoteAction(schemeId, meetingId, motion.id, value);
    });
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {motion.title}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
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

      <p className="text-sm text-foreground mb-3 whitespace-pre-wrap">
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
        <p className="text-xs text-muted-foreground mb-3">
          Outcome: {motion.outcome}
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {/* Vote buttons (when motion is open) */}
        {motion.status === "OPEN" && (
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

        {/* Status transitions */}
        {motion.status === "DRAFT" && meetingStatus === "SCHEDULED" && (
          <button
            type="button"
            onClick={() => handleStatusChange("OPEN")}
            disabled={isPending}
            className="text-xs font-medium text-primary-500 hover:text-primary-600 transition-colors disabled:opacity-50"
          >
            Open for Voting
          </button>
        )}
        {motion.status === "OPEN" && (
          <>
            <button
              type="button"
              onClick={() => handleStatusChange("CARRIED", "Motion carried")}
              disabled={isPending}
              className="text-xs font-medium text-primary-500 hover:text-primary-600 transition-colors disabled:opacity-50"
            >
              Mark Carried
            </button>
            <button
              type="button"
              onClick={() =>
                handleStatusChange("DEFEATED", "Motion defeated")
              }
              disabled={isPending}
              className="text-xs font-medium text-red-500 hover:text-red-600 transition-colors disabled:opacity-50"
            >
              Mark Defeated
            </button>
          </>
        )}
        {(motion.status === "DRAFT" || motion.status === "OPEN") &&
          meetingStatus === "SCHEDULED" && (
            <button
              type="button"
              onClick={() => handleStatusChange("WITHDRAWN")}
              disabled={isPending}
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              Withdraw
            </button>
          )}
        {motion.status === "DRAFT" && meetingStatus === "SCHEDULED" && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="text-xs font-medium text-red-500 hover:text-red-600 transition-colors disabled:opacity-50"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
