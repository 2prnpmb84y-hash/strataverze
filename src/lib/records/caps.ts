/**
 * Fee caps, deadlines and refusals for certificate kinds and records access
 * (pure, VIC, ACT and WA stage 2, PR 10a, 31 Oct 2026; Matthew Wrigley's
 * decisions D1 to D21 of 31 Oct 2026). Reads only the shapes in
 * CERTIFICATE_KINDS and RECORDS_ACCESS; imports no pack. Nothing here
 * writes: the store (10b) asks first and writes nothing on a refusal.
 *
 * Every cap is a ceiling on the fee the body sets itself. The fee is the one
 * the adviser enters, never filled in from the cap (D3), and a fee above the
 * cap is refused (`feeProblem`). Every rounding is down, and a fee unit cap
 * whose dollar value is not checked falls back to the parts fixed in cents
 * (D6), so the cap StrataVerze applies is never above the legal one.
 *
 * The words here are StrataVerze's own. Statutory words (a kind's refusal,
 * the update window, the questions) come from the pack.
 */
import type { AccessKindRule, CapGst, CertificateKindFee, CertificateKindRule, DatedCap, FeeUnitBand, FeeUnitCap, RecordsAccessRules } from "@/config/statutory";
import { addDays, addMonths } from "@/lib/levies/notice-plan";
import { addBusinessDays, feeYear } from "./fees";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_DAY = /^\d{2}-\d{2}$/;
const isWhole = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;
/** An own key of a table read by a value from a form, never one inherited from Object ("toString", "constructor"). */
const own = <T>(table: Readonly<Record<string, T>>, key: string): T | undefined => (Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined);
/** A day as YYYY-MM-DD, from a date string or a Date (as the ORM may give it). */
const dayOf = (v: string | Date) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);

/** Why a cap cannot be worked out; the action that needs it is refused and nothing is written. */
export type CapRefusalReason =
  | "BAD_DATE"
  | "NO_CAP_FOR_DATE"
  | "OVERLAPPING_CAPS"
  | "CAP_NOT_CHECKED"
  | "NEXT_YEAR_NOT_RECORDED"
  | "NO_BAND"
  | "QUESTION_UNANSWERED"
  | "NO_CAP_FOR_REQUESTER"
  | "COPIES_NOT_OFFERED"
  | "COPIES_TO_AGENT_REFUSED"
  | "MEDIUM_NEEDED"
  | "DEVICE_COST_NOT_STORAGE"
  | "BAD_COUNT";

export interface CapRefusal {
  ok: false;
  reason: CapRefusalReason;
  message: string;
}

/**
 * Why a cap is only the part fixed in cents (D6): the value of a fee unit is
 * not checked, or not held for the request's financial year.
 */
export type FloorReason = "FEE_UNIT_NOT_CHECKED" | "NO_FEE_UNIT_FOR_YEAR";

/** A cap worked out: its cents, whether they include GST, and why it is only a floor, if it is one. */
export interface Cap {
  ok: true;
  cents: number;
  includesGst: boolean;
  floor: FloorReason | null;
}

const refuse = (reason: CapRefusalReason, message: string): CapRefusal => ({ ok: false, reason, message });

/** The day after `date` that falls on MM-DD `monthDay` (the next 1 July after 1 July 2026 is 1 July 2027). */
function nextMonthDay(date: string, monthDay: string): string {
  const year = Number(date.slice(0, 4));
  const thisYear = `${year}-${monthDay}`;
  return thisYear > date ? thisYear : `${year + 1}-${monthDay}`;
}

/**
 * The dated cap for a request received on `requestedOn` (`from` inclusive,
 * `to` exclusive, a null `from` any date before `to`), or why there is none:
 * no cap covers the date, two do, its cents are not checked (NOT_CONFIRMED or
 * GUIDANCE values are never used), or, with `refuseFromNextYear`, an open
 * cap has run past the next MM-DD after its start with no later cap recorded.
 */
