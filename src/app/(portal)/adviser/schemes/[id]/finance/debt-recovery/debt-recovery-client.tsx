"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";

type ChipStatus = "default" | "success" | "warning" | "danger";
import { EmptyState } from "@/components/ui/empty-state";
import { initiateDebtRecoveryAction } from "@/lib/actions/debt-recovery";

type CaseRow = {
  id: string;
  caseNumber: string;
  lotId: string;
  ownerId: string;
  status: string;
  priority: string;
  totalOwed: number;
  currentStep: string;
  createdAt: string;
};

type LotWithOwner = {
  id: string;
  lotNumber: string;
  unitNumber: string | null;
  ownerId: string | null;
  ownerName: string | null;
};

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

export function DebtRecoveryListClient({
  schemeId,
  cases,
  lotsWithOwners,
}: {
  schemeId: string;
  cases: CaseRow[];
  lotsWithOwners: LotWithOwner[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [showInitiateForm, setShowInitiateForm] = useState(false);
  const [selectedLotId, setSelectedLotId] = useState("");

  const filteredCases =
    statusFilter === "ALL"
      ? cases
      : statusFilter === "ACTIVE"
        ? cases.filter(
            (c) =>
              !["CLOSED_PAID", "CLOSED_WRITTEN_OFF", "CLOSED_SETTLED"].includes(
                c.status,
              ),
          )
        : cases.filter((c) => c.status === statusFilter);

  const selectedLot = lotsWithOwners.find((l) => l.id === selectedLotId);

  function handleInitiate() {
    if (!selectedLot?.ownerId) return;
    setError(null);
    startTransition(async () => {
      const result = await initiateDebtRecoveryAction(
        schemeId,
        selectedLot.id,
        selectedLot.ownerId!,
        "ADVISER",
      );
      if (result.error) {
        setError(result.error);
      } else {
        setShowInitiateForm(false);
        setSelectedLotId("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Filters and Actions */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600">
              Filter:
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-turquoise focus:outline-none focus:ring-1 focus:ring-turquoise"
            >
              <option value="ALL">All Cases</option>
              <option value="ACTIVE">Active Only</option>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="PAYMENT_PLAN">Payment Plan</option>
              <option value="REFERRED_LEGAL">Legal Referral</option>
              <option value="CLOSED_PAID">Closed (Paid)</option>
            </select>
          </div>
          <Button
            variant="primary"
            onClick={() => setShowInitiateForm(!showInitiateForm)}
          >
            {showInitiateForm ? "Cancel" : "Initiate Recovery"}
          </Button>
        </div>
      </Card>

      {/* Initiate Form */}
      {showInitiateForm && (
        <Card>
          <CardHeader
            title="Initiate Debt Recovery"
            description="Select a lot with overdue levies to begin the recovery process"
          />
          <div className="space-y-4 p-4 pt-0">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Select Lot
              </label>
              <select
                value={selectedLotId}
                onChange={(e) => setSelectedLotId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-turquoise focus:outline-none focus:ring-1 focus:ring-turquoise"
              >
                <option value="">Choose a lot...</option>
                {lotsWithOwners
                  .filter((l) => l.ownerId)
                  .map((lot) => (
                    <option key={lot.id} value={lot.id}>
                      Lot {lot.lotNumber}
                      {lot.unitNumber ? ` (Unit ${lot.unitNumber})` : ""} —{" "}
                      {lot.ownerName || "Unknown owner"}
                    </option>
                  ))}
              </select>
            </div>

            {selectedLot && !selectedLot.ownerId && (
              <p className="text-sm text-amber-600">
                This lot has no registered owner. An owner must be assigned
                before recovery can be initiated.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowInitiateForm(false);
                  setSelectedLotId("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleInitiate}
                disabled={!selectedLot?.ownerId || isPending}
              >
                {isPending ? "Initiating..." : "Start Recovery"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Case List */}
      {filteredCases.length === 0 ? (
        <EmptyState
          title="No debt recovery cases"
          description={
            statusFilter === "ALL"
              ? "No recovery cases have been initiated yet. Use the button above to start a new case."
              : "No cases match the selected filter."
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredCases.map((c) => {
            const statusInfo = STATUS_MAP[c.status] ?? {
              label: c.status,
              variant: "default" as ChipStatus,
            };
            return (
              <Link
                key={c.id}
                href={`/adviser/schemes/${schemeId}/finance/debt-recovery/${c.id}`}
              >
                <Card className="cursor-pointer transition-shadow hover:shadow-md">
                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-gray-900">
                          {c.caseNumber}
                        </span>
                        <StatusChip
                          status={statusInfo.label}
                          variant={statusInfo.variant}
                        />
                        {c.priority === "HIGH" && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                            High Priority
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">
                        Current step:{" "}
                        {STEP_LABELS[c.currentStep] ?? c.currentStep}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-gray-900">
                        {formatCurrency(c.totalOwed)}
                      </p>
                      <p className="text-xs text-gray-500">
                        Opened {formatDate(c.createdAt)}
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
