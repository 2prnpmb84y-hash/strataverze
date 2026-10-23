"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FeeDisclosure, useTransactionFeeView, type TransactionFeeTable } from "@/components/billing/fee-disclosure";
import {
  allocateTransactionAction,
  clearSuspenseAction,
  postToSuspenseAction,
  receiptDepositAction,
} from "@/lib/actions/reconciliation";
import { excludeTransactionAction, reconcileTransactionAction, unmatchTransactionAction } from "../actions";

export interface TxnRow {
  id: string;
  date: string;
  amountCents: number;
  description: string;
  reference: string | null;
  allocatedCents: number;
  status: string;
  hasSuspense: boolean;
  allocations: { label: string; amountCents: number }[];
}
export interface CandidateRow {
  id: string;
  entryNumber: string;
  date: string;
  description: string;
  bankSideCents: number;
  remainingCents: number;
}
export interface NoticeRow {
  id: string;
  noticeNumber: string;
  lotNumber: string;
  ownerName: string;
  fundName: string;
  dueDate: string;
  owingCents: number;
}
export interface SuspenseRowView {
  id: string;
  date: string;
  amountCents: number;
  description: string;
}
export interface AccountOption {
  id: string;
  label: string;
}

const aud = (cents: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);
const day = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const input = "rounded-[var(--radius-card)] border border-line bg-white px-2 py-1.5 text-sm text-ink";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ error?: string; success?: boolean }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.error) setError(r.error);
      else {
        after?.();
        router.refresh();
      }
    });
  return { pending, error, run };
}

/** Amount inputs keyed by row id, in dollars as typed. */
function useAmounts() {
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const totalCents = Object.values(amounts).reduce((s, v) => s + Math.round((parseFloat(v) || 0) * 100), 0);
  const rows = Object.entries(amounts)
    .map(([id, v]) => ({ id, amount: parseFloat(v) || 0 }))
    .filter((r) => r.amount > 0);
  return { amounts, setAmount: (id: string, v: string) => setAmounts((a) => ({ ...a, [id]: v })), totalCents, rows, reset: () => setAmounts({}) };
}