export function capOn(caps: readonly DatedCap[], requestedOn: string, refuseFromNextYear?: string): { ok: true; cap: DatedCap; cents: number } | CapRefusal {
  if (!ISO.test(requestedOn)) return refuse("BAD_DATE", "Enter the date the request was received.");
  const matching = caps.filter((c) => (c.from == null || c.from <= requestedOn) && (c.to == null || requestedOn < c.to));
  if (matching.length === 0) return refuse("NO_CAP_FOR_DATE", `StrataVerze holds no fee cap for a request received on ${requestedOn}, so this cannot be recorded yet.`);
  if (matching.length > 1) return refuse("OVERLAPPING_CAPS", `StrataVerze holds more than one fee cap for a request received on ${requestedOn}. Tell StrataVerze.`);
  const cap = matching[0];
  if (refuseFromNextYear && cap.to == null && (cap.from == null || requestedOn >= nextMonthDay(cap.from, refuseFromNextYear))) {
    return refuse("NEXT_YEAR_NOT_RECORDED", `StrataVerze does not hold the fee cap for a request received on ${requestedOn} yet, so this cannot be recorded until it is added.`);
  }
  // Never NaN, a fraction or a negative: such a value is treated as not checked, so it never reaches a message or a column.
  if (cap.cents.value == null || !isWhole(cap.cents.value)) return notChecked(requestedOn);
  return { ok: true, cap, cents: cap.cents.value };
}

const notChecked = (requestedOn: string) => refuse("CAP_NOT_CHECKED", `The fee cap for a request received on ${requestedOn} is not checked yet, so this cannot be recorded.`);

/**
 * What is wrong with a pack's list of dated caps, for the pack tests: a day
 * that is not YYYY-MM-DD, a `from` not before its `to`, two caps covering the
 * same day, or a `refuseFromNextYear` that is not MM-DD. Empty when sound.
 */
export function capListProblems(caps: readonly DatedCap[], refuseFromNextYear?: string): string[] {
  const problems: string[] = [];
  if (refuseFromNextYear !== undefined && !MONTH_DAY.test(refuseFromNextYear)) problems.push(`refuseFromNextYear ${refuseFromNextYear} is not MM-DD`);
  caps.forEach((c, i) => {
    if (c.from != null && !ISO.test(c.from)) problems.push(`cap ${i}: from ${c.from} is not a day`);
    if (c.to != null && !ISO.test(c.to)) problems.push(`cap ${i}: to ${c.to} is not a day`);
    if (c.from != null && c.to != null && !(c.from < c.to)) problems.push(`cap ${i}: from ${c.from} is not before to ${c.to}`);
  });
  caps.forEach((a, i) =>
    caps.forEach((b, j) => {
      // [a.from, a.to) and [b.from, b.to) overlap, a null bound being open.
      if (i < j && (a.from == null || b.to == null || a.from < b.to) && (b.from == null || a.to == null || b.from < a.to)) problems.push(`caps ${i} and ${j} overlap`);
    }),
  );
  return problems;
}

/** A cap with GST as `gst` says (D10), rounded down: added only for a building registered for GST. */
export function withGst(cents: number, gst: CapGst, gstRegistered: boolean): { cents: number; includesGst: boolean } {
  if (gst === "INCLUDED") return { cents, includesGst: true };
  return gstRegistered ? { cents: Math.floor((cents * 11) / 10), includesGst: true } : { cents, includesGst: false };
}

/** feeUnits × cents a fee unit, in whole cents rounded down, without binary fraction error (1.15 × 1,000 is 1,150). */
const feeUnitCents = (feeUnits: number, centsPerUnit: number) => Math.floor(Math.round(feeUnits * centsPerUnit * 1e6) / 1e6);

/**
 * A fee unit cap for a request received on `on`, with `pages` printed pages:
 * the full cap where the fee unit's value for that financial year is
 * checked; otherwise the floor, the parts fixed in cents only, and why.
 * Before GST.
 */
export function feeUnitCap(cap: FeeUnitCap, on: string, pages: number): { ok: true; cents: number; floor: FloorReason | null } | CapRefusal {
  // A part that is not a whole number of cents (or a fee unit count that is not a finite non-negative number) is not checked.
  if (!isWhole(cap.plusCents) || !isWhole(cap.perPageCents) || !isWhole(pages) || !(Number.isFinite(cap.feeUnits) && cap.feeUnits >= 0)) return notChecked(on);
  const fixed = cap.plusCents + cap.perPageCents * pages;
  const table = cap.centsPerFeeUnit.value;
  if (table == null) return { ok: true, cents: fixed, floor: "FEE_UNIT_NOT_CHECKED" };
  if (!MONTH_DAY.test(table.yearStartsOn)) return notChecked(on);
  const unit = own(table.byYear, feeYear(on, table.yearStartsOn));
  if (unit == null) return { ok: true, cents: fixed, floor: "NO_FEE_UNIT_FOR_YEAR" };
  if (!isWhole(unit)) return notChecked(on);
  return { ok: true, cents: feeUnitCents(cap.feeUnits, unit) + fixed, floor: null };
}

