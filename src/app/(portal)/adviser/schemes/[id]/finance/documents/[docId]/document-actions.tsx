"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import {
  reviewDocumentAction,
  updateDocumentVerificationAction,
} from "../../actions";

export function DocumentActions({
  schemeId,
  documentId,
  currentStatus,
  currentVerification,
}: {
  schemeId: string;
  documentId: string;
  currentStatus: string;
  currentVerification: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  function handleReview(newStatus: string) {
    setError(null);
    startTransition(async () => {
      const result = await reviewDocumentAction(schemeId, documentId, {
        documentStatus: newStatus,
        reviewNotes: reviewNotes || undefined,
      });
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  function handleVerify(newStatus: string) {
    setError(null);
    startTransition(async () => {
      const result = await updateDocumentVerificationAction(
        schemeId,
        documentId,
        newStatus,
      );
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <>
      {/* Review actions */}
      <Card>
        <CardHeader
          title="Review"
          description="Review this document and update its status."
        />
        <div className="px-6 pb-6 space-y-4">
          {error && (
            <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="reviewNotes"
              className="block text-sm font-medium text-ink mb-1.5"
            >
              Review Notes
            </label>
            <textarea
              id="reviewNotes"
              name="reviewNotes"
              placeholder="Optional notes about this document..."
              rows={3}
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors resize-y"
            />
            <p className="mt-1.5 text-xs text-ink-muted">
              Add notes before approving or rejecting.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {currentStatus !== "REVIEWED" && (
              <Button
                variant="primary"
                disabled={isPending}
                onClick={() => handleReview("REVIEWED")}
              >
                {isPending ? "Saving..." : "Approve"}
              </Button>
            )}
            {currentStatus !== "REJECTED" && (
              <Button
                variant="danger"
                disabled={isPending}
                onClick={() => handleReview("REJECTED")}
              >
                {isPending ? "Saving..." : "Reject"}
              </Button>
            )}
            {currentStatus !== "ARCHIVED" && currentStatus !== "UPLOADED" && (
              <Button
                variant="secondary"
                disabled={isPending}
                onClick={() => handleReview("ARCHIVED")}
              >
                {isPending ? "Saving..." : "Archive"}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Verification actions */}
      <Card>
        <CardHeader
          title="Verification"
          description="Update the verification status of this document."
        />
        <div className="px-6 pb-6">
          <div className="flex flex-col gap-2">
            {currentVerification !== "VERIFIED" && (
              <Button
                variant="primary"
                disabled={isPending}
                onClick={() => handleVerify("VERIFIED")}
              >
                {isPending ? "Saving..." : "Mark Verified"}
              </Button>
            )}
            {currentVerification !== "FLAGGED" && (
              <Button
                variant="danger"
                disabled={isPending}
                onClick={() => handleVerify("FLAGGED")}
              >
                {isPending ? "Saving..." : "Flag for Review"}
              </Button>
            )}
            {currentVerification !== "PENDING" &&
              currentVerification !== "VERIFIED" && (
                <Button
                  variant="secondary"
                  disabled={isPending}
                  onClick={() => handleVerify("PENDING")}
                >
                  {isPending ? "Saving..." : "Reset to Pending"}
                </Button>
              )}
          </div>
        </div>
      </Card>
    </>
  );
}
