"use server";

import { revalidatePath } from "next/cache";
import { requireSchemeMembership, AuthorisationError } from "@/lib/auth/require-membership";
import { FeeConfirmationError } from "@/lib/billing/disclosure";
import { db } from "@/prisma/db";
import { logActivity } from "@/lib/queries/activity-log";
import { parseSavedMapping } from "@/lib/finance/csv-mapping";
import {
  ReconciliationError,
  allocateBankTransaction,
  clearSuspenseItem,
  postToSuspense,
  receiptDepositToNotices,
} from "@/lib/finance/bank-allocations";

export type ReconciliationActionResult = { error?: string; success?: boolean };

const path = (schemeId: string) => `/adviser/schemes/${schemeId}/finance/reconciliation`;

function failure(err: unknown, fallback: string): ReconciliationActionResult {
  if (err instanceof AuthorisationError || err instanceof ReconciliationError || err instanceof FeeConfirmationError) {
    return { error: err.message };
  }
  console.error(fallback, err);
  return { error: err instanceof Error ? err.message : fallback };
}

const toCentsList = (rows: { id: string; amount: number }[]) =>
  rows.filter((r) => r.amount > 0).map((r) => ({ id: r.id, cents: Math.round(r.amount * 100) }));

/** Allocate a transaction to one or more journal entries (amounts in dollars). */
export async function allocateTransactionAction(
  schemeId: string,
  transactionId: string,
  rows: { id: string; amount: number }[],
): Promise<ReconciliationActionResult> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    await allocateBankTransaction({
      schemeId,
      transactionId,
      requests: toCentsList(rows).map((r) => ({ journalEntryId: r.id, amountCents: r.cents })),
      actorId: profile.id,
    });
    revalidatePath(path(schemeId));
    return { success: true };
  } catch (err) {
    return failure(err, "Failed to allocate the transaction.");
  }
}

/** Receipt a deposit across several levy notices (amounts in dollars). */
export async function receiptDepositAction(
  schemeId: string,
  transactionId: string,
  rows: { id: string; amount: number }[],
  confirmOverpayment: boolean,
  feeConfirmedCents: number | null,
): Promise<ReconciliationActionResult> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    await receiptDepositToNotices({
      schemeId,
      transactionId,
      receipts: toCentsList(rows).map((r) => ({ levyNoticeId: r.id, amountCents: r.cents })),
      confirmOverpayment,
      feeConfirmedCents,
      actorId: profile.id,
    });
    revalidatePath(path(schemeId));
    revalidatePath(`/adviser/schemes/${schemeId}/finance/levies`);
    return { success: true };
  } catch (err) {
    return failure(err, "Failed to receipt the deposit.");
  }
}

/** Post what is left of a transaction to the suspense account. */
export async function postToSuspenseAction(schemeId: string, transactionId: string, note: string): Promise<ReconciliationActionResult> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    await postToSuspense({ schemeId, transactionId, note: note.trim() || null, actorId: profile.id });
    revalidatePath(path(schemeId));
    revalidatePath(`/adviser/schemes/${schemeId}/finance/periods`);
    return { success: true };
  } catch (err) {
    return failure(err, "Failed to post to suspense.");
  }
}

/** Clear a suspense item to a levy notice or an account. */
export async function clearSuspenseAction(
  schemeId: string,
  itemId: string,
  target: { kind: "LEVY_NOTICE"; levyNoticeId: string; confirmOverpayment: boolean } | { kind: "ACCOUNT"; accountCodeId: string },
  note: string,
): Promise<ReconciliationActionResult> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    await clearSuspenseItem({ schemeId, itemId, target, note: note.trim() || null, actorId: profile.id });
    revalidatePath(path(schemeId));
    revalidatePath(`/adviser/schemes/${schemeId}/finance/periods`);
    return { success: true };
  } catch (err) {
    return failure(err, "Failed to clear the suspense item.");
  }
}

/** Save the CSV column mapping used for a bank account, to pre-select next time. */
export async function saveCsvMappingAction(schemeId: string, bankAccountId: string, mappingJson: string): Promise<ReconciliationActionResult> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const mapping = parseSavedMapping(mappingJson);
    if (!mapping) return { error: "That column mapping could not be saved." };
    const account = await db.orm.public.SchemeBankAccount.where((a) => a.id.eq(bankAccountId)).first();
    if (!account || account.schemeId !== schemeId) return { error: "Bank account not found." };
    await db.orm.public.SchemeBankAccount.where((a) => a.id.eq(bankAccountId)).update({ csvMapping: JSON.stringify(mapping) });
    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "BANK_CSV_MAPPING_SAVED",
      entityType: "SchemeBankAccount",
      entityId: bankAccountId,
      metadata: { columns: mapping.columns },
    });
    return { success: true };
  } catch (err) {
    return failure(err, "Failed to save the column mapping.");
  }
}
