"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusChip } from "@/components/ui/status-chip";

type ChipStatus = "default" | "success" | "warning" | "danger";
import {
  updateDebtRecoveryCaseAction,
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
  CLOSED_PAID: { label: "Closed — Paid", variant: "success" },
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

const TABS = ["Overview", "Recovery Steps", "Payment Plan", "Documents", "Activity"] as const;
type Tab = (typeof TABS)[number];

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
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      <PageHeader
        title={debtCase.caseNumber}
        description={`Lot ${lotNumber}${unitNumber ? ` (Unit ${unitNumber})` : ""} — ${ownerName}`}
        backHref={`/adviser/schemes/${schemeId}/finance/debt-recovery`}
        backLabel="Back to debt recovery"
        action={
          !isClosed ? (
            <div className="flex items-center gap-2">
              <StatusChip status={statusInfo.label} variant={statusInfo.variant} />
            </div>
          ) : (
            <StatusChip status={statusInfo.label} variant={statusInfo.variant} />
          )
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

      {/* Tab Navigation */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              clearMessages();
            }}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "Overview" && (
        <OverviewTab
          schemeId={schemeId}
          debtCase={debtCase}
          isClosed={isClosed}
          isPending={isPending}
          startTransition={startTransition}
          setError={setError}
          setSuccess={setSuccess}
          clearMessages={clearMessages}
          router={router}
        />
      )}

      {activeTab === "Recovery Steps" && (
        <StepsTab
          schemeId={schemeId}
          caseId={debtCase.id}
          steps={steps}
          currentStep={debtCase.currentStep}
          isClosed={isClosed}
          isPending={isPending}
          startTransition={startTransition}
          setError={setError}
          setSuccess={setSuccess}
          clearMessages={clearMessages}
          router={router}
        />
      )}

      {activeTab === "Payment Plan" && (
        <PaymentPlanTab
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

      {activeTab === "Documents" && (
        <DocumentsTab documents={documents} />
      )}

      {activeTab === "Activity" && (
        <ActivityTab
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
    </div>
  );
}

// ─── Overview Tab ───────────────────────────────────────────────

function OverviewTab({
  schemeId,
  debtCase,
  isClosed,
  isPending,
  startTransition,
  setError,
  setSuccess,
  clearMessages,
  router,
}: {
  schemeId: string;
  debtCase: DebtCase;
  isClosed: boolean;
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
  setError: (v: string | null) => void;
  setSuccess: (v: string | null) => void;
  clearMessages: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [closeStatus, setCloseStatus] = useState<string>("CLOSED_PAID");
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
    <div className="space-y-4">
      {/* Financial Summary */}
      <Card>
        <CardHeader title="Financial Summary" />
        <div className="grid grid-cols-2 gap-4 p-4 pt-0 sm:grid-cols-4">
          <div>
            <p className="text-xs text-gray-500">Principal</p>
            <p className="text-lg font-semibold text-gray-900">
              {currency(debtCase.principalOwed)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Interest</p>
            <p className="text-lg font-semibold text-gray-900">
              {currency(debtCase.interestOwed)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Costs</p>
            <p className="text-lg font-semibold text-gray-900">
              {currency(debtCase.costsOwed)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Owing</p>
            <p className="text-lg font-semibold text-turquoise">
              {currency(debtCase.totalOwed)}
            </p>
          </div>
        </div>
      </Card>

      {/* Case Details */}
      <Card>
        <CardHeader title="Case Details" />
        <div className="space-y-3 p-4 pt-0">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">Current Step</p>
              <p className="text-sm font-medium text-gray-900">
                {STEP_LABELS[debtCase.currentStep] ?? debtCase.currentStep}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Priority</p>
              <p className="text-sm font-medium text-gray-900">
                {debtCase.priority}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Opened</p>
              <p className="text-sm text-gray-900">
                {fmtDate(debtCase.createdAt)}
              </p>
            </div>
            {debtCase.closedAt && (
              <div>
                <p className="text-xs text-gray-500">Closed</p>
                <p className="text-sm text-gray-900">
                  {fmtDate(debtCase.closedAt)}
                </p>
              </div>
            )}
          </div>

          {debtCase.solicitorName && (
            <div>
              <p className="text-xs text-gray-500">Solicitor</p>
              <p className="text-sm text-gray-900">
                {debtCase.solicitorName}
                {debtCase.solicitorRef ? ` (Ref: ${debtCase.solicitorRef})` : ""}
              </p>
            </div>
          )}

          {debtCase.courtFileNumber && (
            <div>
              <p className="text-xs text-gray-500">Court File Number</p>
              <p className="text-sm text-gray-900">
                {debtCase.courtFileNumber}
              </p>
            </div>
          )}

          {debtCase.notes && (
            <div>
              <p className="text-xs text-gray-500">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {debtCase.notes}
              </p>
            </div>
          )}

          {debtCase.closedReason && (
            <div>
              <p className="text-xs text-gray-500">Closure Reason</p>
              <p className="text-sm text-gray-700">{debtCase.closedReason}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Close Case */}
      {!isClosed && (
        <Card>
          <CardHeader
            title="Close Case"
            description="Close this recovery case when the debt has been resolved"
          />
          <div className="p-4 pt-0">
            {!showCloseForm ? (
              <Button
                variant="secondary"
                onClick={() => setShowCloseForm(true)}
              >
                Close Case
              </Button>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Close Reason
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
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Details
                  </label>
                  <textarea
                    value={closeReason}
                    onChange={(e) => setCloseReason(e.target.value)}
                    rows={3}
                    placeholder="Provide details on why this case is being closed..."
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-turquoise focus:outline-none focus:ring-1 focus:ring-turquoise"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setShowCloseForm(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    onClick={handleClose}
                    disabled={isPending}
                  >
                    {isPending ? "Closing..." : "Confirm Close"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Steps Tab ──────────────────────────────────────────────────

function StepsTab({
  schemeId,
  caseId,
  steps,
  currentStep,
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
  steps: Step[];
  currentStep: string;
  isClosed: boolean;
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
  setError: (v: string | null) => void;
  setSuccess: (v: string | null) => void;
  clearMessages: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [outcome, setOutcome] = useState("");
  const [evidenceNotes, setEvidenceNotes] = useState("");
  const [noticeMethod, setNoticeMethod] = useState("");

  function handleCompleteStep(step: Step) {
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
        setSuccess("Step completed");
        setExpandedStep(null);
        setOutcome("");
        setEvidenceNotes("");
        setNoticeMethod("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      {steps.map((step) => {
        const isCurrentStep = step.stepType === currentStep;
        const isCompleted = step.status === "COMPLETED";
        const isExpanded = expandedStep === step.id;

        return (
          <Card
            key={step.id}
            className={isCurrentStep ? "ring-2 ring-turquoise" : ""}
          >
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isCompleted
                        ? "bg-emerald-100 text-emerald-700"
                        : isCurrentStep
                          ? "bg-turquoise text-white"
                          : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {isCompleted ? "✓" : step.stepOrder}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {STEP_LABELS[step.stepType] ?? step.stepType}
                    </p>
                    <p className="mt-0.5 text-sm text-gray-500">
                      {step.actionRequired}
                    </p>
                    {step.legalBasis && (
                      <p className="mt-1 text-xs text-gray-400">
                        Legal basis: {step.legalBasis}
                      </p>
                    )}
                    {step.completedAt && (
                      <p className="mt-1 text-xs text-emerald-600">
                        Completed {fmtDate(step.completedAt)}
                        {step.outcome ? ` — ${step.outcome}` : ""}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
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
                  {isCurrentStep && !isClosed && !isCompleted && (
                    <Button
                      variant="primary"
                      onClick={() =>
                        setExpandedStep(isExpanded ? null : step.id)
                      }
                    >
                      {isExpanded ? "Cancel" : "Complete"}
                    </Button>
                  )}
                </div>
              </div>

              {/* Completion Form */}
              {isExpanded && (
                <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Outcome / Notes
                    </label>
                    <textarea
                      value={outcome}
                      onChange={(e) => setOutcome(e.target.value)}
                      rows={2}
                      placeholder="Describe the outcome of this step..."
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
                      onClick={() => handleCompleteStep(step)}
                      disabled={isPending}
                    >
                      {isPending ? "Saving..." : "Mark Complete"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Payment Plan Tab ───────────────────────────────────────────

function PaymentPlanTab({
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
      <div className="space-y-4">
        <Card>
          <CardHeader
            title="Payment Plan"
            description={`${paymentPlan.frequency.toLowerCase()} instalments`}
          />
          <div className="grid grid-cols-2 gap-4 p-4 pt-0 sm:grid-cols-4">
            <div>
              <p className="text-xs text-gray-500">Total Amount</p>
              <p className="text-sm font-semibold">{currency(paymentPlan.totalAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Per Instalment</p>
              <p className="text-sm font-semibold">
                {currency(paymentPlan.instalmentAmount)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Progress</p>
              <p className="text-sm font-semibold">
                {paidCount} / {paymentPlan.numberOfInstalments}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Paid So Far</p>
              <p className="text-sm font-semibold text-emerald-600">
                {currency(totalPaid)}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="px-4 pb-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-turquoise transition-all"
                style={{
                  width: `${(paidCount / paymentPlan.numberOfInstalments) * 100}%`,
                }}
              />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Instalments" />
          <div className="divide-y divide-gray-100">
            {instalments.map((inst) => (
              <div
                key={inst.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    Instalment {inst.instalmentNumber}
                  </p>
                  <p className="text-xs text-gray-500">
                    Due {fmtDate(inst.dueDate)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-semibold">{currency(inst.amount)}</p>
                  {inst.status === "PAID" ? (
                    <StatusChip status="Paid" variant="success" />
                  ) : inst.status === "OVERDUE" ? (
                    <StatusChip status="Overdue" variant="danger" />
                  ) : !isClosed ? (
                    <Button
                      variant="secondary"
                      onClick={() => handleRecordPayment(inst.id, inst.amount)}
                      disabled={isPending}
                    >
                      {isPending ? "..." : "Record Payment"}
                    </Button>
                  ) : (
                    <StatusChip status="Pending" variant="default" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  // No payment plan yet
  return (
    <div className="space-y-4">
      {!showCreateForm ? (
        <Card>
          <div className="p-6 text-center">
            <p className="text-sm text-gray-500">
              No payment plan has been created for this case.
            </p>
            {!isClosed && (
              <Button
                variant="primary"
                className="mt-4"
                onClick={() => setShowCreateForm(true)}
              >
                Create Payment Plan
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="Create Payment Plan"
            description="Set up an instalment plan for the lot owner"
          />
          <form onSubmit={handleCreatePlan} className="space-y-4 p-4 pt-0">
            <input type="hidden" name="totalAmount" value={totalOwed} />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
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
                <label className="mb-1 block text-sm font-medium text-gray-700">
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
                <label className="mb-1 block text-sm font-medium text-gray-700">
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
                <label className="mb-1 block text-sm font-medium text-gray-700">
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
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" name="includesInterest" className="rounded" />
                Includes interest
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" name="includesOngoing" className="rounded" />
                Includes ongoing levies
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" name="interestWaived" className="rounded" />
                Interest waived
              </label>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Conditions (optional)
              </label>
              <textarea
                name="conditions"
                rows={2}
                placeholder="Any conditions or terms for this plan..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-turquoise focus:outline-none focus:ring-1 focus:ring-turquoise"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setShowCreateForm(false)}
                type="button"
              >
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={isPending}>
                {isPending ? "Creating..." : "Create Plan"}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}

// ─── Documents Tab ──────────────────────────────────────────────

function DocumentsTab({ documents }: { documents: Document[] }) {
  if (documents.length === 0) {
    return (
      <Card>
        <div className="p-6 text-center">
          <p className="text-sm text-gray-500">
            No documents have been generated for this case yet.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Documents" />
      <div className="divide-y divide-gray-100">
        {documents.map((doc) => (
          <div key={doc.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-900">{doc.title}</p>
              <p className="text-xs text-gray-500">
                {doc.documentType.replace(/_/g, " ")} — Created{" "}
                {fmtDate(doc.createdAt)}
              </p>
            </div>
            <div className="flex items-center gap-2">
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

// ─── Activity Tab ───────────────────────────────────────────────

function ActivityTab({
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
    <div className="space-y-4">
      {/* Add Note */}
      <Card>
        <CardHeader title="Add Note" />
        <div className="flex gap-2 p-4 pt-0">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note to the activity log..."
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
      </Card>

      {/* Activity Timeline */}
      <Card>
        <CardHeader title="Activity Log" />
        {activities.length === 0 ? (
          <div className="p-4 pt-0 text-center text-sm text-gray-500">
            No activity recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {activities.map((activity) => (
              <div key={activity.id} className="flex gap-3 px-4 py-3">
                <span className="mt-0.5 text-base">
                  {ACTIVITY_ICONS[activity.activityType] ?? "•"}
                </span>
                <div className="flex-1">
                  <p className="text-sm text-gray-900">
                    {activity.description}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
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
