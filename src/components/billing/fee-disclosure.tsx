"use client";

import Link from "next/link";
import { platformToday } from "@/lib/jurisdiction/time-zone";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatAud } from "@/lib/billing/money";
import { toFeeView, type FeeView, type FeeWording } from "@/lib/billing/disclosure";
import { transactionFee, type MoneyMovement, type TransactionFeeMode } from "@/lib/billing/fee-engine";
import type { PriceBookEntry } from "@/lib/billing/price-book";

/**
 * Shows the StrataVerze fee for an action, including GST, with a one-line
 * explanation and a link to the scheme's fee schedule, and asks the user to
 * confirm it. The confirmed amount is submitted as `feeConfirmedCents`.
 * Renders nothing when no fee applies.
 */
export function FeeDisclosure({
  fee,
  scheduleHref,
  confirmed,
  onConfirmedChange,
  idSuffix = "",
}: {
  fee: FeeView | null;
  scheduleHref: string;
  confirmed: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
  idSuffix?: string;
}) {
  // A confirmation only counts for the amount it was given for.
  const total = fee?.totalCents ?? null;
  const shownFor = useRef(total);
  useEffect(() => {
    if (shownFor.current !== total) {
      shownFor.current = total;
      if (confirmed) onConfirmedChange(false);
    }
  }, [total, confirmed, onConfirmedChange]);

  if (!fee) return null;
  const id = `fee-confirm-${fee.code}${idSuffix}`;
  return (
    <div
      role="group"
      aria-label="StrataVerze fee"
      className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-ink space-y-2"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">StrataVerze fee: {fee.description}</p>
        <p className="font-semibold tabular-nums">
          {formatAud(fee.totalCents)} <span className="font-normal text-ink-muted">incl. GST</span>
        </p>
      </div>
      <p className="text-ink-muted">{fee.explanation}</p>
      <p className="text-xs text-ink-muted">
        {fee.payerLabel}. {formatAud(fee.exGstCents)} plus {formatAud(fee.gstCents)} GST.{" "}
        <Link href={scheduleHref} className="underline hover:text-ink" target="_blank">
          View the fee schedule
        </Link>
      </p>
      <label htmlFor={id} className="flex items-start gap-2 cursor-pointer">
        <input
          id={id}
          type="checkbox"
          checked={confirmed}
          onChange={(e) => onConfirmedChange(e.target.checked)}
          className="mt-0.5"
        />
        <span>I understand StrataVerze will charge {formatAud(fee.totalCents)} (incl. GST) for this.</span>
      </label>
      {confirmed && <input type="hidden" name="feeConfirmedCents" value={fee.totalCents} />}
    </div>
  );
}

/** Transaction fee rows and mode, as sent from the server. */
export interface TransactionFeeTable {
  mode: TransactionFeeMode;
  priceBook: PriceBookEntry[];
  /** The building's words for the disclosure (feeWordingFor). Without them the NSW words are used. */
  wording?: FeeWording;
}

/** The transaction fee for an amount being typed, or null. */
export function useTransactionFeeView(
  table: TransactionFeeTable | null,
  movement: MoneyMovement,
  amountDollars: number,
): FeeView | null {
  return useMemo(() => {
    if (!table || !(amountDollars > 0)) return null;
    try {
      const quote = transactionFee({
        movement,
        paymentCents: Math.round(amountDollars * 100),
        mode: table.mode,
        priceBook: table.priceBook,
        date: platformToday(),
      });
      return quote ? toFeeView(quote, table.wording) : null;
    } catch {
      return null;
    }
  }, [table, movement, amountDollars]);
}

/**
 * Confirmation state for a fee shown by FeeDisclosure. `ready` is true when
 * there is no fee or it has been confirmed; `confirmedCents` is what to send
 * to the server action.
 */
export function useFeeConfirmation(fee: FeeView | null) {
  const [confirmed, setConfirmed] = useState(false);
  return {
    confirmed,
    setConfirmed,
    ready: !fee || confirmed,
    confirmedCents: fee && confirmed ? fee.totalCents : null,
  };
}
