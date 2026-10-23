"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormField, SelectField, TextareaField } from "@/components/ui/form-field";
import { reallocateLevyReceiptAction, reverseLevyReceiptAction } from "../../actions";

type Reason = "WRONG_LOT" | "DISHONOURED" | "ENTERED_IN_ERROR";

const aud = (cents: number) => (cents / 100).toLocaleString("en-AU", { style: "currency", currency: "AUD" });
const toCents = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) ? 0 : Math.round(Number(s) * 100));

/** Reverse or move a levy receipt with its notices (TC-003, TC-008). */
export function LevyReceiptPanel({
  schemeId,
  entryId,
  totalCents,
  payments,
  problems,
  notices,
  expenseAccounts,
}: {
  schemeId: string;
  entryId: string;
  totalCents: number;
  payments: Array<{ id: string; label: string; amountCents: number }>;
  problems: Record<Reason, string | null>;
  notices: Array<{ id: string; label: string }>;
  expenseAccounts: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<Reason | "">("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [fee, setFee] = useState("");
  const [feeAccount, setFeeAccount] = useState(expenseAccounts[0]?.id ?? "");
  const [rows, setRows] = useState<Array<{ levyNoticeId: string; amount: string }>>([{ levyNoticeId: "", amount: (totalCents / 100).toFixed(2) }]);
  const [confirmOver, setConfirmOver] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  const blocked = reason ? problems[reason] : null;
  const submit = () =>
    start(async () => {
      setError(null);
      const r =
        reason === "WRONG_LOT"
          ? await reallocateLevyReceiptAction(
              schemeId,
              entryId,
              rows.map((x) => ({ levyNoticeId: x.levyNoticeId, amountCents: toCents(x.amount) })),
              confirmOver,
              note,
            )
          : await reverseLevyReceiptAction(schemeId, entryId, {
              reason: reason as Reason,
              note,
              reversalDate: date,
              feeCents: reason === "DISHONOURED" ? toCents(fee) : 0,
              feeAccountCodeId: feeAccount,
            });
      if (r.error) {
        setError(r.error);
        if (r.data && (r.data as { overpayment?: boolean }).overpayment) setNeedsConfirm(true);
        return;
      }
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <ul className="text-sm text-ink">
        {payments.map((p) => (
          <li key={p.id} className="flex justify-between gap-4 border-b border-line/50 py-1">
            <span>{p.label}</span>
            <span className="tabular-nums">{aud(p.amountCents)}</span>
          </li>
        ))}
      </ul>
      {error && <div className="rounded-[var(--radius-card)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <SelectField
        label="What happened?"
        name="reason"
        value={reason}
        onChange={(e) => setReason(e.target.value as Reason | "")}
        options={[
          { value: "", label: "Choose..." },
          { value: "WRONG_LOT", label: "It belongs to another lot: move it" },
          { value: "DISHONOURED", label: "The bank dishonoured or reversed it" },
          { value: "ENTERED_IN_ERROR", label: "It was entered in error" },
        ]}
      />
      {blocked && <p className="text-sm text-amber-700">{blocked}</p>}

      {reason === "WRONG_LOT" && !blocked && (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            The receipt is reversed off its current notice and receipted, on the same date and against the same bank transaction, to the notices below. They must add up to {aud(totalCents)}.
          </p>
          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
              <SelectField
                label="Notice"
                name={`notice-${i}`}
                value={row.levyNoticeId}
                onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, levyNoticeId: e.target.value } : r)))}
                options={[{ value: "", label: "Choose..." }, ...notices.map((n) => ({ value: n.id, label: n.label }))]}
              />
              <FormField label="Amount ($)" name={`amount-${i}`} type="number" step="0.01" min="0" value={row.amount} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, amount: e.target.value } : r)))} />
              {rows.length > 1 && (
                <button type="button" className="pb-2 text-xs text-ink-muted underline" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                  Remove
                </button>
              )}
            </div>
          ))}
          <button type="button" className="text-xs text-turquoise underline" onClick={() => setRows([...rows, { levyNoticeId: "", amount: "" }])}>
            Add another notice
          </button>
          {needsConfirm && (
            <label className="flex items-start gap-2 text-sm text-ink">
              <input type="checkbox" checked={confirmOver} onChange={(e) => setConfirmOver(e.target.checked)} className="mt-0.5 h-4 w-4" />
              Hold the part above what the notice owes as the owner&apos;s credit.
            </label>
          )}
        </div>
      )}

      {reason === "DISHONOURED" && !blocked && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label="Dishonour date" name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} helpText="The date on the bank statement. Defaults to today." />
          <FormField label="Bank dishonour fee ($)" name="fee" type="number" step="0.01" min="0" value={fee} onChange={(e) => setFee(e.target.value)} helpText="Recorded as its own expense entry." />
          <SelectField label="Fee account" name="feeAccount" value={feeAccount} onChange={(e) => setFeeAccount(e.target.value)} options={expenseAccounts.map((a) => ({ value: a.id, label: a.label }))} />
        </div>
      )}

      {reason && !blocked && (
        <>
          <TextareaField label="Note (shown on the owner's statement for a dishonour)" name="note" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button type="button" disabled={pending} onClick={submit}>
            {pending ? "Working..." : reason === "WRONG_LOT" ? "Move the receipt" : "Reverse the receipt"}
          </Button>
        </>
      )}
    </div>
  );
}