type BandFee = Extract<CertificateKindFee, { basis: "FEE_UNIT_BANDS" }>;

/**
 * The turnaround band for a certificate given within `withinBusinessDays`:
 * the narrowest band that covers it. Null (business days are not decided,
 * D5) gives the pack's `bandUntilBusinessDaysDecided`, the lowest cap (D7).
 */
export function certificateBand(fee: BandFee, withinBusinessDays: number | null): FeeUnitBand | null {
  if (withinBusinessDays != null && !isWhole(withinBusinessDays)) return null;
  if (withinBusinessDays == null) return fee.bands.find((b) => b.withinBusinessDays === fee.bandUntilBusinessDaysDecided) ?? null;
  return [...fee.bands].sort((a, b) => a.withinBusinessDays - b.withinBusinessDays).find((b) => withinBusinessDays <= b.withinBusinessDays) ?? null;
}

const capOf = (cents: number, gst: CapGst, gstRegistered: boolean, floor: FloorReason | null): Cap => ({ ok: true, ...withGst(cents, gst, gstRegistered), floor });

/**
 * The cap on a certificate's fee: a dated cap for the request's date (ACT,
 * WA), or a fee unit band (VIC) for the standard or additional certificate,
 * which the adviser must answer (`additional`, never pre-filled, D8).
 */
export function certificateCap(kind: Pick<CertificateKindRule, "fee">, input: { requestedOn: string; additional: boolean | null; gstRegistered: boolean; withinBusinessDays?: number | null }): Cap | CapRefusal {
  const fee = kind.fee;
  if (fee.basis === "DATED_CENTS") {
    const on = capOn(fee.caps, input.requestedOn, fee.refuseFromNextYear);
    if (!on.ok) return on;
    return capOf(on.cents, on.cap.gst, input.gstRegistered, null);
  }
  if (!ISO.test(input.requestedOn)) return refuse("BAD_DATE", "Enter the date the request was received.");
  if (input.additional == null) return refuse("QUESTION_UNANSWERED", `Answer: ${fee.additionalQuestion}`);
  const band = certificateBand(fee, input.withinBusinessDays ?? null);
  if (!band) return refuse("NO_BAND", "StrataVerze holds no fee cap for that turnaround. Tell StrataVerze.");
  const cap = input.additional ? band.additional : band.standard;
  const part = feeUnitCap(cap, input.requestedOn, 0);
  if (!part.ok) return part;
  return capOf(part.cents, cap.gst, input.gstRegistered, part.floor);
}

/** What was given under a records access request, as the adviser records it. */
export interface AccessGiven {
  requestedOn: string;
  /** Who is asking: one of the pack's requester types. The request is by an agent when it is the pack's agentType. */
  requesterType: string;
  inspected: boolean;
  /** Records copied, and printed pages in all. Zero for none. */
  records: number;
  pages: number;
  medium: "PHOTOCOPY" | "ELECTRONIC" | "STORAGE_DEVICE" | null;
  /** The cost of a storage device, entered by the adviser (STORAGE_DEVICE only). */
  deviceCents: number | null;
  /** The adviser's answer to the kind's nil fee question, where it has one (never pre-filled, D14). */
  alsoSaleCertificate: boolean | null;
  gstRegistered: boolean;
}

/**
 * The cap on a records access fee: the inspection fee by requester type (a
 * dated cap, or free) if the records were inspected, plus the copies by the
 * kind's basis. Refused: a requester type with no cap, copies a kind does
 * not offer, copies by the pack's agent type where the kind refuses them, a
 * missing medium, a device cost with another medium, a bad count, a cap not
 * checked, and the kind's nil question unanswered. Everything is checked
 * first; only then is the fee nil where that question is answered yes (D14).
 * Recording no copies is always allowed. Several parts: the cap includes GST
 * only if every part that can be charged does.
 */
