import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { db } from "@/prisma/db";

/**
 * A change of owner on the strata roll (decided 25 Oct 2026), server side.
 * Callers authorise first and pass only a lot of this scheme. Who records it
 * and when it applies: src/lib/actions/change-owner.ts (the Adviser or
 * StrataVerze straight away; a committee member's held for review, H-1).
 *
 * What it does (founder decision 31 Oct 2026, review finding H1):
 *   - the strata roll shows the new owner's name, contact details and the
 *     settlement date; the outgoing owner's contact details are not kept on
 *     the lot (they stay in the activity log only as a name);
 *   - every active OWNER access to this lot ends on the settlement date
 *     (memberships are ended, never deleted). It is never moved to another
 *     lot: the roll's names and emails are text anyone with roll.manage can
 *     edit, so they cannot decide who gets a lot. If the outgoing owner owns
 *     another lot here, the Adviser assigns them to it (Adviser or StrataVerze
 *     only, S-01);
 *   - committee seats of the outgoing owners, and any seat recorded against
 *     this lot, end on the settlement date (s 35(1)(a) SSMA 2015: an elected
 *     member vacates office on ceasing to be eligible), unless that person
 *     still holds active owner access to another lot of the scheme, an access
 *     record only the Adviser or StrataVerze can make. Not covered: a
 *     non-owner member nominated by this owner (s 35(1)(b)); who nominated
 *     whom is not recorded, so the Adviser handles that by hand;
 *   - delivery preferences addressed to the owner now go to the new owner.
 * previewChangeOwner says, without changing anything, exactly what
 * applyChangeOwner will do, so the reviewer sees it before confirming.
 * The notice of transfer and the invitation are handled by the caller.
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

type Orm = typeof db.orm;

const personName = (p: { firstName?: string | null; lastName?: string | null; email?: string | null } | null | undefined) =>
  [p?.firstName, p?.lastName].filter(Boolean).join(" ") || p?.email || "An owner";

/** What applying the change would do to this lot's access and the committee, read now. */
export async function previewChangeOwner(orm: Orm, schemeId: string, lotId: string) {
  const detail = await orm.public.LotDetail.where((d) => d.lotId.eq(lotId)).first();
  const access = await orm.public.SchemeMembership
    .where((m) => and(m.schemeId.eq(schemeId), m.lotId.eq(lotId), m.role.eq("OWNER"), m.isActive.eq(true)))
    .limit(50)
    .all();
  const outgoing = new Set(access.map((m) => m.profileId));
  const seats = (
    await orm.public.SchemeMembership
      .where((m) => and(m.schemeId.eq(schemeId), m.role.eq("COMMITTEE"), m.isActive.eq(true)))
      .limit(200)
      .all()
  ).filter((s) => outgoing.has(s.profileId) || s.lotId === lotId);
  // Owner access to another lot of the scheme: made only by the Adviser or StrataVerze (S-01, M1).
  const otherAccess = seats.length
    ? (
        await orm.public.SchemeMembership
          .where((m) => and(m.schemeId.eq(schemeId), m.role.eq("OWNER"), m.isActive.eq(true), m.profileId.in(seats.map((s) => s.profileId))))
          .limit(200)
          .all()
      ).filter((m) => m.lotId && m.lotId !== lotId)
    : [];
  const ids = [...new Set([...access.map((m) => m.profileId), ...seats.map((s) => s.profileId)])];
  const profiles = ids.length ? await orm.public.Profile.where((p) => p.id.in(ids)).limit(200).all() : [];
  const profile = (id: string) => profiles.find((p) => p.id === id);
  const lotIds = [...new Set(otherAccess.map((m) => m.lotId!))];
  const lots = lotIds.length ? await orm.public.Lot.where((l) => and(l.schemeId.eq(schemeId), l.id.in(lotIds))).limit(200).all() : [];
  const lotNumber = (id: string) => String(lots.find((l) => l.id === id)?.lotNumber ?? "?");

  const seatsEnding: Array<{ membershipId: string; profileId: string; name: string }> = [];
  const seatsKept: Array<{ membershipId: string; profileId: string; name: string; lotNumbers: string[] }> = [];
  for (const seat of seats) {
    const elsewhere = otherAccess.filter((m) => m.profileId === seat.profileId).map((m) => lotNumber(m.lotId!));
    const row = { membershipId: seat.id, profileId: seat.profileId, name: personName(profile(seat.profileId)) };
    if (elsewhere.length) seatsKept.push({ ...row, lotNumbers: elsewhere.sort((a, b) => a.localeCompare(b, "en-AU", { numeric: true })) });
    else seatsEnding.push(row);
  }
  return {
    rollOwnerName: detail?.rollOwnerName ?? null,
    previousOwnerEmail: detail?.ownerEmail ?? null,
    accessEnding: access.map((m) => ({ membershipId: m.id, profileId: m.profileId, name: personName(profile(m.profileId)), email: profile(m.profileId)?.email ?? null })),
    seatsEnding,
    seatsKept,
  };
}

export type ChangeOwnerPreview = Awaited<ReturnType<typeof previewChangeOwner>>;

/**
 * Apply the change to the roll, memberships and delivery preferences, through
 * `orm` (the caller's transaction, holding the lot's row). Returns what changed.
 */
export async function applyChangeOwner(orm: Orm, schemeId: string, lotId: string, input: ChangeOwnerInput) {
  const plan = await previewChangeOwner(orm, schemeId, lotId);
  const settledAt = `${input.settlementDate}T00:00:00.000Z`;

  const roll = {
    rollOwnerName: input.ownerName,
    contactName: input.ownerName,
    ownerEmail: input.email,
    ownerMobile: input.mobile,
    ownerPhone: input.phone,
    ownerAddress: input.address,
    lastSettled: settledAt as never,
    // Belonged to the outgoing owner.
    isCommitteeMember: false,
    paidToDate: null,
  };
  const existing = await orm.public.LotDetail.where((d) => d.lotId.eq(lotId)).first();
  if (existing) await orm.public.LotDetail.where((d) => and(d.id.eq(existing.id), d.lotId.eq(lotId))).update(roll);
  else await orm.public.LotDetail.create({ lotId, ...roll });

  // Every owner access to this lot ends; none is moved to another lot (H1, 31 Oct 2026).
  for (const m of plan.accessEnding) {
    await orm.public.SchemeMembership
      .where((x) => and(x.id.eq(m.membershipId), x.schemeId.eq(schemeId), x.isActive.eq(true)))
      .update({ isActive: false, endDate: ts(settledAt) });
  }
  for (const seat of plan.seatsEnding) {
    await orm.public.SchemeMembership
      .where((x) => and(x.id.eq(seat.membershipId), x.schemeId.eq(schemeId), x.isActive.eq(true)))
      .update({ isActive: false, isTreasurer: false, endDate: ts(settledAt) });
  }

  const prefs = await orm.public.LotDeliveryPreference.where((p) => and(p.lotId.eq(lotId), p.recipientType.eq("OWNER"))).all();
  for (const p of prefs) {
    await orm.public.LotDeliveryPreference.where((x) => and(x.id.eq(p.id), x.lotId.eq(lotId))).update({
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
    previousOwnerName: plan.rollOwnerName,
    endedMemberships: plan.accessEnding.map((m) => m.profileId),
    endedCommitteeSeats: plan.seatsEnding.map((s) => s.profileId),
    keptCommitteeSeats: plan.seatsKept.map((k) => ({ profileId: k.profileId, lotNumbers: k.lotNumbers })),
    deliveryPreferencesUpdated: prefs.length,
  };
}
