"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusChip } from "@/components/ui/status-chip";

type ChipStatus = "default" | "success" | "warning" | "danger";
import {
  completeDebtRecoveryStepAction,
  closeDebtRecoveryCaseAction,
  createPaymentPlanAction,
  recordInstalmentPaymentAction,
  addDebtRecoveryNoteAction,
} from "@/lib/actions/debt-recovery";

// ─── Types ──────────────────────────────────────────────────────

type DebtCase = {
  id: string;
  caseNumber: string;
  lotId: string;
  ownerId: string;
  status: string;
  priority: string;
  principalOwed: number;
  interestOwed: number;
  costsOwed: number;
  totalOwed: number;
  currentStep: string;
  notes: string | null;
  solicitorRef: string | null;
  solicitorName: string | null;
  courtFileNumber: string | null;
  excludeFromRecovery: boolean;
  exclusionReason: string | null;
  createdAt: string;
  closedAt: string | null;
  closedReason: string | null;
};

type Step = {
  id: string;
  stepType: string;
  stepOrder: number;
  actionRequired: string;
  legalBasis: string | null;
  responsibleParty: string;
  approvalRequired: boolean;
  status: string;
  completedAt: string | null;
  outcome: string | null;
  evidenceNotes: string | null;
  noticeType: string | null;
  noticeMethod: string | null;
  noticeSentAt: string | null;
};

type PaymentPlan = {
  id: string;
  totalAmount: number;
  instalmentAmount: number;
  frequency: string;
  startDate: string;
  endDate: string;
  numberOfInstalments: number;
  status: string;
};

type Instalment = {
  id: string;
  instalmentNumber: number;
  dueDate: string;
  amount: number;
  status: string;
  amountPaid: number | null;
  paidAt: string | null;
};

type Document = {
  id: string;
  documentType: string;
  title: string;
  isDraft: boolean;
  createdAt: string;
  issuedAt: string | null;
};

type Activity = {
  id: string;
  activityType: string;
  description: string;
  createdAt: string;
};

// ─── Helpers ────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; variant: ChipStatus }> = {
  OPEN: { label: "Open", variant: "success" },
  IN_PROGRESS: { label: "In Progress", variant: "warning" },
  PAYMENT_PLAN: { label: "Payment Plan", variant: "default" },
  ON_HOLD: { label: "On Hold", variant: "default" },
  REFERRED_LEGAL: { label: "Legal", variant: "danger" },
  CLOSED_PAID: { label: "Closed", variant: "success" },
  CLOSED_WRITTEN_OFF: { label: "Written Off", variant: "default" },
  CLOSED_SETTLED: { label: "Settled", variant: "success" },
};

const STEP_LABELS: Record<string, string> = {
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

const STEP_DESCRIPTIONS: Record<string, string> = {
  LEDGER_VERIFICATION:
    "Verify the accuracy of all levy charges, payments received and the outstanding balance. Ensure the ledger is reconciled before proceeding.",
  INITIAL_CONTACT:
    "Make initial contact with the lot owner to advise them of the overdue levy and request payment. This is an informal reminder before formal notices.",
  REMINDER_NOTICE:
    "Issue a formal reminder notice under s.83(1) of the Strata Schemes Management Act 2015. The notice must specify the amount owing and due date.",
  FINAL_NOTICE:
    "Issue a final notice of the overdue contribution, warning that further recovery action will be taken if payment is not received within 14 days.",
  HARDSHIP_REVIEW:
    "Review any hardship application from the lot owner. Consider whether a payment plan or alternative arrangement is appropriate before escalating.",
  COMMITTEE_REVIEW:
    "Present the case to the strata committee for review and decision on next steps. The committee must resolve to proceed with legal recovery.",
  LEGAL_REFERRAL:
    "Refer the matter to the scheme's solicitor for formal debt recovery proceedings. Provide all supporting documentation and correspondence.",
  PROCEEDINGS:
    "Commence formal legal proceedings. This may include an application to NCAT or the Local Court for recovery of the outstanding levy debt.",
  ENFORCEMENT:
    "Enforce the court order or NCAT decision. This may include registration of a judgment, garnishee orders, or other enforcement mechanisms.",
  CLOSED:
    "Finalise and close the debt recovery case. Record the outcome and any relevant notes for future reference.",
};

function currency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(value);
}