export function accessCap(
  rules: Pick<RecordsAccessRules, "agentType">,
  kind: Pick<AccessKindRule, "inspection" | "copies" | "nilWhen" | "agentRefused" | "refuseFromNextYear">,
  given: AccessGiven,
): Cap | CapRefusal {
  if (!ISO.test(given.requestedOn)) return refuse("BAD_DATE", "Enter the date the request was received.");
  if (!isWhole(given.records) || !isWhole(given.pages)) return refuse("BAD_COUNT", "Enter the records and pages copied as whole numbers (0 if none).");
  if (given.deviceCents != null && (!isWhole(given.deviceCents) || given.medium !== "STORAGE_DEVICE")) {
    return refuse("DEVICE_COST_NOT_STORAGE", "A device cost is recorded only for copies given on a storage device.");
  }
  const copied = given.records > 0 || given.pages > 0 || given.medium != null;
  const parts: Cap[] = [];
  if (given.inspected && kind.inspection !== "FREE") {
    const caps = own(kind.inspection, given.requesterType) ?? own(kind.inspection, "*");
    if (!caps) return refuse("NO_CAP_FOR_REQUESTER", "StrataVerze holds no inspection fee cap for who is asking.");
    const on = capOn(caps, given.requestedOn, kind.refuseFromNextYear);
    if (!on.ok) return on;
    parts.push(capOf(on.cents, on.cap.gst, given.gstRegistered, null));
  }
  if (copied) {
    const c = kind.copies;
    if (!c) return refuse("COPIES_NOT_OFFERED", "Copies are not recorded under this kind of request.");
    if (given.requesterType === rules.agentType && kind.agentRefused) return refuse("COPIES_TO_AGENT_REFUSED", kind.agentRefused.words);
    if (c.basis === "PER_RECORD") {
      if (given.records < 1) return refuse("BAD_COUNT", "Enter how many records were copied.");
      if (!isWhole(c.additionalRecordCents)) return notChecked(given.requestedOn);
      const first = feeUnitCap(c.first, given.requestedOn, given.pages);
      if (!first.ok) return first;
      parts.push(capOf(first.cents + (given.records - 1) * c.additionalRecordCents, c.first.gst, given.gstRegistered, first.floor));
    } else if (c.basis === "FEE_UNITS") {
      const part = feeUnitCap(c.cap, given.requestedOn, given.pages);
      if (!part.ok) return part;
      parts.push(capOf(part.cents, c.cap.gst, given.gstRegistered, part.floor));
    } else if (c.basis === "BY_MEDIUM") {
      if (given.medium == null) return refuse("MEDIUM_NEEDED", "Choose how the copies were given.");
      const p = c.photocopy;
      if (![p.firstPages, p.firstCents, p.extraPageCents, c.electronicCents, c.storageDeviceCents].every(isWhole)) return notChecked(given.requestedOn);
      const fixed = given.medium === "PHOTOCOPY" ? p.firstCents + Math.max(0, given.pages - p.firstPages) * p.extraPageCents : given.medium === "ELECTRONIC" ? c.electronicCents : c.storageDeviceCents;
      // GST is added to the fee only, never to the device cost the adviser enters (the lower cap: never an overcharge).
      // A StrataVerze reading, for review with the WA pack (10b).
      const part = withGst(fixed, c.gst, given.gstRegistered);
      parts.push({ ok: true, cents: part.cents + (given.medium === "STORAGE_DEVICE" ? (given.deviceCents ?? 0) : 0), includesGst: part.includesGst, floor: null });
    }
  }
  if (kind.nilWhen) {
    if (given.alsoSaleCertificate == null) return refuse("QUESTION_UNANSWERED", `Answer: ${kind.nilWhen.question}`);
    if (given.alsoSaleCertificate) return { ok: true, cents: 0, includesGst: false, floor: null };
  }
  const charged = parts.filter((p) => p.cents > 0);
  return {
    ok: true,
    cents: parts.reduce((sum, p) => sum + p.cents, 0),
    includesGst: charged.length > 0 && charged.every((p) => p.includesGst),
    floor: parts.find((p) => p.floor)?.floor ?? null,
  };
}

/**
 * Why the fee the adviser entered cannot be recorded against the cap: not a
 * whole number of cents, or above the cap. A floor says the cap's dollar
 * amount is not checked yet. Null when it can be recorded.
 */
