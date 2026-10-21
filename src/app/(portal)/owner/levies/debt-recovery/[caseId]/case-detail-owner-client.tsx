"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";
import {
  completeDebtRecoveryStepAction,
  addDebtRecoveryNoteAction,
  recordInstalmentPaymentAction,
} from "@/lib/actions/debt-recovery";

/* ─── Types ──────────────────────────────────────────────────── */

interface Step {
  id: string;
  stepType: string;
  stepOrder: number;
  actionRequired: string;
  legalBasis: string | null;
  responsibleParty: string;
  status: string;
  completedAt: string | null;
  outcome: string | null;
  evidenceNotes: string | null;
}

interface Instalment {
  id: string;
  instalmentNumber: number;
  dueDate: string;
  amount: number;
  amountPaid: number;
  status: string;
  paidAt: string | null;
}

interface PaymentPlan {
  id: string;
  totalAmount: number;
  instalmentAmount: number;
  frequency: string;
  startDate: string;
  endDate: string;
  numberOfInstalments: number;
  status: string;
}

interface Document {
  id: string;
  documentType: string;
  title: string;
  isDraft: boolean;
  createdAt: string;
}

interface Activity {
  id: string;
  activityType: string;
  description: string;
  createdAt: string;
}

interface DebtRecoveryCase {
  id: string;
  caseNumber: string;
  schemeId: string;
  lotId: string;
  ownerId: string;
  status: string;
  currentStep: string;
  priority: string;
  principalOwed: number;
  interestOwed: number;
  costsOwed: number;
  totalOwed: number;
  solicitorName: string | null;
  solicitorRef: string | null;
  courtFileNumber: string | null;
  hasDispute: boolean;
  disputeDetails: string | null;
  hasHardshipRequest: boolean;
  hardshipDetails: string | null;
  notes: string | null;
  closedAt: string | null;
  closedReason: string | null;
  createdAt: string;
  steps: Step[];
  paymentPlan: PaymentPlan | null;
  instalments: Instalment[];
  documents: Document[];
  activities: Activity[];
}

/* ─── Constants ──────────────────────────────────────────────── */

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

const STEP_LABEL: Record<string, string> = {
  LEDGER_VERIFICATION: "Ledger Verification",
  INITIAL_CONTACT: "Initial Contact",
  REMINDER_NOTICE: "Reminder Notice",
  FINAL_NOTICE: "Final Notice",
  HARDSHIP_REVIEW: "Hardship Review",
  COMMITTEE_REVIEW: "Committee Review",
  LEGAL_REFERRAL: "Legal Referral",
  PROCEEDINGS: "Proceedings",
  ENFORCEMENT: "Enforcement",
  CLOSED: "Closed",
};

const ACTIVITY_ICONS: Record<string, string> = {
  CASE_OPENED: "📂",
  STATUS_CHANGED: "🔄",
  STEP_ADVANCED: "✅",
  PAYMENT_PLAN_CREATED: "📋",
  PAYMENT_RECEIVED: "💰",
  CASE_CLOSED: "🔒",
  NOTE_ADDED: "📝",
  DOCUMENT_ADDED: "📄",
};

