"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField, TextareaField } from "@/components/ui/form-field";
import { StatusChip } from "@/components/ui/status-chip";
import {
  changeClaimStatusAction,
  lodgeClaimAction,
  updateClaimManagementAction,
  addClaimNoteAction,
  uploadClaimEvidenceAction,
  getClaimDocumentUrlAction,
  type ClaimFormState,
} from "../actions";
import { CLAIM_STATUS_LABELS } from "@/lib/insurance/constants";
import { formatMoney } from "@/lib/insurance/premium";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export interface EvidenceDoc {
  id: string;
  title: string;
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
}

export interface ManagementDefaults {
  insurerClaimRef: string;
  claimedAmount: string;
  approvedAmount: string;
  paidAmount: string;
  excessAmount: string;
  assessorDetails: string;
  contractorDetails: string;
  settlementDetails: string;
  decisionReason: string;
}

export function ClaimWorkspace({
  schemeId,
  claimId,
  status,
  allowedTransitions,
  lodged,
  management,
  evidence,
}: {
  schemeId: string;
  claimId: string;
  status: string;
  allowedTransitions: string[];
  lodged: {
    at: string;
    channel: string | null;
    recipient: string | null;
    reference: string | null;
  } | null;
  management: ManagementDefaults;
  evidence: EvidenceDoc[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [statusNote, setStatusNote] = useState("");

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  // Lodgement form
  const [lodgeState, lodgeAction, lodgePending] = useActionState<
    ClaimFormState,
    FormData
  >(lodgeClaimAction.bind(null, schemeId, claimId), {});

  // Management form
  const [mgmtState, mgmtAction, mgmtPending] = useActionState<
    ClaimFormState,
    FormData
  >(updateClaimManagementAction.bind(null, schemeId, claimId), {});

  // Evidence upload
  const fileRef = useRef<HTMLInputElement>(null);
  async function uploadEvidence(files: File[]) {
    setError(null);
    for (const f of files) {
      const fd = new FormData();
      fd.set("file", f);
      fd.set("category", "CLAIM_EVIDENCE");
      const res = await uploadClaimEvidenceAction(schemeId, claimId, fd);
      if (res.error) setError(res.error);
    }
    start(() => router.refresh());
  }
  async function download(fileUrl: string) {
    const res = await getClaimDocumentUrlAction(schemeId, fileUrl);
    if (res.url) window.open(res.url, "_blank", "noopener");
    else setError(res.error ?? "Could not open the document.");
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Status */}
      <Card>
        <CardHeader
          title="Status"
          description="Internal administrative progress. The insurer's coverage decision is recorded separately below."
        />
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <StatusChip status={CLAIM_STATUS_LABELS[status] ?? status} />
        </div>
        {allowedTransitions.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {allowedTransitions.map((to) => (
                <Button
                  key={to}
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      changeClaimStatusAction(schemeId, claimId, to, statusNote),
                    )
                  }
                >
                  {CLAIM_STATUS_LABELS[to] ?? to}
                </Button>
              ))}
            </div>
            <input
              className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm"
              placeholder="Optional note for this status change"
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
            />
          </div>
        ) : (
          <p className="text-sm text-ink-muted">This claim is in a final state.</p>
        )}
      </Card>

      {/* Lodgement */}
      <Card>
        <CardHeader
          title="Lodgement"
          description="Recording lodgement captures a real submission to the insurer or broker. It does not transmit anything; there is no insurer integration."
        />
        {lodged ? (
          <div className="text-sm text-ink space-y-1">
            <p>
              Lodged {fmtDate(lodged.at)}
              {lodged.recipient ? ` with ${lodged.recipient}` : ""}
              {lodged.channel ? ` via ${lodged.channel}` : ""}.
            </p>
            {lodged.reference && (
              <p className="text-ink-muted">Reference: {lodged.reference}</p>
            )}
          </div>
        ) : status === "DRAFT" ? (
          <form action={lodgeAction} className="space-y-3">
            {lodgeState.error && (
              <p className="text-sm text-red-600">{lodgeState.error}</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Lodged on" name="lodgedAt" type="date" required />
              <FormField label="Recipient (insurer / broker)" name="lodgedRecipient" />
              <FormField label="Channel" name="lodgedChannel" placeholder="e.g. Broker portal, email" />
              <FormField label="Reference" name="lodgedReference" />
            </div>
            <Button type="submit" variant="primary" disabled={lodgePending}>
              {lodgePending ? "Recording..." : "Record lodgement"}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-ink-muted">
            Lodgement was not recorded while this claim was a draft.
          </p>
        )}
      </Card>

      {/* Evidence */}
      <Card>
        <CardHeader
          title="Supporting evidence"
          description="Photos, reports, quotes, invoices and correspondence."
        />
        <div className="mb-3">
          <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
            Add evidence
          </Button>
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              uploadEvidence(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>
        {evidence.length === 0 ? (
          <p className="text-sm text-ink-muted">No evidence attached yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {evidence.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 text-sm border-b border-line/60 pb-1.5"
              >
                <span className="text-ink truncate">
                  {d.fileName}
                  <span className="text-ink-muted"> · {fmtDate(d.uploadedAt)}</span>
                </span>
                <button
                  type="button"
                  className="text-turquoise text-xs hover:underline"
                  onClick={() => download(d.fileUrl)}
                >
                  Download
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Management */}
      <Card>
        <CardHeader
          title="Claim management"
          description="Insurer reference, assessor and contractor, amounts, settlement and the insurer's decision."
        />
        <form action={mgmtAction} className="space-y-4">
          {mgmtState.error && <p className="text-sm text-red-600">{mgmtState.error}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Insurer claim reference" name="insurerClaimRef" defaultValue={management.insurerClaimRef} />
            <FormField label="Assessor details" name="assessorDetails" defaultValue={management.assessorDetails} />
            <FormField label="Contractor details" name="contractorDetails" defaultValue={management.contractorDetails} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <FormField label="Claimed ($)" name="claimedAmount" type="number" step="0.01" defaultValue={management.claimedAmount} />
            <FormField label="Approved ($)" name="approvedAmount" type="number" step="0.01" defaultValue={management.approvedAmount} />
            <FormField label="Paid ($)" name="paidAmount" type="number" step="0.01" defaultValue={management.paidAmount} />
            <FormField label="Excess ($)" name="excessAmount" type="number" step="0.01" defaultValue={management.excessAmount} />
          </div>
          <TextareaField label="Settlement details" name="settlementDetails" rows={2} defaultValue={management.settlementDetails} />
          <TextareaField label="Decision / closure reason" name="decisionReason" rows={2} defaultValue={management.decisionReason} />
          <Button type="submit" variant="primary" disabled={mgmtPending}>
            {mgmtPending ? "Saving..." : "Save claim details"}
          </Button>
        </form>
        {(management.claimedAmount || management.approvedAmount || management.paidAmount) && (
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            {management.claimedAmount && (
              <span>Claimed: <span className="font-medium tabular-nums">{formatMoney(management.claimedAmount)}</span></span>
            )}
            {management.approvedAmount && (
              <span>Approved: <span className="font-medium tabular-nums">{formatMoney(management.approvedAmount)}</span></span>
            )}
            {management.paidAmount && (
              <span>Paid: <span className="font-medium tabular-nums">{formatMoney(management.paidAmount)}</span></span>
            )}
          </div>
        )}
      </Card>

      {/* Add note */}
      <Card>
        <CardHeader title="Add a note" />
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm"
            placeholder="Add a note to the claim timeline"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={pending || !note.trim()}
            onClick={() =>
              run(async () => {
                const res = await addClaimNoteAction(schemeId, claimId, note);
                if (!res.error) setNote("");
                return res;
              })
            }
          >
            Add
          </Button>
        </div>
      </Card>
    </div>
  );
}
