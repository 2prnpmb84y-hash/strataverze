"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import type { CaseWords } from "@/lib/jurisdiction/screen-words";

interface DebtRecoveryCase {
  id: string;
  caseNumber: string;
  schemeId: string;
  schemeName: string;
  lotId: string;
  lotLabel: string;
  ownerId: string;
  status: string;
  currentStep: string;
  priority: string;
  totalOwed: number;
  principalOwed: number;
  interestOwed: number;
  createdAt: string;
}

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "default"> = {
  OPEN: "warning",
  IN_PROGRESS: "warning",
  PAYMENT_PLAN: "default",
  REFERRED_LEGAL: "danger",
  CLOSED_PAID: "success",
  CLOSED_WRITTEN_OFF: "default",
  CLOSED_SETTLED: "success",
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  PAYMENT_PLAN: "Payment Plan",
  REFERRED_LEGAL: "Legal Referral",
  CLOSED_PAID: "Closed (Paid)",
  CLOSED_WRITTEN_OFF: "Written Off",
  CLOSED_SETTLED: "Settled",
};

function formatCurrency(value: number): string {
  if (value < 0) {
    return `($${Math.abs(value).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
  }
  return `$${value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function DebtRecoveryOwnerClient({
  cases,
  isCommittee,
  stepLabels,
  caseWords,
  showPaymentPlans,
}: {
  cases: DebtRecoveryCase[];
  isCommittee: boolean;
  /** Each building's case words, by scheme id (caseWordsFor). */
  caseWords: Readonly<Record<string, CaseWords>>;
  /** Whether any building listed has the statutory payment plan (FEATURES.statutoryPaymentPlans). */
  showPaymentPlans: boolean;
  /** Each building's name for each recovery step type, by scheme id (`rules.DEBT_RECOVERY_STEP_LABELS`). */
  stepLabels: Readonly<Record<string, Readonly<Record<string, string>>>>;
}) {
  const [filter, setFilter] = useState<"all" | "active" | "closed">("all");

  const activeCases = cases.filter(
    (c) =>
      !["CLOSED_PAID", "CLOSED_WRITTEN_OFF", "CLOSED_SETTLED"].includes(
        c.status,
      ),
  );
  const closedCases = cases.filter((c) =>
    ["CLOSED_PAID", "CLOSED_WRITTEN_OFF", "CLOSED_SETTLED"].includes(c.status),
  );

  const totalOwed = activeCases.reduce((sum, c) => sum + c.totalOwed, 0);
  const paymentPlanCount = activeCases.filter(
    (c) => c.status === "PAYMENT_PLAN",
  ).length;
  const legalCount = activeCases.filter(
    (c) => c.status === "REFERRED_LEGAL",
  ).length;

  const displayed =
    filter === "active"
      ? activeCases
      : filter === "closed"
        ? closedCases
        : cases;

  return (
    <>
      {/* Stats */}
      <div className={`grid grid-cols-1 ${showPaymentPlans ? "sm:grid-cols-4" : "sm:grid-cols-3"} gap-4`}>
        <StatCard
          label="Active Cases"
          value={String(activeCases.length)}
          accent={activeCases.length > 0 ? "bg-amber-500" : "bg-turquoise"}
        />
        <StatCard
          label="Total Outstanding"
          value={formatCurrency(totalOwed)}
          accent={totalOwed > 0 ? "bg-red-500" : "bg-green-500"}
        />
        {showPaymentPlans && (
          <StatCard
            label="Payment Plans"
            value={String(paymentPlanCount)}
            accent="bg-blue-500"
          />
        )}
        <StatCard
          label="Legal Referrals"
          value={String(legalCount)}
          accent={legalCount > 0 ? "bg-red-500" : "bg-turquoise"}
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(["all", "active", "closed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
              filter === f
                ? "bg-turquoise text-white"
                : "bg-muted text-ink-muted hover:bg-muted/80"
            }`}
          >
            {f === "all"
              ? `All (${cases.length})`
              : f === "active"
                ? `Active (${activeCases.length})`
                : `Closed (${closedCases.length})`}
          </button>
        ))}
      </div>

      {/* Case list */}
      {displayed.length === 0 ? (
        <EmptyState
          title={
            filter === "all"
              ? "No debt recovery cases"
              : filter === "active"
                ? "No active cases"
                : "No closed cases"
          }
          description={
            isCommittee
              ? "No debt recovery cases have been initiated yet."
              : "There are no debt recovery cases for your lots."
          }
        />
      ) : (
        <div className="space-y-3">
          {displayed.map((c) => (
            <Link
              key={c.id}
              href={`/owner/levies/debt-recovery/${c.id}`}
              className="block"
            >
              <Card className="transition-shadow hover:shadow-md">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-ink">
                        {c.caseNumber}
                      </p>
                      <StatusChip
                        status={c.status === "PAYMENT_PLAN" ? (caseWords[c.schemeId]?.paymentPlan ?? STATUS_LABEL[c.status]) : (STATUS_LABEL[c.status] ?? c.status)}
                        variant={STATUS_VARIANT[c.status] ?? "default"}
                      />
                      {c.priority === "HIGH" && (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          High Priority
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-ink-muted mt-0.5">
                      {c.lotLabel}
                      {c.schemeName ? ` · ${c.schemeName}` : ""}
                    </p>
                    {c.currentStep && c.currentStep !== "CLOSED" && (
                      <p className="text-xs text-ink-muted mt-1">
                        Current step:{" "}
                        {stepLabels[c.schemeId]?.[c.currentStep] ?? c.currentStep}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums text-ink">
                        {formatCurrency(c.totalOwed)}
                      </p>
                      <p className="text-xs text-ink-muted">Total owing</p>
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="h-4 w-4 text-ink-muted"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m8.25 4.5 7.5 7.5-7.5 7.5"
                      />
                    </svg>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Committee action */}
      {isCommittee && (
        <div className="text-center text-sm text-ink-muted pt-4">
          To initiate a new debt recovery case, navigate to the relevant
          lot in the adviser portal.
        </div>
      )}
    </>
  );
}