function formatCurrency(value: number): string {
  if (value < 0) {
    return `($${Math.abs(value).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
  }
  return `$${value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/* ─── Component ──────────────────────────────────────────────── */

export function CaseDetailOwnerClient({
  debtCase,
  isCommittee,
}: {
  debtCase: DebtRecoveryCase;
  isCommittee: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  const isClosed = [
    "CLOSED_PAID",
    "CLOSED_WRITTEN_OFF",
    "CLOSED_SETTLED",
  ].includes(debtCase.status);

  /* ── Handlers (committee only) ─────────────────────── */

  function handleCompleteStep(step: Step) {
    startTransition(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("stepType", step.stepType);
      fd.set("outcome", "Completed");
      const result = await completeDebtRecoveryStepAction(
        step.id,
        debtCase.id,
        debtCase.schemeId,
        fd,
      );
      if (result.error) setError(result.error);
    });
  }

  function handleAddNote() {
    if (!noteText.trim()) return;
    startTransition(async () => {
      setError(null);
      const result = await addDebtRecoveryNoteAction(
        debtCase.id,
        debtCase.schemeId,
        noteText.trim(),
      );
      if (result.error) setError(result.error);
      else setNoteText("");
    });
  }

  function handleRecordPayment(instalment: Instalment) {
    startTransition(async () => {
      setError(null);
      const result = await recordInstalmentPaymentAction(
        instalment.id,
        debtCase.id,
        debtCase.schemeId,
        instalment.amount,
      );
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Overview Card ──────────────────────────────── */}
      <Card>
        <CardHeader
          title="Case Overview"
          description={`Opened ${formatDate(debtCase.createdAt)}`}
        />
        <div className="px-6 pb-6 space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <StatusChip
              status={STATUS_LABEL[debtCase.status] ?? debtCase.status}
              variant={STATUS_VARIANT[debtCase.status] ?? "default"}
            />
            {debtCase.priority === "HIGH" && (
              <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                High Priority
              </span>
            )}
            {debtCase.hasDispute && (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                Dispute Lodged
              </span>
            )}
            {debtCase.hasHardshipRequest && (
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                Hardship Request
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-ink-muted uppercase tracking-wide">
                Principal
              </p>
              <p className="text-sm font-semibold tabular-nums text-ink">
                {formatCurrency(debtCase.principalOwed)}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-muted uppercase tracking-wide">
                Interest
              </p>
              <p className="text-sm font-semibold tabular-nums text-ink">
                {formatCurrency(debtCase.interestOwed)}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-muted uppercase tracking-wide">
                Costs
              </p>
              <p className="text-sm font-semibold tabular-nums text-ink">
                {formatCurrency(debtCase.costsOwed)}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-muted uppercase tracking-wide">
                Total Owing
              </p>
              <p className="text-sm font-semibold tabular-nums text-red-600">
                {formatCurrency(debtCase.totalOwed)}
              </p>
            </div>
          </div>

          {debtCase.solicitorName && (
            <div className="pt-2 border-t border-line">
              <p className="text-xs text-ink-muted uppercase tracking-wide mb-1">
                Solicitor
              </p>
              <p className="text-sm text-ink">{debtCase.solicitorName}</p>
              {debtCase.solicitorRef && (
                <p className="text-xs text-ink-muted">
                  Ref: {debtCase.solicitorRef}
                </p>
              )}
            </div>
          )}

          {debtCase.courtFileNumber && (
            <div>
              <p className="text-xs text-ink-muted uppercase tracking-wide mb-1">
                Court File Number
              </p>
              <p className="text-sm text-ink">{debtCase.courtFileNumber}</p>
            </div>
          )}

          {isClosed && debtCase.closedReason && (
            <div className="pt-2 border-t border-line">
              <p className="text-xs text-ink-muted uppercase tracking-wide mb-1">
                Closed
              </p>
              <p className="text-sm text-ink">
                {debtCase.closedReason}
                {debtCase.closedAt && ` on ${formatDate(debtCase.closedAt)}`}
              </p>
            </div>
          )}

          {debtCase.notes && (
            <div className="pt-2 border-t border-line">
              <p className="text-xs text-ink-muted uppercase tracking-wide mb-1">
                Notes
              </p>
              <p className="text-sm text-ink whitespace-pre-wrap">
                {debtCase.notes}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* ── Recovery Steps ─────────────────────────────── */}
      <Card>
        <CardHeader
          title="Recovery Steps"
          description="NSW Strata Schemes Management Act 2015 recovery process."
        />
        <div className="px-6 pb-6">
          <ol className="relative border-l-2 border-line ml-3 space-y-4">
            {debtCase.steps.map((step) => {
              const isActive = step.stepType === debtCase.currentStep;
              const isCompleted = step.status === "COMPLETED";
              const _isPast = step.stepOrder <
                (debtCase.steps.find(
                  (s) => s.stepType === debtCase.currentStep,
                )?.stepOrder ?? 999);

              return (
                <li key={step.id} className="ml-6">
                  {/* Timeline dot */}
                  <span
                    className={`absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                      isCompleted
                        ? "border-green-500 bg-green-500"
                        : isActive
                          ? "border-turquoise bg-turquoise"
                          : "border-line bg-white"
                    }`}
                  >
                    {isCompleted && (
                      <svg
                        className="h-2.5 w-2.5 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={3}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m4.5 12.75 6 6 9-13.5"
                        />
                      </svg>
                    )}
                  </span>

                  <div
                    className={`rounded-[var(--radius-card)] p-3 ${
                      isActive
                        ? "bg-turquoise/5 border border-turquoise/20"
                        : isCompleted
                          ? "bg-muted"
                          : "bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p
                          className={`text-sm font-medium ${
                            isActive
                              ? "text-turquoise"
                              : isCompleted
                                ? "text-ink-muted"
                                : "text-ink"
                          }`}
                        >
                          {step.stepOrder}.{" "}
                          {STEP_LABEL[step.stepType] ?? step.stepType}
                        </p>
                        <p className="text-xs text-ink-muted mt-0.5">
                          {step.actionRequired}
                        </p>
                        {step.legalBasis && (
                          <p className="text-xs text-ink-muted italic mt-0.5">
                            {step.legalBasis}
                          </p>
                        )}
                      </div>

                      {isCompleted && step.completedAt && (
                        <span className="shrink-0 text-xs text-ink-muted">
                          {formatDate(step.completedAt)}
                        </span>
                      )}
                    </div>

                    {isCompleted && step.outcome && (
                      <p className="text-xs text-ink-muted mt-1">
                        Outcome: {step.outcome}
                      </p>
                    )}

                    {/* Committee can complete active steps */}
                    {isCommittee && isActive && !isClosed && (
                      <div className="mt-2">
                        <Button
                          variant="primary"
                          onClick={() => handleCompleteStep(step)}
                          disabled={isPending}
                        >
                          {isPending ? "Processing..." : "Mark Complete"}
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </Card>

      {/* ── Payment Plan ───────────────────────────────── */}
      {debtCase.paymentPlan && (
        <Card>
          <CardHeader
            title="Payment Plan"
            description={`${debtCase.paymentPlan.numberOfInstalments} ${debtCase.paymentPlan.frequency.toLowerCase()} instalments of ${formatCurrency(debtCase.paymentPlan.instalmentAmount)}`}
          />
          <div className="px-6 pb-6 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-ink-muted uppercase tracking-wide">
                  Total
                </p>
                <p className="text-sm font-semibold tabular-nums text-ink">
                  {formatCurrency(debtCase.paymentPlan.totalAmount)}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-muted uppercase tracking-wide">
                  Start
                </p>
                <p className="text-sm text-ink">
                  {formatDate(debtCase.paymentPlan.startDate)}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-muted uppercase tracking-wide">
                  End
                </p>
                <p className="text-sm text-ink">
                  {formatDate(debtCase.paymentPlan.endDate)}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-muted uppercase tracking-wide">
                  Status
                </p>
                <StatusChip
                  status={debtCase.paymentPlan.status}
                  variant={
                    debtCase.paymentPlan.status === "COMPLETED"
                      ? "success"
                      : debtCase.paymentPlan.status === "DEFAULTED"
                        ? "danger"
                        : "default"
                  }
                />
              </div>
            </div>

            {/* Instalment table */}
            {debtCase.instalments.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs text-ink-muted uppercase tracking-wide">
                      <th scope="col" className="text-left px-3 py-2">
                        #
                      </th>
                      <th scope="col" className="text-left px-3 py-2">
                        Due Date
                      </th>
                      <th scope="col" className="text-right px-3 py-2">
                        Amount
                      </th>
                      <th scope="col" className="text-right px-3 py-2">
                        Paid
                      </th>
                      <th scope="col" className="text-right px-3 py-2">
                        Status
                      </th>
                      {isCommittee && (
                        <th scope="col" className="text-right px-3 py-2">
                          Action
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {debtCase.instalments.map((inst) => (
                      <tr
                        key={inst.id}
                        className="border-b border-line/50"
                      >
                        <td className="px-3 py-2 text-ink">
                          {inst.instalmentNumber}
                        </td>
                        <td className="px-3 py-2 text-ink whitespace-nowrap">
                          {formatDate(inst.dueDate)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink">
                          {formatCurrency(inst.amount)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-green-600">
                          {inst.amountPaid > 0
                            ? formatCurrency(inst.amountPaid)
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <StatusChip
                            status={inst.status}
                            variant={
                              inst.status === "PAID"
                                ? "success"
                                : inst.status === "OVERDUE"
                                  ? "danger"
                                  : "default"
                            }
                          />
                        </td>
                        {isCommittee && (
                          <td className="px-3 py-2 text-right">
                            {inst.status !== "PAID" && (
                              <button
                                onClick={() => handleRecordPayment(inst)}
                                disabled={isPending}
                                className="text-xs text-turquoise hover:underline disabled:opacity-50"
                              >
                                Record Payment
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── Documents ──────────────────────────────────── */}
      {debtCase.documents.length > 0 && (
        <Card>
          <CardHeader
            title="Documents"
            description="Notices and documents related to this case."
          />
          <div className="px-6 pb-6">
            <div className="space-y-2">
              {debtCase.documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">{doc.title}</p>
                    <p className="text-xs text-ink-muted">
                      {doc.documentType.replace(/_/g, " ")}
                      {doc.isDraft ? " (Draft)" : ""}
                      {" · "}
                      {formatDate(doc.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* ── Add Note (committee only) ──────────────────── */}
      {isCommittee && !isClosed && (
        <Card>
          <CardHeader
            title="Add Note"
            description="Record an observation or update for this case."
          />
          <div className="px-6 pb-6 space-y-3">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Enter a note..."
              rows={3}
              className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise/40"
            />
            <Button
              variant="secondary"
              onClick={handleAddNote}
              disabled={isPending || !noteText.trim()}
            >
              {isPending ? "Saving..." : "Add Note"}
            </Button>
          </div>
        </Card>
      )}

      {/* ── Activity Log ───────────────────────────────── */}
      {debtCase.activities.length > 0 && (
        <Card>
          <CardHeader
            title="Activity Log"
            description="Recent activity on this case."
          />
          <div className="px-6 pb-6">
            <div className="space-y-3">
              {debtCase.activities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex gap-3 text-sm"
                >
                  <span className="shrink-0 text-base">
                    {ACTIVITY_ICONS[activity.activityType] ?? "📌"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-ink">{activity.description}</p>
                    <p className="text-xs text-ink-muted">
                      {formatDate(activity.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
