"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { issueNoticeAction } from "./notice-actions";
import { FeeDisclosure, useFeeConfirmation } from "@/components/billing/fee-disclosure";
import type { FeeView } from "@/lib/billing/disclosure";

export interface NoticeRecipientView {
  name: string | null;
  email: string | null;
  deliveryOutcome: string;
}

export interface NoticeView {
  id: string;
  version: number;
  status: string;
  issuedAt: string;
  compliant: boolean;
  recipients: NoticeRecipientView[];
}

export function NoticeSection({
  schemeId,
  meetingId,
  canIssue,
  agendaItemCount,
  recipientCount,
  noticePeriod,
  notices,
  fee = null,
  timeZone,
}: {
  /** The meeting's time zone. */
  timeZone: string;
  schemeId: string;
  meetingId: string;
  canIssue: boolean;
  agendaItemCount: number;
  recipientCount: number;
  noticePeriod: { requiredDays: number | null; actualDays: number; compliant: boolean } | null;
  notices: NoticeView[];
  /** The StrataVerze fee issuing this notice will attract, if any. */
  fee?: FeeView | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const feeConfirmation = useFeeConfirmation(fee);
  const disclosure = (
    <FeeDisclosure
      fee={fee}
      scheduleHref={`/adviser/schemes/${schemeId}/finance/platform-fees#fee-schedule`}
      confirmed={feeConfirmation.confirmed}
      onConfirmedChange={feeConfirmation.setConfirmed}
      idSuffix={`-${meetingId}`}
    />
  );

  function issue() {
    setError(null);
    start(async () => {
      const result = await issueNoticeAction(schemeId, meetingId, feeConfirmation.confirmedCents);
      if (result?.error) setError(result.error);
    });
  }

  const current = notices[0];

  return (
    <Card className="mb-6">
      <CardHeader
        title="Notice"
        description="Issue the meeting notice to owners and record delivery."
      />

      {error && (
        <div className="mb-4 rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {notices.length === 0 ? (
        <div className="space-y-4">
          {agendaItemCount === 0 ? (
            <p className="text-sm text-ink-muted">
              Add agenda items before issuing the notice.
            </p>
          ) : (
            <>
              {noticePeriod && noticePeriod.requiredDays != null && (
                <div
                  className={`rounded-[var(--radius-card)] px-4 py-2.5 text-xs ${
                    noticePeriod.compliant
                      ? "bg-turquoise/5 border border-turquoise/20 text-ink-muted"
                      : "bg-amber-50 border border-amber-200 text-amber-800"
                  }`}
                >
                  {noticePeriod.compliant
                    ? `The meeting is ${noticePeriod.actualDays} days away, which meets the ${noticePeriod.requiredDays}-day notice period.`
                    : `The meeting is only ${noticePeriod.actualDays} days away, short of the ${noticePeriod.requiredDays}-day notice period. You can still issue, but the notice will be flagged as short.`}
                </div>
              )}
              <p className="text-sm text-ink-muted">
                The notice will be issued to <strong>{recipientCount}</strong>{" "}
                recipient{recipientCount === 1 ? "" : "s"} from the scheme roll.
              </p>
              {canIssue && disclosure}
              <Button type="button" disabled={!canIssue || pending || !feeConfirmation.ready} onClick={issue}>
                {pending ? "Issuing..." : "Issue notice"}
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-ink">
              Version {current.version} issued{" "}
              {new Date(current.issuedAt).toLocaleDateString("en-AU", {
                timeZone,
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
            <span
              className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${
                current.compliant
                  ? "bg-green-100 text-green-700"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {current.compliant ? "Notice period met" : "Short notice"}
            </span>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2">
              Delivery ({current.recipients.length})
            </h4>
            <ul className="space-y-1.5 max-h-56 overflow-y-auto">
              {current.recipients.map((r, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between text-sm border-b border-line/60 pb-1.5"
                >
                  <span className="text-ink">{r.name || r.email || "Recipient"}</span>
                  <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-turquoise/10 text-turquoise-700">
                    {r.deliveryOutcome}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {canIssue && disclosure}
          <Button
            type="button"
            variant="secondary"
            disabled={!canIssue || pending || !feeConfirmation.ready}
            onClick={issue}
          >
            {pending ? "Re-issuing..." : "Issue revised notice"}
          </Button>
        </div>
      )}
    </Card>
  );
}
