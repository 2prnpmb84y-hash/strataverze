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
 *     date (memberships are ended, never deleted), or moves to another lot
 *     of theirs if the roll shows they still own one in this scheme;
 *   - the outgoing owner's committee seat ends on the settlement date, unless
 *     they still own another lot in the scheme (s 35(1)(a) SSMA 2015: an
 *     elected member vacates office on ceasing to be eligible). Not covered:
 *     a non-owner member nominated by this owner (s 35(1)(b)); who nominated
 *     whom is not recorded, so the Adviser handles that by hand;
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

  const stillOwns = await otherLotsLookup(schemeId, lotId, previous?.rollOwnerName ?? null, previous?.ownerEmail ?? null);

  // The outgoing owner's access to this lot. An owner holds one owner access
  // per scheme, on one lot: if the roll shows they still own another lot
  // here, their access moves to that lot instead of ending.
  const outgoing = await db.orm.public.SchemeMembership
    .where((m) => and(m.schemeId.eq(schemeId), m.lotId.eq(lotId), m.role.eq("OWNER"), m.isActive.eq(true)))
    .all();
  const ended: string[] = [];
  const movedAccess: Array<{ profileId: string; lotNumber: string }> = [];
  for (const m of outgoing) {
    const other = (await stillOwns(m.profileId))[0];
    if (other) {
      await db.orm.public.SchemeMembership.where((x) => and(x.id.eq(m.id), x.schemeId.eq(schemeId))).update({ lotId: other.lotId });
      movedAccess.push({ profileId: m.profileId, lotNumber: other.lotNumber });
    } else {
      await db.orm.public.SchemeMembership
        .where((x) => and(x.id.eq(m.id), x.schemeId.eq(schemeId)))
        .update({ isActive: false, endDate: ts(settledAt) });
      ended.push(m.profileId);
    }
  }

  const committee = await endCommitteeSeats(schemeId, lotId, {
    outgoingProfileIds: outgoing.map((m) => m.profileId),
    stillOwns,
    settledAt,
  });

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
    endedMemberships: ended,
    movedAccess,
    endedCommitteeSeats: committee.ended,
    keptCommitteeSeats: committee.kept,
    deliveryPreferencesUpdated: prefs.length,
  };
}

const sameName = (a: string | null | undefined, b: string | null | undefined) => {
  const n = (v: string | null | undefined) => (v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return n(a) !== "" && n(a) === n(b);
};
const sameEmail = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The outgoing owner's committee seat (decided 25 Oct 2026). Under s 35(1)(a)
 * of the Strata Schemes Management Act 2015 an elected member vacates office
 * on ceasing to be eligible; an owner who still owns another lot in the
 * scheme stays eligible. So the seat ends on the settlement date unless the
 * strata roll still shows them as the owner of another lot (same email, or
 * the same name as on this lot). The outgoing owner is whoever held this
 * lot's owner access, or a committee seat recorded against this lot.
 *
 * Not covered: a non-owner member nominated by this owner (s 35(1)(b)); who
 * nominated whom is not recorded, so the Adviser handles that by hand.
 */
type OtherLot = { lotId: string; lotNumber: string };

/**
 * Whether a person still owns another lot in the scheme, from the rest of the
 * strata roll: a lot carrying their email (profile or this lot's owner
 * email), or the same owner name as this lot had. Loaded once per change.
 */
async function otherLotsLookup(schemeId: string, lotId: string, previousOwnerName: string | null, previousOwnerEmail: string | null) {
  const otherLots = (await db.orm.public.Lot.where((l) => l.schemeId.eq(schemeId)).limit(5000).all()).filter((l) => l.id !== lotId);
  const details = otherLots.length
    ? await db.orm.public.LotDetail.where((d) => d.lotId.in(otherLots.map((l) => l.id))).limit(5000).all()
    : [];
  const lotNumber = new Map(otherLots.map((l) => [l.id, String(l.lotNumber)]));
  return async (profileId: string): Promise<OtherLot[]> => {
    const profile = await db.orm.public.Profile.where((p) => p.id.eq(profileId)).first();
    return details
      .filter((d) => sameEmail(d.ownerEmail, profile?.email) || sameEmail(d.ownerEmail, previousOwnerEmail) || sameName(d.rollOwnerName, previousOwnerName))
      .map((d) => ({ lotId: d.lotId, lotNumber: lotNumber.get(d.lotId) ?? "?" }))
      .sort((a, b) => a.lotNumber.localeCompare(b.lotNumber, "en-AU", { numeric: true }));
  };
}

async function endCommitteeSeats(
  schemeId: string,
  lotId: string,
  o: { outgoingProfileIds: string[]; stillOwns: (profileId: string) => Promise<OtherLot[]>; settledAt: string },
): Promise<{ ended: string[]; kept: Array<{ profileId: string; lotNumbers: string[] }> }> {
  const seats = await db.orm.public.SchemeMembership
    .where((m) => and(m.schemeId.eq(schemeId), m.role.eq("COMMITTEE"), m.isActive.eq(true)))
    .limit(200)
    .all();
  const outgoing = new Set(o.outgoingProfileIds);
  const theirs = seats.filter((s) => outgoing.has(s.profileId) || s.lotId === lotId);

  const ended: string[] = [];
  const kept: Array<{ profileId: string; lotNumbers: string[] }> = [];
  for (const seat of theirs) {
    const others = await o.stillOwns(seat.profileId);
    if (others.length) {
      kept.push({ profileId: seat.profileId, lotNumbers: others.map((x) => x.lotNumber) });
      continue;
    }
    await db.orm.public.SchemeMembership
      .where((x) => and(x.id.eq(seat.id), x.schemeId.eq(schemeId)))
      .update({ isActive: false, isTreasurer: false, endDate: ts(o.settledAt) });
    ended.push(seat.profileId);
  }
  return { ended, kept };
}
