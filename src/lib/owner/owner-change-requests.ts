import { createHash, randomUUID } from "node:crypto";
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { dayIn, PLATFORM_TIME_ZONE } from "@/lib/jurisdiction/time-zone";
import { previewChangeOwner, type ChangeOwnerInput, type ChangeOwnerPreview } from "./change-owner";
import { addressResemblance } from "./own-address";
import { invitationPlanFacts, planOwnerInvitation, type OwnerInvitationPlan } from "./owner-invitation";
import { currentAddressesOf } from "./recorder-addresses";

/**
 * A change of owner held for review (finding H-1, founder decision 31 Oct
 * 2026). When a committee member, rather than the scheme's Adviser or a
 * platform admin, records a change of owner, it is stored here as PENDING and
 * nothing else changes: the strata roll, the outgoing owner's portal access
 * and committee seat and the delivery preferences stay as they are, and no
 * OWNER invitation is created. The Adviser (or a platform admin, the only
 * reviewer where the building has no Adviser) confirms it, which applies
 * exactly what an Adviser's change of owner applies, or rejects it.
 *
 * Table owner_change_requests, migration 20261201 (one PENDING row per lot;
 * what was recorded, and a decided row, never change). Callers authorise
 * first; every read and write here is scoped to the scheme. Writes take the
 * ORM of the caller's transaction, which holds the lot's row (lockLot).
 */

export type OwnerChangeDecision = "CONFIRMED" | "REJECTED";
type Orm = typeof db.orm;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** yyyy-mm-dd from a date column (the ORM returns a date string). */
const day = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);

/** A change of owner (or an owner assignment or removal) could not go ahead; nothing was changed. */
export class OwnerChangeConflict extends Error {
  constructor(readonly kind: "PENDING" | "NOT_WAITING" | "LOT" | "PLAN_CHANGED") {
    super(`change of owner: ${kind}`);
    this.name = "OwnerChangeConflict";
  }
}

/**
 * Hold the lot's row until the transaction ends, so a change of owner (recorded,
 * held, confirmed or rejected) and an owner assignment or removal on a lot run
 * one at a time, each seeing what the one before did (review L3, L2).
 */
export async function lockLot(tx: Tx, schemeId: string, lotId: string) {
  const lot = await tx.orm.public.Lot.where((l) => and(l.id.eq(lotId), l.schemeId.eq(schemeId))).forNoKeyUpdate().first();
  if (!lot) throw new OwnerChangeConflict("LOT");
  return lot;
}

/** The change waiting for review on this lot, if any. */
export async function getPendingOwnerChange(schemeId: string, lotId: string, orm: Orm = db.orm) {
  return orm.public.OwnerChangeRequest
    .where((r) => and(r.schemeId.eq(schemeId), r.lotId.eq(lotId), r.status.eq("PENDING")))
    .first();
}

/** One request of this scheme, by id (a malformed id is simply not found). */
export async function getOwnerChangeRequest(schemeId: string, requestId: string) {
  if (!UUID.test(requestId)) return null;
  return db.orm.public.OwnerChangeRequest.where((r) => and(r.id.eq(requestId), r.schemeId.eq(schemeId))).first();
}

/**
 * Hold a change for review. Throws (23505) if the lot already has one waiting.
 * The notice of transfer is attached after this commits (attachNotice), so a
 * hold that loses a race never leaves a filed notice behind.
 */
export async function holdOwnerChange(
  orm: Orm,
  p: { schemeId: string; lotId: string; input: ChangeOwnerInput; invite: boolean; recordedBy: string },
) {
  return orm.public.OwnerChangeRequest.create({
    id: randomUUID(),
    schemeId: p.schemeId,
    lotId: p.lotId,
    status: "PENDING",
    ownerName: p.input.ownerName,
    ownerEmail: p.input.email,
    ownerMobile: p.input.mobile,
    ownerPhone: p.input.phone,
    ownerAddress: p.input.address,
    settlementDate: p.input.settlementDate as never,
    invite: p.invite && !!p.input.email,
    noticeDocumentId: null,
    recordedBy: p.recordedBy,
  });
}

/**
 * Link the notice filed for a waiting change, once. The document must be of
 * the same building (review L5; the database's guard checks it too).
 */