function AllocatePanel({
  schemeId,
  txn,
  candidates,
  notices,
  feeTable,
  onDone,
}: {
  schemeId: string;
  txn: TxnRow;
  candidates: CandidateRow[];
  notices: NoticeRow[];
  feeTable: TransactionFeeTable | null;
  onDone: () => void;
}) {
  const isDeposit = txn.amountCents > 0;
  const leftCents = Math.abs(txn.amountCents) - txn.allocatedCents;
  const [mode, setMode] = useState<"ENTRIES" | "NOTICES" | "SUSPENSE">(isDeposit ? "NOTICES" : "ENTRIES");
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [creditOk, setCreditOk] = useState(false);
  const [feeOk, setFeeOk] = useState(false);
  const entryAmounts = useAmounts();
  const noticeAmounts = useAmounts();
  const { pending, error, run } = useRun();
  const fee = useTransactionFeeView(feeTable, "LEVY_RECEIPT", isDeposit ? Math.abs(txn.amountCents) / 100 : 0);

  const q = search.trim().toLowerCase();
  const sameWay = candidates.filter((c) => Math.sign(c.bankSideCents) === Math.sign(txn.amountCents));
  const shownEntries = sameWay
    .filter((c) => !q || `${c.entryNumber} ${c.description}`.toLowerCase().includes(q))
    // Exact amount first, then nearest date.
    .sort((a, b) => Number(b.remainingCents === leftCents) - Number(a.remainingCents === leftCents) || b.date.localeCompare(a.date))
    .slice(0, 40);
  const shownNotices = notices
    .filter((n) => !q || `lot ${n.lotNumber} ${n.noticeNumber} ${n.ownerName}`.toLowerCase().includes(q))
    .slice(0, 40);

  const active = mode === "ENTRIES" ? entryAmounts : noticeAmounts;
  const remainingAfter = leftCents - active.totalCents;
  const overpaid = noticeAmounts.rows.some((r) => {
    const n = notices.find((x) => x.id === r.id);
    return n ? Math.round(r.amount * 100) > n.owingCents : false;
  });

  return (
    <div className="mt-3 space-y-3 rounded-[var(--radius-card)] border border-line bg-zinc-50 p-4">
      <div className="flex flex-wrap gap-2" role="tablist">
        {isDeposit && (
          <Button type="button" variant={mode === "NOTICES" ? "primary" : "secondary"} onClick={() => setMode("NOTICES")}>
            Levy notices
          </Button>
        )}
        <Button type="button" variant={mode === "ENTRIES" ? "primary" : "secondary"} onClick={() => setMode("ENTRIES")}>
          Journal entries
        </Button>
        <Button type="button" variant={mode === "SUSPENSE" ? "primary" : "secondary"} onClick={() => setMode("SUSPENSE")}>
          Suspense
        </Button>
      </div>

      {mode !== "SUSPENSE" && (
        <>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={mode === "NOTICES" ? "Search by lot, notice number (payment reference) or owner" : "Search entries"}
            aria-label="Search"
            className={`${input} w-full`}
          />
          <p className={`text-sm font-medium ${remainingAfter < 0 ? "text-red-600" : "text-ink"}`} aria-live="polite">
            Left to allocate: {aud(Math.max(remainingAfter, 0))}
            {remainingAfter < 0 ? ` (over by ${aud(-remainingAfter)})` : ""} of {aud(leftCents)}
          </p>
        </>
      )}

      {mode === "ENTRIES" && (
        <>
          {shownEntries.length === 0 ? (
            <p className="text-sm text-ink-muted">No posted bank entries with an amount left to match.</p>
          ) : (
            <ul className="divide-y divide-line">
              {shownEntries.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium text-ink">{c.entryNumber}</span> · {day(c.date)} · {c.description}
                    <span className="block text-xs text-ink-muted">{aud(c.remainingCents)} left to match</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-xs text-turquoise underline"
                      onClick={() => entryAmounts.setAmount(c.id, (Math.min(c.remainingCents, Math.max(remainingAfter + Math.round((parseFloat(entryAmounts.amounts[c.id] ?? "") || 0) * 100), 0)) / 100).toFixed(2))}
                    >
                      Fill
                    </button>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      aria-label={`Amount for ${c.entryNumber}`}
                      value={entryAmounts.amounts[c.id] ?? ""}
                      onChange={(e) => entryAmounts.setAmount(c.id, e.target.value)}
                      className={`${input} w-28 tabular-nums`}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Button
            type="button"
            disabled={pending || entryAmounts.rows.length === 0 || remainingAfter < 0}
            onClick={() => run(() => allocateTransactionAction(schemeId, txn.id, entryAmounts.rows), onDone)}
          >
            {pending ? "Saving..." : "Allocate"}
          </Button>
        </>
      )}

      {mode === "NOTICES" && (
        <>
          {shownNotices.length === 0 ? (
            <p className="text-sm text-ink-muted">No open levy notices match.</p>
          ) : (
            <ul className="divide-y divide-line">
              {shownNotices.map((n) => (
                <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium text-ink">Lot {n.lotNumber}</span> · {n.noticeNumber} · {n.ownerName}
                    <span className="block text-xs text-ink-muted">
                      {n.fundName}, due {day(n.dueDate)}, owes {aud(n.owingCents)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-xs text-turquoise underline"
                      onClick={() => noticeAmounts.setAmount(n.id, (Math.min(n.owingCents, Math.max(remainingAfter + Math.round((parseFloat(noticeAmounts.amounts[n.id] ?? "") || 0) * 100), 0)) / 100).toFixed(2))}
                    >
                      Fill
                    </button>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      aria-label={`Amount for ${n.noticeNumber}`}
                      value={noticeAmounts.amounts[n.id] ?? ""}
                      onChange={(e) => noticeAmounts.setAmount(n.id, e.target.value)}
                      className={`${input} w-28 tabular-nums`}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
          {overpaid && (
            <label className="flex items-start gap-2 text-sm text-ink">
              <input type="checkbox" checked={creditOk} onChange={(e) => setCreditOk(e.target.checked)} className="mt-1" />
              <span>An amount is more than its notice owes. Hold the extra as the owner&apos;s credit for that lot.</span>
            </label>
          )}
          {fee && (
            <FeeDisclosure
              fee={fee}
              scheduleHref={`/adviser/schemes/${schemeId}/finance/platform-fees#fee-schedule`}
              confirmed={feeOk}
              onConfirmedChange={setFeeOk}
              idSuffix={`-${txn.id}`}
            />
          )}
          <Button
            type="button"
            disabled={pending || noticeAmounts.rows.length === 0 || remainingAfter < 0 || (overpaid && !creditOk) || (!!fee && !feeOk)}
            onClick={() =>
              run(() => receiptDepositAction(schemeId, txn.id, noticeAmounts.rows, creditOk, fee && feeOk ? fee.totalCents : null), onDone)
            }
          >
            {pending ? "Receipting..." : `Receipt ${noticeAmounts.rows.length || ""} notice${noticeAmounts.rows.length === 1 ? "" : "s"}`}
          </Button>
        </>
      )}

      {mode === "SUSPENSE" && (
        <div className="space-y-2 text-sm">
          <p className="text-ink-muted">
            If you cannot tell what this is yet, post the {aud(leftCents)} left to the suspense account. It must be cleared to the right
            account before the period can be closed.
          </p>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note, for example: deposit with no reference, asked the bank"
            aria-label="Suspense note"
            className={`${input} w-full`}
          />
          <Button type="button" disabled={pending || leftCents <= 0} onClick={() => run(() => postToSuspenseAction(schemeId, txn.id, note), onDone)}>
            {pending ? "Posting..." : `Post ${aud(leftCents)} to suspense`}
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

function SuspenseClearForm({
  schemeId,
  item,
  notices,
  accounts,
}: {
  schemeId: string;
  item: SuspenseRowView;
  notices: NoticeRow[];
  accounts: AccountOption[];
}) {
  const isReceipt = item.amountCents > 0;
  const [kind, setKind] = useState<"LEVY_NOTICE" | "ACCOUNT">(isReceipt ? "LEVY_NOTICE" : "ACCOUNT");
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [creditOk, setCreditOk] = useState(false);
  const { pending, error, run } = useRun();
  const notice = notices.find((n) => n.id === target);
  const overpaid = kind === "LEVY_NOTICE" && !!notice && item.amountCents > notice.owingCents;

  return (
    <div className="mt-2 space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {isReceipt && (
          <select value={kind} onChange={(e) => { setKind(e.target.value as "LEVY_NOTICE" | "ACCOUNT"); setTarget(""); }} aria-label="Clear to" className={input}>
            <option value="LEVY_NOTICE">A levy notice</option>
            <option value="ACCOUNT">An account</option>
          </select>
        )}
        <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Target" className={`${input} min-w-0 flex-1`}>
          <option value="">{kind === "LEVY_NOTICE" ? "Choose the notice" : "Choose the account"}</option>
          {kind === "LEVY_NOTICE"
            ? notices.map((n) => (
                <option key={n.id} value={n.id}>
                  Lot {n.lotNumber} · {n.noticeNumber} · owes {aud(n.owingCents)}
                </option>
              ))
            : accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
        </select>
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="How it was identified" aria-label="Note" className={`${input} w-full`} />
      {overpaid && (
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={creditOk} onChange={(e) => setCreditOk(e.target.checked)} className="mt-1" />
          <span>This is more than the notice owes. Hold the extra as the owner&apos;s credit.</span>
        </label>
      )}
      <Button
        type="button"
        variant="secondary"
        disabled={pending || !target || (overpaid && !creditOk)}
        onClick={() =>
          run(() =>
            clearSuspenseAction(
              schemeId,
              item.id,
              kind === "LEVY_NOTICE" ? { kind, levyNoticeId: target, confirmOverpayment: creditOk } : { kind, accountCodeId: target },
              note,
            ),
          )
        }
      >
        {pending ? "Clearing..." : "Clear from suspense"}
      </Button>
      {error && <p role="alert" className="text-red-600">{error}</p>}
    </div>
  );
}

export function AllocationWorkbench({
  schemeId,
  unmatched,
  matched,
  candidates,
  notices,
  suspense,
  accounts,
  feeTable,
}: {
  schemeId: string;
  unmatched: TxnRow[];
  matched: TxnRow[];
  candidates: CandidateRow[];
  notices: NoticeRow[];
  suspense: SuspenseRowView[];
  accounts: AccountOption[];
  feeTable: TransactionFeeTable | null;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [clearing, setClearing] = useState<string | null>(null);
  const { pending, error, run } = useRun();
  const unmatchedTotal = useMemo(() => unmatched.reduce((s, t) => s + (Math.abs(t.amountCents) - t.allocatedCents), 0), [unmatched]);

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded-[var(--radius-card)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <Card>
        <CardHeader
          title="To match"
          description={
            unmatched.length === 0
              ? undefined
              : `${unmatched.length} transaction${unmatched.length === 1 ? "" : "s"}, ${aud(unmatchedTotal)} not yet allocated. Split a deposit across levy notices, combine payments against one entry, or park what you cannot identify in suspense.`
          }
        />
        {unmatched.length === 0 ? (
          <EmptyState title="Everything is matched" description="Every imported transaction for this account is allocated." />
        ) : (
          <ul className="divide-y divide-line">
            {unmatched.map((t) => {
              const left = Math.abs(t.amountCents) - t.allocatedCents;
              return (
                <li key={t.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium text-ink">{day(t.date)}</span> · {t.description}
                      {t.reference ? <span className="text-ink-muted"> · {t.reference}</span> : null}
                      {t.allocatedCents > 0 && (
                        <span className="block text-xs text-amber-700">
                          {aud(t.allocatedCents)} allocated, {aud(left)} left
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={`tabular-nums font-semibold ${t.amountCents < 0 ? "text-red-700" : "text-green-700"}`}>{aud(t.amountCents)}</span>
                      <Button type="button" variant="secondary" onClick={() => setOpen(open === t.id ? null : t.id)}>
                        {open === t.id ? "Close" : "Allocate"}
                      </Button>
                      {t.allocatedCents === 0 ? (
                        <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => excludeTransactionAction(schemeId, t.id))}>
                          Exclude
                        </Button>
                      ) : !t.hasSuspense ? (
                        <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => unmatchTransactionAction(schemeId, t.id))}>
                          Undo allocations
                        </Button>
                      ) : null}
                    </span>
                  </div>
                  {open === t.id && (
                    <AllocatePanel schemeId={schemeId} txn={t} candidates={candidates} notices={notices} feeTable={feeTable} onDone={() => setOpen(null)} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Matched, ready to reconcile" description="Check each against the statement, then mark it reconciled." />
        {matched.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing is waiting.</p>
        ) : (
          <ul className="divide-y divide-line">
            {matched.map((t) => (
              <li key={t.id} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-ink">{day(t.date)}</span> · {t.description}
                  <span className="block text-xs text-ink-muted">{t.allocations.map((a) => `${a.label} ${aud(a.amountCents)}`).join(", ")}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums font-semibold">{aud(t.amountCents)}</span>
                  <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => reconcileTransactionAction(schemeId, t.id))}>
                    Reconcile
                  </Button>
                  {!t.hasSuspense && (
                    <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => unmatchTransactionAction(schemeId, t.id))}>
                      Unmatch
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div id="suspense">
        <Card>
          <CardHeader
            title="Suspense"
            description="Unidentified amounts. Each must be cleared to the right account before the period it falls in can be closed."
          />
          {suspense.length === 0 ? (
            <p className="text-sm text-ink-muted">Nothing is in suspense.</p>
          ) : (
            <ul className="divide-y divide-line">
              {suspense.map((i) => (
                <li key={i.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="font-medium text-ink">{day(i.date)}</span> · {i.description}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums font-semibold">{aud(i.amountCents)}</span>
                      <Button type="button" variant="secondary" onClick={() => setClearing(clearing === i.id ? null : i.id)}>
                        {clearing === i.id ? "Close" : "Clear"}
                      </Button>
                    </span>
                  </div>
                  {clearing === i.id && <SuspenseClearForm schemeId={schemeId} item={i} notices={notices} accounts={accounts} />}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
