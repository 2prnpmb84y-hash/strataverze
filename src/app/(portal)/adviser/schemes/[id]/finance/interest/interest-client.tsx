"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  chargeInterestAction,
  chargeInterestBatchAction,
} from "../actions";

type NoticeRow = {
  id: string;
  noticeNumber: string;
  lotNumber: string;
  fundName: string;
  dueDate: string;
  balanceOutstanding: number;
  daysOverdue: number;
  calculatedInterest: number;
  previouslyCharged: number;
  additionalInterest: number;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(value);
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function InterestClient({
  schemeId,
  notices,
  annualRate,
}: {
  schemeId: string;
  notices: NoticeRow[];
  annualRate: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const chargeableNotices = notices.filter((n) => n.additionalInterest > 0);
  const totalAdditional = chargeableNotices.reduce(
    (sum, n) => sum + n.additionalInterest,
    0,
  );
  const totalPreviouslyCharged = notices.reduce(
    (sum, n) => sum + n.previouslyCharged,
    0,
  );

  function handleChargeSingle(noticeId: string, amount: number) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await chargeInterestAction(schemeId, noticeId, amount);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess("Interest charged successfully.");
        router.refresh();
      }
    });
  }

  function handleChargeAll() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await chargeInterestBatchAction(schemeId);
      if (result.error) {
        setError(result.error);
      } else {
        const charged = (result.data?.charged as number) ?? 0;
        setSuccess(
          `Interest charged on ${charged} notice${charged !== 1 ? "s" : ""}.`,
        );
        router.refresh();
      }
    });
  }

  if (annualRate <= 0) {
    return (
      <EmptyState
        icon={
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        }
        title="No interest rate configured"
        description="Set an annual interest rate in scheme settings before charging interest on overdue levies."
      />
    );
  }

  if (notices.length === 0) {
    return (
      <EmptyState
        icon={
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        }
        title="No overdue levies"
        description="There are no overdue levy notices to charge interest on."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="text-ink-muted">
          {notices.length} overdue notice{notices.length !== 1 ? "s" : ""}
        </span>
        <span className="text-ink-muted">
          Previously charged: {formatCurrency(totalPreviouslyCharged)}
        </span>
        {chargeableNotices.length > 0 && (
          <span className="font-medium text-amber-600">
            Additional interest owed: {formatCurrency(totalAdditional)}
          </span>
        )}
        {chargeableNotices.length > 0 && (
          <div className="ml-auto">
            <Button
              variant="primary"
              onClick={handleChargeAll}
              disabled={isPending}
            >
              {isPending ? "Charging..." : `Charge All (${chargeableNotices.length})`}
            </Button>
          </div>
        )}
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-[var(--radius-card)] bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      )}

      {/* Notices table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th scope="col" className="px-4 py-3 font-medium text-ink-muted">
                  Notice
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-ink-muted">
                  Lot
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-ink-muted">
                  Fund
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-ink-muted">
                  Due Date
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-ink-muted text-right">
                  Days Overdue
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-ink-muted text-right">
                  Balance
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-ink-muted text-right">
                  Previously Charged
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-ink-muted text-right">
                  Additional
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-ink-muted text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {notices.map((notice) => (
                <tr
                  key={notice.id}
                  className="hover:bg-muted/50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-ink">
                    {notice.noticeNumber}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {notice.lotNumber}
                  </td>
                  <td className="px-4 py-3 text-ink-muted text-xs">
                    {notice.fundName}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {formatDate(notice.dueDate)}
                  </td>
                  <td className="px-4 py-3 text-right text-amber-600 font-medium">
                    {notice.daysOverdue}
                  </td>
                  <td className="px-4 py-3 text-right text-ink">
                    {formatCurrency(notice.balanceOutstanding)}
                  </td>
                  <td className="px-4 py-3 text-right text-ink-muted">
                    {formatCurrency(notice.previouslyCharged)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {notice.additionalInterest > 0 ? (
                      <span className="text-amber-600">
                        {formatCurrency(notice.additionalInterest)}
                      </span>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {notice.additionalInterest > 0 ? (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() =>
                          handleChargeSingle(
                            notice.id,
                            notice.additionalInterest,
                          )
                        }
                        className="rounded-md px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors disabled:opacity-50"
                      >
                        {isPending ? "..." : "Charge"}
                      </button>
                    ) : (
                      <span className="text-xs text-ink-muted italic">
                        Up to date
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