export function feeProblem(cap: Cap, feeCents: unknown): string | null {
  if (!isWhole(feeCents)) return "Enter the fee charged, in dollars and cents (0 if none).";
  if (feeCents <= cap.cents) return null;
  const at = `$${(cap.cents / 100).toFixed(2)}`;
  if (cap.floor) return `The fee is above ${at}, the most StrataVerze can record until the cap's dollar amount is checked.`;
  return `The fee is above the cap of ${at}${cap.includesGst ? " including GST" : ""}.`;
}

/**
 * When a certificate of this kind must be given: a day (calendar days from
 * the request, D4; business days skipping weekends only, which is never later
 * than the legal day), or not checked, never shown as a date (D5).
 */
export function kindDue(kind: Pick<CertificateKindRule, "giveWithin">, requestedOn: string): { due: string } | { notChecked: true; days: number | null } {
  const g = kind.giveWithin;
  if (g.value == null) return { notChecked: true, days: g.guidance?.days ?? null };
  if (!isWhole(g.value.days) || !ISO.test(requestedOn)) return { notChecked: true, days: null };
  return { due: g.value.count === "CALENDAR" ? addDays(requestedOn, g.value.days) : addBusinessDays(requestedOn, g.value.days) };
}

/** The questions the adviser must answer for a certificate kind or access kind, never pre-filled (D8, D14). */
export function kindQuestions(kind: Partial<Pick<CertificateKindRule, "fee">> & Partial<Pick<AccessKindRule, "nilWhen">>): Array<{ key: "ADDITIONAL_CERTIFICATE" | "ALSO_SALE_CERTIFICATE"; question: string }> {
  return [
    ...(kind.fee?.basis === "FEE_UNIT_BANDS" ? [{ key: "ADDITIONAL_CERTIFICATE" as const, question: kind.fee.additionalQuestion }] : []),
    ...(kind.nilWhen ? [{ key: kind.nilWhen.key, question: kind.nilWhen.question }] : []),
  ];
}

/** The kinds a new certificate may be started for: every kind but one the pack refuses (D11). */
export function startableKinds<K extends Pick<CertificateKindRule, "refused">>(kinds: readonly K[]): K[] {
  return kinds.filter((k) => !k.refused);
}

/**
 * Why a certificate of `kindKey` cannot be started for `requesterType`, or
 * null: an unknown kind, a kind the pack refuses (its words), or a requester
 * type outside the pack's list or the kind's narrower one.
 */
export function kindRequestProblem(
  rules: { requesterTypes: Readonly<Record<string, string>>; kinds: readonly Pick<CertificateKindRule, "key" | "refused" | "requesterTypes">[] },
  kindKey: string,
  requesterType: string,
): { field: "kind" | "requesterType"; message: string } | null {
  const kind = rules.kinds.find((k) => k.key === kindKey);
  if (!kind) return { field: "kind", message: "Choose the kind of certificate." };
  if (kind.refused) return { field: "kind", message: kind.refused.words };
  if (!Object.prototype.hasOwnProperty.call(rules.requesterTypes, requesterType) || (kind.requesterTypes && !kind.requesterTypes.includes(requesterType))) {
    return { field: "requesterType", message: "Choose who is asking." };
  }
  return null;
}

/**
 * Whether a kind that needs an earlier certificate (`after`, ACT update, D12)
 * may be requested on `requestedOn`: an ISSUED certificate of that kind for
 * the same lot, dated on or after `requestedOn` less the months and on or
 * before `requestedOn`. Drafts, cancelled certificates and certificates given
 * outside StrataVerze do not count. Null when allowed; the pack's words when
 * not.
 */
export function afterProblem(
  kind: Pick<CertificateKindRule, "after">,
  requestedOn: string,
  lotCertificates: readonly { kind: string | null; status: string; certificateDate: string | Date | null }[],
): string | null {
  const after = kind.after;
  if (!after) return null;
  if (!ISO.test(requestedOn) || !isWhole(after.withinMonths)) return after.words;
  const earliest = addMonths(requestedOn, -after.withinMonths);
  const found = lotCertificates.some((c) => {
    if (c.kind !== after.kind || c.status !== "ISSUED" || c.certificateDate == null) return false;
    const on = dayOf(c.certificateDate);
    return ISO.test(on) && on >= earliest && on <= requestedOn;
  });
  return found ? null : after.words;
}