export async function attachNotice(schemeId: string, requestId: string, documentId: string) {
  const doc = await db.orm.public.Document.where((d) => and(d.id.eq(documentId), d.schemeId.eq(schemeId))).first();
  if (!doc) return false;
  const n = await db.orm.public.OwnerChangeRequest
    .where((r) => and(r.id.eq(requestId), r.schemeId.eq(schemeId), r.status.eq("PENDING"), r.noticeDocumentId.isNull()))
    .updateAndCount({ noticeDocumentId: documentId });
  return n === 1;
}

/**
 * Decide a waiting change: a conditional update on status PENDING, so of two
 * decisions at once only one wins. True when this call decided it.
 */
export async function decideOwnerChange(orm: Orm, schemeId: string, requestId: string, decision: OwnerChangeDecision, decidedBy: string) {
  const n = await orm.public.OwnerChangeRequest
    .where((r) => and(r.id.eq(requestId), r.schemeId.eq(schemeId), r.status.eq("PENDING")))
    .updateAndCount({ status: decision, decidedBy, decidedAt: new Date().toISOString() as never });
  return n === 1;
}

type RequestRow = NonNullable<Awaited<ReturnType<typeof getPendingOwnerChange>>>;

/** The change as it was recorded, in the form applyChangeOwner takes. */
export function heldInput(row: RequestRow): ChangeOwnerInput {
  return {
    ownerName: row.ownerName,
    email: row.ownerEmail ?? null,
    mobile: row.ownerMobile ?? null,
    phone: row.ownerPhone ?? null,
    address: row.ownerAddress ?? null,
    settlementDate: day(row.settlementDate),
  };
}

/** Whether the building has an active Adviser (otherwise StrataVerze reviews). */
export async function schemeHasAdviser(schemeId: string) {
  const adviser = await db.orm.public.SchemeMembership
    .where((m) => and(m.schemeId.eq(schemeId), m.role.eq("ADVISER"), m.isActive.eq(true)))
    .first();
  return !!adviser;
}

/**
 * A fingerprint of what confirming would do (review L6): the request, the
 * access and committee seats that end or continue, the roll owner, and the
 * invitation plan. The reviewer's form carries the one they saw; confirming
 * recomputes it under the lot's lock and refuses if it differs.
 */
export function planFingerprint(requestId: string, preview: ChangeOwnerPreview, invitation: OwnerInvitationPlan): string {
  const facts = {
    requestId,
    rollOwnerName: preview.rollOwnerName,
    accessEnding: preview.accessEnding.map((a) => a.membershipId).sort(),
    seatsEnding: preview.seatsEnding.map((s) => s.membershipId).sort(),
    seatsKept: preview.seatsKept.map((s) => `${s.membershipId}:${s.lotNumbers.join(",")}`).sort(),
    invitation: invitationPlanFacts(invitation),
  };
  return createHash("sha256").update(JSON.stringify(facts)).digest("hex");
}

/** What the Adviser's and StrataVerze's card shows of a waiting change. Serialisable, for a client component. */
export type PendingOwnerChangeView = {
  id: string;
  ownerName: string;
  email: string | null;
  mobile: string | null;
  phone: string | null;
  address: string | null;
  settlementDate: string;
  invite: boolean;
  hasNotice: boolean;
  recordedByName: string;
  recordedByEmail: string | null;
  recordedOn: string;
  /** Who confirms it: "the Adviser", or StrataVerze where the building has none. */
  reviewer: string;
  /** What confirming would do, read now (review M2, M3). */
  effect: {
    rollOwnerName: string | null;
    accessEnding: Array<{ name: string; email: string | null }>;
    seatsEnding: string[];
    seatsKept: Array<{ name: string; lotNumbers: string[] }>;
    invitation: OwnerInvitationPlan["kind"];
    /** SKIP_ACTIVE: the lot the new owner already holds owner access through. */
    invitationActiveLot: string | null;
    /** Invitations that will be withdrawn: other pending owner invitations to this lot. */
    withdrawnInvitations: string[];
  };
  /** Sent back with Confirm: confirming refuses if what it would do has changed (review L6). */
  fingerprint: string;
  /** The new owner's email shares the recorder's part before the @, or a private domain (review L1, L4). */
  resemblance: "local" | "domain" | null;
};

/**
 * What the committee sees of a waiting change (review M1): what was recorded
 * and who reviews it, without the outgoing owners' addresses, the committee
 * seats, the invitation state or anything about the recorder's addresses.
 */
export type CommitteePendingOwnerChangeView = {
  ownerName: string;
  settlementDate: string;
  recordedByName: string;
  recordedOn: string;
  reviewer: string;
};

