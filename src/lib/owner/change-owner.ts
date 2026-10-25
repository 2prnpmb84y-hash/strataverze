import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { db } from "@/prisma/db";
import { upsertLotDetail } from "@/lib/queries/lot-workflows";

/**
 * A change of owner on the strata roll (decided 25 Oct 2026), server side.
 * Callers authorise first (roll.manage: the Adviser and the committee) and
 * pass only a lot of this scheme.
 *
 * What it does:
 *   - the strata roll shows the new owner's name, contact details and the
 *     settlement date; the outgoing owner's contact details are not kept on
 *     the lot (they stay in the activity log only as a name);
 *   - the outgoing owners' portal access to the lot ends on the settlement
 *     date (memberships are ended, never deleted);
 *   - delivery preferences addressed to the owner now go to the new owner.
 * The notice of transfer and the invitation are handled by the action.
 */

export interface ChangeOwnerInput {
  ownerName: string;
  email: string | null;
  mobile: string | null;
  phone: string | null;
  address: string | null;
  settlementDate: string;
}

export type ChangeOwnerCheck = { ok: true; value: ChangeOwnerInput } | { ok: false; fieldErrors: Record<string, string> };

const CONTROL = /[\u0000-\u001F\u007F]/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Check the form (pure). `today` is Sydney's date, yyyy-mm-dd. */
export function checkChangeOwner(raw: Record<string, unknown>, today: string): ChangeOwnerCheck {
  const text = (k: string, max: number) => {
    const v = String(raw[k] ?? "").trim();
    return v ? v.slice(0, max) : "";
  };
  const fieldErrors: Record<string, string> = {};
  const ownerName = text("ownerName", 501);
  if (!ownerName) fieldErrors.ownerName = "Enter the new owner's name as it will appear on the strata roll.";
  else if (ownerName.length > 500) fieldErrors.ownerName = "The owner name can be at most 500 characters.";
  else if (CONTROL.test(ownerName)) fieldErrors.ownerName = "The owner name cannot contain line breaks.";
  const email = text("email", 255).toLowerCase();
  if (email && !EMAIL.test(email)) fieldErrors.email = "Enter a valid email address, or leave it blank.";
  const settlementDate = text("settlementDate", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(settlementDate) || Number.isNaN(Date.parse(settlementDate))) {
    fieldErrors.settlementDate = "Enter the settlement date.";
  } else if (settlementDate > today) {
    fieldErrors.settlementDate = "The settlement date cannot be in the future. Record the change once it has settled.";
  }
  const mobile = text("mobile", 40);
  const phone = text("phone", 40);
  const address = text("address", 500);
  for (const [k, v] of [["mobile", mobile], ["phone", phone], ["address", address]] as const) {
    if (v && CONTROL.test(v)) fieldErrors[k] = "This cannot contain line breaks.";
  }
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  return { ok: true, value: { ownerName, email: email || null, mobile: mobile || null, phone: phone || null, address: address || null, settlementDate } };
}

const ts = (v: string) => v as unknown as TimestampString<3>;

/** Apply the change to the roll, memberships and delivery preferences. Returns what changed. */
export async function applyChangeOwner(schemeId: string, lotId: string, input: ChangeOwnerInput) {
  const previous = await db.orm.public.LotDetail.where((d) => d.lotId.eq(lotId)).first();
  const settledAt = `${input.settlementDate}T00:00:00.000Z`;

  await upsertLotDetail(lotId, {
    rollOwnerName: input.ownerName,
    contactName: input.ownerName,
    ownerEmail: input.email,
    ownerMobile: input.mobile,
    ownerPhone: input.phone,
    ownerAddress: input.address,
    lastSettled: settledAt,
    // Belonged to the outgoing owner.
    isCommitteeMember: false,
    paidToDate: null,
  });

  const outgoing = await db.orm.public.SchemeMembership
    .where((m) => and(m.schemeId.eq(schemeId), m.lotId.eq(lotId), m.role.eq("OWNER"), m.isActive.eq(true)))
    .all();
  for (const m of outgoing) {
    await db.orm.public.SchemeMembership
      .where((x) => and(x.id.eq(m.id), x.schemeId.eq(schemeId)))
      .update({ isActive: false, endDate: ts(settledAt) });
  }

  const prefs = await db.orm.public.LotDeliveryPreference.where((p) => and(p.lotId.eq(lotId), p.recipientType.eq("OWNER"))).all();
  for (const p of prefs) {
    await db.orm.public.LotDeliveryPreference.where((x) => and(x.id.eq(p.id), x.lotId.eq(lotId))).update({
      recipientName: input.ownerName,
      recipientEmail: input.email,
      // Never leave the outgoing owner's postal address in place.
      recipientAddress: input.address,
      recipientSuburb: null,
      recipientState: null,
      recipientPostcode: null,
    });
  }

  return {
    previousOwnerName: previous?.rollOwnerName ?? null,
    endedMemberships: outgoing.map((m) => m.profileId),
    deliveryPreferencesUpdated: prefs.length,
  };
}