function fmtDate(date: string): string {
  return new Date(date).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(date: string): string {
  return new Date(date).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Component ──────────────────────────────────────────────────

export function CaseDetailClient({
  schemeId,
  lotNumber,
  unitNumber,
  ownerName,
  debtCase,
  steps,
  paymentPlan,
  instalments,
  documents,
  activities,
}: {
  schemeId: string;
  lotNumber: string;
  unitNumber: string | null;
  ownerName: string;
  debtCase: DebtCase;
  steps: Step[];
  paymentPlan: PaymentPlan | null;
  instalments: Instalment[];
  documents: Document[];
  activities: Activity[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Wizard state: which step index is being viewed
  const currentStepIndex = steps.findIndex(
    (s) => s.stepType === debtCase.currentStep,
  );
  const [wizardIndex, setWizardIndex] = useState(
    currentStepIndex >= 0 ? currentStepIndex : 0,
  );

  // Side panel state
  const [sidePanel, setSidePanel] = useState<
    "none" | "payment" | "documents" | "activity" | "close"
  >("none");

  const statusInfo = STATUS_MAP[debtCase.status] ?? {
    label: debtCase.status,
    variant: "default" as ChipStatus,
  };

  const isClosed = [
    "CLOSED_PAID",
    "CLOSED_WRITTEN_OFF",
    "CLOSED_SETTLED",
  ].includes(debtCase.status);

  function clearMessages() {
    setError(null);
    setSuccess(null);
  }

  const activeStep = steps[wizardIndex];
  const isOnCurrentStep =
    activeStep?.stepType === debtCase.currentStep;
  const completedSteps = steps.filter(
    (s) => s.status === "COMPLETED",
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={debtCase.caseNumber}
        description={`Lot ${lotNumber}${unitNumber ? ` (Unit ${unitNumber})` : ""} — ${ownerName}`}
        backHref={`/adviser/schemes/${schemeId}/finance/debt-recovery`}
        backLabel="Back to debt recovery"
        action={
          <StatusChip status={statusInfo.label} variant={statusInfo.variant} />
        }
      />

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      {/* Financial Summary Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-white border border-gray-100 p-3">
          <p className="text-xs text-gray-500">Principal</p>
          <p className="text-base font-semibold text-gray-900 tabular-nums">
            {currency(debtCase.principalOwed)}
          </p>
        </div>
        <div className="rounded-xl bg-white border border-gray-100 p-3">
          <p className="text-xs text-gray-500">Interest</p>
          <p className="text-base font-semibold text-gray-900 tabular-nums">
            {currency(debtCase.interestOwed)}
          </p>
        </div>
        <div className="rounded-xl bg-white border border-gray-100 p-3">
          <p className="text-xs text-gray-500">Costs</p>
          <p className="text-base font-semibold text-gray-900 tabular-nums">
            {currency(debtCase.costsOwed)}
          </p>
        </div>
        <div className="rounded-xl bg-turquoise/5 border border-turquoise/20 p-3">
          <p className="text-xs text-turquoise">Total Owing</p>
          <p className="text-base font-semibold text-turquoise tabular-nums">
            {currency(debtCase.totalOwed)}
          </p>
        </div>
      </div>

      {/* Wizard Progress Bar */}
      <div className="rounded-xl bg-white border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-gray-900">
            Recovery Progress
          </p>
          <p className="text-xs text-gray-500">
            {completedSteps} of {steps.length} steps completed
          </p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-1">
          {steps.map((step, idx) => {
            const isCompleted = step.status === "COMPLETED";
            const isCurrent = step.stepType === debtCase.currentStep;
            const isViewing = idx === wizardIndex;

            return (
              <button
                key={step.id}
                onClick={() => {
                  setWizardIndex(idx);
                  clearMessages();
                  setSidePanel("none");
                }}
                className={`group relative flex-1 h-2 rounded-full transition-all ${
                  isCompleted
                    ? "bg-emerald-400"
                    : isCurrent
                      ? "bg-turquoise"
                      : "bg-gray-200"
                } ${isViewing ? "ring-2 ring-offset-1 ring-turquoise" : ""}`}
                title={STEP_LABELS[step.stepType] ?? step.stepType}
              >
                {/* Tooltip on hover */}
                <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {STEP_LABELS[step.stepType] ?? step.stepType}
                </span>
              </button>
            );
          })}
        </div>

        {/* Step labels below for wider screens */}
        <div className="mt-2 hidden sm:flex items-start gap-1">
          {steps.map((step, idx) => (
            <button
              key={step.id}
              onClick={() => {
                setWizardIndex(idx);
                clearMessages();
                setSidePanel("none");
              }}
              className={`flex-1 text-center text-[10px] leading-tight transition-colors ${
                idx === wizardIndex
                  ? "text-turquoise font-medium"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {STEP_LABELS[step.stepType] ?? step.stepType}
            </button>
          ))}
        </div>
      </div>

      {/* Main Wizard Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Step Detail (2/3 width) */}
        <div className="lg:col-span-2 space-y-4">
          {activeStep && (
            <WizardStepContent
              step={activeStep}
              stepIndex={wizardIndex}
              totalSteps={steps.length}
              isOnCurrentStep={isOnCurrentStep}
              isClosed={isClosed}
              schemeId={schemeId}
              caseId={debtCase.id}
              isPending={isPending}
              startTransition={startTransition}
              setError={setError}
              setSuccess={setSuccess}
              clearMessages={clearMessages}
              router={router}
            />
          )}

          {/* Wizard Navigation */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              onClick={() => {
                setWizardIndex((i) => Math.max(0, i - 1));
                clearMessages();
                setSidePanel("none");
              }}
              disabled={wizardIndex === 0}
            >
              <svg
                className="h-4 w-4 mr-1"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 19.5 8.25 12l7.5-7.5"
                />
              </svg>
              Previous Step
            </Button>

            <p className="text-xs text-gray-400">
              Step {wizardIndex + 1} of {steps.length}
            </p>

            <Button
              variant="ghost"
              onClick={() => {
                setWizardIndex((i) =>
                  Math.min(steps.length - 1, i + 1),
                );
                clearMessages();
                setSidePanel("none");
              }}
              disabled={wizardIndex === steps.length - 1}
            >
              Next Step
              <svg
                className="h-4 w-4 ml-1"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m8.25 4.5 7.5 7.5-7.5 7.5"
                />
              </svg>
            </Button>
          </div>
        </div>

        {/* Right: Context Panel (1/3 width) */}
        <div className="space-y-4">
          {/* Case Info */}
          <Card>
            <div className="p-4 space-y-3">
              <p className="text-sm font-medium text-gray-900">Case Info</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Priority</span>
                  <span
                    className={`font-medium ${debtCase.priority === "HIGH" ? "text-red-600" : "text-gray-900"}`}
                  >
                    {debtCase.priority}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Opened</span>
                  <span className="text-gray-900">
                    {fmtDate(debtCase.createdAt)}
                  </span>
                </div>
                {debtCase.solicitorName && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Solicitor</span>
                    <span className="text-gray-900 text-right">
                      {debtCase.solicitorName}
                    </span>
                  </div>
                )}
                {debtCase.courtFileNumber && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Court File</span>
                    <span className="text-gray-900">
                      {debtCase.courtFileNumber}
                    </span>
                  </div>
                )}
              </div>
              {debtCase.notes && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-1">Notes</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {debtCase.notes}
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* Quick Actions */}
          <Card>
            <div className="p-4 space-y-2">
              <p className="text-sm font-medium text-gray-900 mb-3">
                Quick Actions
              </p>
              <button
                onClick={() =>
                  setSidePanel(
                    sidePanel === "payment" ? "none" : "payment",
                  )
                }
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  sidePanel === "payment"
                    ? "bg-turquoise/10 text-turquoise"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <svg
                  className="h-4 w-4 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z"
                  />
                </svg>
                Payment Plan
                {paymentPlan && (
                  <span className="ml-auto text-xs text-emerald-600 font-medium">
                    Active
                  </span>
                )}
              </button>
              <button
                onClick={() =>
                  setSidePanel(
                    sidePanel === "documents" ? "none" : "documents",
                  )
                }
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  sidePanel === "documents"
                    ? "bg-turquoise/10 text-turquoise"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <svg
                  className="h-4 w-4 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                  />
                </svg>
                Documents
                {documents.length > 0 && (
                  <span className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[10px] font-medium text-gray-600">
                    {documents.length}
                  </span>
                )}
              </button>
              <button
                onClick={() =>
                  setSidePanel(
                    sidePanel === "activity" ? "none" : "activity",
                  )
                }
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  sidePanel === "activity"
                    ? "bg-turquoise/10 text-turquoise"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <svg
                  className="h-4 w-4 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                  />
                </svg>
                Activity Log
                {activities.length > 0 && (
                  <span className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[10px] font-medium text-gray-600">
                    {activities.length}
                  </span>
                )}
              </button>
              {!isClosed && (
                <button
                  onClick={() =>
                    setSidePanel(
                      sidePanel === "close" ? "none" : "close",
                    )
                  }
                  className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    sidePanel === "close"
                      ? "bg-red-50 text-red-600"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <svg
                    className="h-4 w-4 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                    />
                  </svg>
                  Close Case
                </button>
              )}
            </div>
          </Card>

          {/* Expanded Side Panel Content */}
          {sidePanel === "payment" && (
            <PaymentPlanPanel
              schemeId={schemeId}
              caseId={debtCase.id}
              lotId={debtCase.lotId}
              totalOwed={debtCase.totalOwed}
              paymentPlan={paymentPlan}
              instalments={instalments}
              isClosed={isClosed}
              isPending={isPending}
              startTransition={startTransition}
              setError={setError}
              setSuccess={setSuccess}
              clearMessages={clearMessages}
              router={router}
            />
          )}

          {sidePanel === "documents" && (
            <DocumentsPanel documents={documents} />
          )}

          {sidePanel === "activity" && (
            <ActivityPanel
              schemeId={schemeId}
              caseId={debtCase.id}
              activities={activities}
              isPending={isPending}
              startTransition={startTransition}
              setError={setError}
              setSuccess={setSuccess}
              clearMessages={clearMessages}
              router={router}
            />
          )}

          {sidePanel === "close" && !isClosed && (
            <CloseCasePanel
              schemeId={schemeId}
              debtCase={debtCase}
              isPending={isPending}
              startTransition={startTransition}
              setError={setError}
              setSuccess={setSuccess}
              clearMessages={clearMessages}
              router={router}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Wizard Step Content ────────────────────────────────────────

function WizardStepContent({
  step,
  stepIndex,
  totalSteps,
  isOnCurrentStep,
  isClosed,
  schemeId,
  caseId,
  isPending,
  startTransition,
  setError,
  setSuccess,
  clearMessages,
  router,
}: {
  step: Step;
  stepIndex: number;
  totalSteps: number;
  isOnCurrentStep: boolean;
  isClosed: boolean;
  schemeId: string;
  caseId: string;
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
  setError: (v: string | null) => void;
  setSuccess: (v: string | null) => void;
  clearMessages: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [outcome, setOutcome] = useState("");
  const [evidenceNotes, setEvidenceNotes] = useState("");
  const [noticeMethod, setNoticeMethod] = useState("");

  const isCompleted = step.status === "COMPLETED";
  const canComplete = isOnCurrentStep && !isClosed && !isCompleted;

  function handleCompleteStep() {
    clearMessages();
    const formData = new FormData();
    formData.set("outcome", outcome);
    formData.set("evidenceNotes", evidenceNotes);
    formData.set("noticeMethod", noticeMethod);
    formData.set("stepType", step.stepType);

    startTransition(async () => {
      const result = await completeDebtRecoveryStepAction(
        step.id,
        caseId,
        schemeId,
        formData,
      );
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(
          `${STEP_LABELS[step.stepType] ?? step.stepType} completed successfully`,
        );
        setOutcome("");
        setEvidenceNotes("");
        setNoticeMethod("");
        router.refresh();
      }
    });
  }

  return (
    <Card
      className={
        isOnCurrentStep && !isCompleted
          ? "ring-2 ring-turquoise"
          : ""
      }
    >
      <div className="p-5">
        {/* Step Header */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                isCompleted
                  ? "bg-emerald-100 text-emerald-700"
                  : isOnCurrentStep
                    ? "bg-turquoise text-white"
                    : "bg-gray-100 text-gray-400"
              }`}
            >
              {isCompleted ? (
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m4.5 12.75 6 6 9-13.5"
                  />
                </svg>
              ) : (
                stepIndex + 1
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {STEP_LABELS[step.stepType] ?? step.stepType}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    step.responsibleParty === "ADVISER"
                      ? "bg-blue-50 text-blue-700"
                      : step.responsibleParty === "COMMITTEE"
                        ? "bg-purple-50 text-purple-700"
                        : "bg-gray-50 text-gray-700"
                  }`}
                >
                  {step.responsibleParty}
                </span>
                {step.approvalRequired && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                    Approval Required
                  </span>
                )}
                {isCompleted && (
                  <StatusChip status="Completed" variant="success" />
                )}
                {isOnCurrentStep && !isCompleted && (
                  <StatusChip status="Current" variant="warning" />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Step Description */}
        <div className="mb-4 rounded-lg bg-gray-50 p-4">
          <p className="text-sm font-medium text-gray-700 mb-1">
            What to do
          </p>
          <p className="text-sm text-gray-600">{step.actionRequired}</p>
          {STEP_DESCRIPTIONS[step.stepType] && (
            <p className="mt-2 text-xs text-gray-500">
              {STEP_DESCRIPTIONS[step.stepType]}
            </p>
          )}
        </div>

        {/* Legal Basis */}
        {step.legalBasis && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
            <svg
              className="h-4 w-4 shrink-0 text-blue-500 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
              />
            </svg>
            <div>
              <p className="text-xs font-medium text-blue-700">Legal Basis</p>
              <p className="text-xs text-blue-600">{step.legalBasis}</p>
            </div>
          </div>
        )}

        {/* Completed step info */}
        {isCompleted && (
          <div className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50/50 p-4 space-y-2">
            <p className="text-xs font-medium text-emerald-700">
              Completed {step.completedAt ? fmtDate(step.completedAt) : ""}
            </p>
            {step.outcome && (
              <div>
                <p className="text-xs text-emerald-600 font-medium">
                  Outcome
                </p>
                <p className="text-sm text-emerald-800">{step.outcome}</p>
              </div>
            )}
            {step.evidenceNotes && (
              <div>
                <p className="text-xs text-emerald-600 font-medium">
                  Evidence
                </p>
                <p className="text-sm text-emerald-800">
                  {step.evidenceNotes}
                </p>
              </div>
            )}
            {step.noticeMethod && (
              <p className="text-xs text-emerald-600">
                Notice sent via{" "}
                {step.noticeMethod.replace(/_/g, " ").toLowerCase()}
                {step.noticeSentAt ? ` on ${fmtDate(step.noticeSentAt)}` : ""}
              </p>
            )}
          </div>
        )}

        {/* Completion Form */}
        {canComplete && (
          <div className="space-y-4 border-t border-gray-100 pt-4">
            <p className="text-sm font-medium text-gray-900">
              Complete this step
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Outcome / Notes
              </label>
              <textarea
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                rows={3}
                placeholder="Describe what was done and the outcome of this step..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-turquoise focus:outline-none focus:ring-1 focus:ring-turquoise"
              />
            </div>
            {step.noticeType && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Notice Sent Via
                </label>
                <select
                  value={noticeMethod}
                  onChange={(e) => setNoticeMethod(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-turquoise focus:outline-none focus:ring-1 focus:ring-turquoise"
                >
                  <option value="">Select method...</option>
                  <option value="EMAIL">Email</option>
                  <option value="POST">Post</option>
                  <option value="REGISTERED_POST">Registered Post</option>
                  <option value="HAND_DELIVERY">Hand Delivery</option>
                </select>
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Evidence / Supporting Notes
              </label>
              <textarea
                value={evidenceNotes}
                onChange={(e) => setEvidenceNotes(e.target.value)}
                rows={2}
                placeholder="Reference any evidence or supporting documentation..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-turquoise focus:outline-none focus:ring-1 focus:ring-turquoise"
              />
            </div>
            <div className="flex justify-end">
              <Button
                variant="primary"
                onClick={handleCompleteStep}
                disabled={isPending}
              >
                {isPending
                  ? "Saving..."
                  : `Complete ${STEP_LABELS[step.stepType] ?? "Step"}`}
              </Button>
            </div>
          </div>
        )}

        {/* Future step message */}
        {!isCompleted && !isOnCurrentStep && (
          <div className="rounded-lg bg-gray-50 p-4 text-center">
            <p className="text-sm text-gray-400">
              This step will become available once the preceding steps are
              completed.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Payment Plan Panel ─────────────────────────────────────────

function PaymentPlanPanel({
  schemeId,
  caseId,
  lotId,
  totalOwed,
  paymentPlan,
  instalments,
  isClosed,
  isPending,
  startTransition,
  setError,
  setSuccess,
  clearMessages,
  router,
}: {
  schemeId: string;
  caseId: string;
  lotId: string;
  totalOwed: number;
  paymentPlan: PaymentPlan | null;
  instalments: Instalment[];
  isClosed: boolean;
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
  setError: (v: string | null) => void;
  setSuccess: (v: string | null) => void;
  clearMessages: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [showCreateForm, setShowCreateForm] = useState(false);

  function handleCreatePlan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    clearMessages();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createPaymentPlanAction(
        caseId,
        schemeId,
        lotId,
        formData,
      );
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess("Payment plan created");
        setShowCreateForm(false);
        router.refresh();
      }
    });
  }

  function handleRecordPayment(instalmentId: string, amount: number) {
    clearMessages();
    startTransition(async () => {
      const result = await recordInstalmentPaymentAction(
        instalmentId,
        caseId,
        schemeId,
        amount,
      );
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess("Payment recorded");
        router.refresh();
      }
    });
  }

  if (paymentPlan) {
    const paidCount = instalments.filter((i) => i.status === "PAID").length;
    const totalPaid = instalments
      .filter((i) => i.status === "PAID")
      .reduce((sum, i) => sum + (i.amountPaid ?? 0), 0);

    return (
      <Card>
        <CardHeader
          title="Payment Plan"
          description={`${paymentPlan.frequency.toLowerCase()} instalments`}
        />
        <div className="p-4 pt-0 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500">Per Instalment</p>
              <p className="text-sm font-semibold tabular-nums">
                {currency(paymentPlan.instalmentAmount)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Progress</p>
              <p className="text-sm font-semibold">
                {paidCount} / {paymentPlan.numberOfInstalments}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-turquoise transition-all"
              style={{
                width: `${(paidCount / paymentPlan.numberOfInstalments) * 100}%`,
              }}
            />
          </div>

          <p className="text-xs text-emerald-600 font-medium">
            {currency(totalPaid)} paid so far
          </p>

          {/* Instalments list */}
          <div className="divide-y divide-gray-100 border-t border-gray-100">
            {instalments.map((inst) => (
              <div
                key={inst.id}
                className="flex items-center justify-between py-2"
              >
                <div>
                  <p className="text-xs font-medium text-gray-900">
                    #{inst.instalmentNumber}
                  </p>
                  <p className="text-[10px] text-gray-500">
                    {fmtDate(inst.dueDate)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold tabular-nums">
                    {currency(inst.amount)}
                  </p>
                  {inst.status === "PAID" ? (
                    <StatusChip status="Paid" variant="success" />
                  ) : inst.status === "OVERDUE" ? (
                    <StatusChip status="Overdue" variant="danger" />
                  ) : !isClosed ? (
                    <button
                      onClick={() =>
                        handleRecordPayment(inst.id, inst.amount)
                      }
                      disabled={isPending}
                      className="text-[10px] font-medium text-turquoise hover:underline disabled:opacity-50"
                    >
                      Record
                    </button>
                  ) : (
                    <StatusChip status="Pending" variant="default" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  // No payment plan
  if (!showCreateForm) {
    return (
      <Card>
        <div className="p-4 text-center space-y-3">
          <p className="text-sm text-gray-500">No payment plan created.</p>
          {!isClosed && (
            <Button
              variant="secondary"
              onClick={() => setShowCreateForm(true)}
            >
              Create Plan
            </Button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Create Payment Plan" />
      <form onSubmit={handleCreatePlan} className="space-y-3 p-4 pt-0">
        <input type="hidden" name="totalAmount" value={totalOwed} />
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Instalment Amount
          </label>
          <input
            type="number"
            name="instalmentAmount"
            step="0.01"
            required
            placeholder="0.00"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-turquoise focus:outline-none focus:ring-1 focus:ring-turquoise"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Frequency
          </label>
          <select
            name="frequency"
            required
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-turquoise focus:outline-none focus:ring-1 focus:ring-turquoise"
          >
            <option value="WEEKLY">Weekly</option>
            <option value="FORTNIGHTLY">Fortnightly</option>
            <option value="MONTHLY">Monthly</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Start Date
          </label>
          <input
            type="date"
            name="startDate"
            required
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-turquoise focus:outline-none focus:ring-1 focus:ring-turquoise"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Number of Instalments
          </label>
          <input
            type="number"
            name="numberOfInstalments"
            min="1"
            required
            placeholder="12"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-turquoise focus:outline-none focus:ring-1 focus:ring-turquoise"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-700">
            <input type="checkbox" name="includesInterest" className="rounded" />
            Interest
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-700">
            <input type="checkbox" name="includesOngoing" className="rounded" />
            Ongoing levies
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-700">
            <input type="checkbox" name="interestWaived" className="rounded" />
            Waived
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="ghost"
            onClick={() => setShowCreateForm(false)}
            type="button"
          >
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isPending}>
            {isPending ? "Creating..." : "Create"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ─── Documents Panel ────────────────────────────────────────────

function DocumentsPanel({ documents }: { documents: Document[] }) {
  if (documents.length === 0) {
    return (
      <Card>
        <div className="p-4 text-center">
          <p className="text-sm text-gray-500">No documents yet.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Documents" />
      <div className="divide-y divide-gray-100">
        {documents.map((doc) => (
          <div key={doc.id} className="px-4 py-2.5">
            <p className="text-sm font-medium text-gray-900">{doc.title}</p>
            <p className="text-[10px] text-gray-500">
              {doc.documentType.replace(/_/g, " ")} — {fmtDate(doc.createdAt)}
            </p>
            <div className="mt-1">
              {doc.isDraft ? (
                <StatusChip status="Draft" variant="warning" />
              ) : (
                <StatusChip status="Issued" variant="success" />
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Activity Panel ─────────────────────────────────────────────

function ActivityPanel({
  schemeId,
  caseId,
  activities,
  isPending,
  startTransition,
  setError,
  setSuccess,
  clearMessages,
  router,
}: {
  schemeId: string;
  caseId: string;
  activities: Activity[];
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
  setError: (v: string | null) => void;
  setSuccess: (v: string | null) => void;
  clearMessages: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [note, setNote] = useState("");

  function handleAddNote() {
    if (!note.trim()) return;
    clearMessages();
    startTransition(async () => {
      const result = await addDebtRecoveryNoteAction(caseId, schemeId, note);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess("Note added");
        setNote("");
        router.refresh();
      }
    });
  }

  const ACTIVITY_ICONS: Record<string, string> = {
    CASE_OPENED: "\u{1F4C2}",
    STATUS_CHANGED: "\u{1F504}",
    STEP_ADVANCED: "✅",
    PAYMENT_PLAN_CREATED: "\u{1F4C5}",
    PAYMENT_RECEIVED: "\u{1F4B0}",
    NOTE_ADDED: "\u{1F4DD}",
    DOCUMENT_ADDED: "\u{1F4C4}",
    CASE_CLOSED: "\u{1F512}",
  };

  return (
    <div className="space-y-3">
      {/* Add Note */}
      <Card>
        <div className="p-4 space-y-2">
          <p className="text-sm font-medium text-gray-900">Add Note</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note..."
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-turquoise focus:outline-none focus:ring-1 focus:ring-turquoise"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isPending) handleAddNote();
              }}
            />
            <Button
              variant="primary"
              onClick={handleAddNote}
              disabled={isPending || !note.trim()}
            >
              {isPending ? "..." : "Add"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Activity Log */}
      <Card>
        <CardHeader title="Activity Log" />
        {activities.length === 0 ? (
          <div className="p-4 pt-0 text-center text-sm text-gray-500">
            No activity yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
            {activities.map((activity) => (
              <div key={activity.id} className="flex gap-2 px-4 py-2.5">
                <span className="text-sm shrink-0">
                  {ACTIVITY_ICONS[activity.activityType] ?? "•"}
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-gray-900">
                    {activity.description}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {fmtDateTime(activity.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Close Case Panel ───────────────────────────────────────────

function CloseCasePanel({
  schemeId,
  debtCase,
  isPending,
  startTransition,
  setError,
  setSuccess,
  clearMessages,
  router,
}: {
  schemeId: string;
  debtCase: DebtCase;
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
  setError: (v: string | null) => void;
  setSuccess: (v: string | null) => void;
  clearMessages: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [closeStatus, setCloseStatus] = useState("CLOSED_PAID");
  const [closeReason, setCloseReason] = useState("");

  function handleClose() {
    if (!closeReason.trim()) {
      setError("Please provide a reason for closing");
      return;
    }
    clearMessages();
    startTransition(async () => {
      const result = await closeDebtRecoveryCaseAction(
        debtCase.id,
        schemeId,
        closeReason,
        closeStatus as "CLOSED_PAID" | "CLOSED_WRITTEN_OFF" | "CLOSED_SETTLED",
      );
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess("Case closed successfully");
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader
        title="Close Case"
        description="Close this recovery case"
      />
      <div className="p-4 pt-0 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Reason
          </label>
          <select
            value={closeStatus}
            onChange={(e) => setCloseStatus(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-turquoise focus:outline-none focus:ring-1 focus:ring-turquoise"
          >
            <option value="CLOSED_PAID">Debt Paid in Full</option>
            <option value="CLOSED_SETTLED">Settled</option>
            <option value="CLOSED_WRITTEN_OFF">Written Off</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Details
          </label>
          <textarea
            value={closeReason}
            onChange={(e) => setCloseReason(e.target.value)}
            rows={3}
            placeholder="Provide details..."
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-turquoise focus:outline-none focus:ring-1 focus:ring-turquoise"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="danger"
            onClick={handleClose}
            disabled={isPending}
          >
            {isPending ? "Closing..." : "Confirm Close"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