export async function pendingOwnerChangeView(schemeId: string, lotId: string): Promise<PendingOwnerChangeView | null> {
  const row = await getPendingOwnerChange(schemeId, lotId);
  if (!row) return null;
  return toView(row, await schemeHasAdviser(schemeId));
}

export async function committeePendingOwnerChangeView(schemeId: string, lotId: string): Promise<CommitteePendingOwnerChangeView | null> {
  const row = await getPendingOwnerChange(schemeId, lotId);
  if (!row) return null;
  const by = await db.orm.public.Profile.where((p) => p.id.eq(row.recordedBy)).first();
  return {
    ownerName: row.ownerName,
    settlementDate: day(row.settlementDate),
    recordedByName: recorderName(by),
    recordedOn: recordedOn(row),
    reviewer: (await schemeHasAdviser(schemeId)) ? "the Adviser" : "StrataVerze",
  };
}

const recorderName = (by: { firstName?: string | null; lastName?: string | null } | null | undefined) =>
  [by?.firstName, by?.lastName].filter(Boolean).join(" ") || "A committee member";
// The day it was recorded, in StrataVerze's time zone (the lot pages do not load the building's).
const recordedOn = (row: RequestRow) => (row.recordedAt ? dayIn(PLATFORM_TIME_ZONE, String(row.recordedAt)) : "");

async function toView(row: RequestRow, hasAdviser: boolean): Promise<PendingOwnerChangeView> {
  const by = await db.orm.public.Profile.where((p) => p.id.eq(row.recordedBy)).first();
  const input = heldInput(row);
  const plan = await previewChangeOwner(db.orm, row.schemeId, row.lotId);
  const invitation = await planOwnerInvitation(db.orm, { schemeId: row.schemeId, lotId: row.lotId, email: input.email, invite: !!row.invite });
  // Every address on the recorder's account (review L4); their profile email alone if the Auth user cannot be read.
  let recorderAddresses: Iterable<string | null | undefined> = [by?.email];
  try {
    recorderAddresses = await currentAddressesOf(row.recordedBy);
  } catch {
    // Shown as far as the profile allows; confirming checks every address again and fails closed.
  }
  return {
    id: row.id,
    ownerName: input.ownerName,
    email: input.email,
    mobile: input.mobile,
    phone: input.phone,
    address: input.address,
    settlementDate: input.settlementDate,
    invite: !!row.invite,
    hasNotice: !!row.noticeDocumentId,
    recordedByName: recorderName(by),
    recordedByEmail: by?.email ?? null,
    recordedOn: recordedOn(row),
    reviewer: hasAdviser ? "the Adviser" : "StrataVerze",
    effect: {
      rollOwnerName: plan.rollOwnerName,
      accessEnding: plan.accessEnding.map((a) => ({ name: a.name, email: a.email })),
      seatsEnding: plan.seatsEnding.map((s) => s.name),
      seatsKept: plan.seatsKept.map((k) => ({ name: k.name, lotNumbers: k.lotNumbers })),
      invitation: invitation.kind,
      invitationActiveLot: invitation.activeLotNumber,
      withdrawnInvitations: invitation.withdrawn.map((w) => w.email),
    },
    fingerprint: planFingerprint(row.id, plan, invitation),
    resemblance: addressResemblance(input.email, recorderAddresses),
  };
}

/** Every change waiting for review, for StrataVerze only (oldest first). The caller checks the platform admin. */
export async function listPendingOwnerChanges(limit = 200) {
  const rows = await db.orm.public.OwnerChangeRequest
    .where((r) => r.status.eq("PENDING"))
    .orderBy((r) => r.recordedAt.asc())
    .limit(limit)
    .all();
  return Promise.all(
    rows.map(async (row) => {
      const [scheme, lot, hasAdviser] = await Promise.all([
        db.orm.public.Scheme.where((s) => s.id.eq(row.schemeId)).first(),
        db.orm.public.Lot.where((l) => and(l.id.eq(row.lotId), l.schemeId.eq(row.schemeId))).first(),
        schemeHasAdviser(row.schemeId),
      ]);
      return {
        schemeId: row.schemeId,
        schemeName: scheme ? `${scheme.name}${scheme.planNumber ? ` · ${scheme.planNumber}` : ""}` : "Unknown building",
        lotNumber: lot ? String(lot.lotNumber) : "?",
        view: await toView(row, hasAdviser),
      };
    }),
  );
}
