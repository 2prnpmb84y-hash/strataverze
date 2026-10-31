/**
 * The fee cap engine for certificate kinds and records access (VIC, ACT and
 * WA stage 2, PR 10a), on fixtures in the pack shapes, not on pack values
 * (no draft pack holds CERTIFICATE_KINDS or RECORDS_ACCESS yet).
 */
import { describe, expect, it } from "vitest";
import type { AccessKindRule, CertificateKindRule, CheckedValue, DatedCap, FeeUnitCap } from "@/config/statutory";
import { accessCap as accessCapFor, afterProblem, capListProblems, capOn, certificateBand, certificateCap, feeProblem, feeUnitCap, kindDue, kindQuestions, kindRequestProblem, startableKinds, withGst, type AccessGiven, type Cap } from "./caps";

const confirmed = (value: number): CheckedValue<number> => ({ value, status: "CONFIRMED", source: "fixture" });
const notConfirmed = (guidance: number): CheckedValue<number> => ({ value: null, status: "NOT_CONFIRMED", source: "fixture", note: "start date not read", guidance });

/** ACT-like: a 2025-26 amount not confirmed, then a cap from 1 July 2026 with no end yet, GST included. */
const ACT_LIKE: DatedCap[] = [
  { from: "2025-07-01", to: "2026-07-01", cents: notConfirmed(34_200), gst: "INCLUDED", source: "fixture 2025-26" },
  { from: "2026-07-01", to: null, cents: confirmed(35_300), gst: "INCLUDED", source: "fixture 2026-27" },
];
/** WA-like: one cap with no amendment, any request date, plus 10% if GST is remitted. */
const WA_LIKE: DatedCap[] = [{ from: null, to: null, cents: confirmed(14_000), gst: "ADD_10_IF_GST_REGISTERED", source: "fixture reg" }];

const UNCHECKED_UNIT: FeeUnitCap["centsPerFeeUnit"] = { value: null, status: "NOT_CONFIRMED", source: "fixture", note: "calculated only", guidance: { yearStartsOn: "07-01", byYear: { "2026-27": 1_727 } } };
const CHECKED_UNIT: FeeUnitCap["centsPerFeeUnit"] = { value: { yearStartsOn: "07-01", byYear: { "2026-27": 1_727 } }, status: "STRATAVERZE", source: "fixture" };
const fu = (feeUnits: number, centsPerFeeUnit: FeeUnitCap["centsPerFeeUnit"] = UNCHECKED_UNIT, plusCents = 0, perPageCents = 0): FeeUnitCap => ({ feeUnits, plusCents, perPageCents, centsPerFeeUnit, gst: "MAY_BE_ADDED", source: "fixture" });
const bands = (unit: FeeUnitCap["centsPerFeeUnit"] = UNCHECKED_UNIT) => [
  { withinBusinessDays: 2, standard: fu(17.35, unit), additional: fu(9.54, unit) },
  { withinBusinessDays: 5, standard: fu(14.46, unit), additional: fu(7.95, unit) },
  { withinBusinessDays: 10, standard: fu(9.64, unit), additional: fu(5.3, unit) },
];
const VIC_LIKE = (unit: FeeUnitCap["centsPerFeeUnit"] = UNCHECKED_UNIT): Pick<CertificateKindRule, "fee"> => ({ fee: { basis: "FEE_UNIT_BANDS", bands: bands(unit), bandUntilBusinessDaysDecided: 10, additionalQuestion: "Fixture question: an additional certificate?" } });

const given = (o: Partial<AccessGiven> = {}): AccessGiven => ({ requestedOn: "2026-10-27", requesterType: "OWNER", inspected: false, records: 0, pages: 0, medium: null, deviceCents: null, alsoSaleCertificate: null, gstRegistered: false, ...o });
const cents = (c: Cap | { ok: false }) => (c.ok ? c.cents : c);
/** The fixtures' agent type is AGENT (a representative). */
const accessCap = (kind: Parameters<typeof accessCapFor>[1], g: AccessGiven) => accessCapFor({ agentType: "AGENT" }, kind, g);

describe("capOn", () => {
  it("applies a cap from its first day (inclusive) to its end (exclusive)", () => {
    const caps: DatedCap[] = [
      { from: "2026-07-01", to: "2027-07-01", cents: confirmed(100), gst: "INCLUDED", source: "a" },
      { from: "2027-07-01", to: null, cents: confirmed(200), gst: "INCLUDED", source: "b" },
    ];
    expect(capOn(caps, "2026-07-01")).toMatchObject({ ok: true, cents: 100 });
    expect(capOn(caps, "2027-06-30")).toMatchObject({ ok: true, cents: 100 });
    expect(capOn(caps, "2027-07-01")).toMatchObject({ ok: true, cents: 200 });
  });

  it("refuses a request before the first cap, and a date that is not a day", () => {
    expect(capOn(ACT_LIKE, "2025-06-30")).toMatchObject({ ok: false, reason: "NO_CAP_FOR_DATE" });
    expect(capOn(ACT_LIKE, "30/06/2026")).toMatchObject({ ok: false, reason: "BAD_DATE" });
  });

  it("never uses a NOT_CONFIRMED or GUIDANCE amount, even one held as guidance", () => {
    const r = capOn(ACT_LIKE, "2026-06-30");
    expect(r).toMatchObject({ ok: false, reason: "CAP_NOT_CHECKED" });
    const guidance: DatedCap[] = [{ from: null, to: null, cents: { value: null, status: "GUIDANCE", source: "g", note: "guidance only", guidance: 500 }, gst: "INCLUDED", source: "g" }];
    expect(capOn(guidance, "2026-10-27")).toMatchObject({ ok: false, reason: "CAP_NOT_CHECKED" });
  });

  it("applies an undated cap to any request date", () => {
    expect(capOn(WA_LIKE, "2019-01-01")).toMatchObject({ ok: true, cents: 14_000 });
    expect(capOn(WA_LIKE, "2031-12-31")).toMatchObject({ ok: true, cents: 14_000 });
  });

  it("refuses an open cap from the next 1 July after it started, until a later cap is recorded", () => {
    expect(capOn(ACT_LIKE, "2027-06-30", "07-01")).toMatchObject({ ok: true, cents: 35_300 });
    expect(capOn(ACT_LIKE, "2027-07-01", "07-01")).toMatchObject({ ok: false, reason: "NEXT_YEAR_NOT_RECORDED" });
    // A cap that starts part way through a year runs to the next 1 July only.
    expect(capOn([{ ...ACT_LIKE[1], from: "2026-03-15" }], "2026-07-01", "07-01")).toMatchObject({ ok: false, reason: "NEXT_YEAR_NOT_RECORDED" });
    // Without a start day there is nothing to count from: refused.
    expect(capOn(WA_LIKE, "2026-10-27", "07-01")).toMatchObject({ ok: false, reason: "NEXT_YEAR_NOT_RECORDED" });
  });

  it("refuses overlapping caps rather than choose one", () => {
    expect(capOn([...WA_LIKE, ...ACT_LIKE], "2026-10-27")).toMatchObject({ ok: false, reason: "OVERLAPPING_CAPS" });
  });
});

describe("GST (D10)", () => {
  it("is in the cap already when INCLUDED, and added (10%, rounded down) only for a building registered for GST", () => {
    expect(withGst(35_300, "INCLUDED", false)).toEqual({ cents: 35_300, includesGst: true });
    expect(withGst(35_300, "INCLUDED", true)).toEqual({ cents: 35_300, includesGst: true });
    expect(withGst(14_000, "ADD_10_IF_GST_REGISTERED", false)).toEqual({ cents: 14_000, includesGst: false });
    expect(withGst(14_000, "ADD_10_IF_GST_REGISTERED", true)).toEqual({ cents: 15_400, includesGst: true });
    expect(withGst(1_725, "MAY_BE_ADDED", true)).toEqual({ cents: 1_897, includesGst: true });
  });

  it("is applied to a dated certificate cap", () => {
    const kind = { fee: { basis: "DATED_CENTS" as const, caps: WA_LIKE } };
    expect(certificateCap(kind, { requestedOn: "2026-10-27", additional: null, gstRegistered: false })).toEqual({ ok: true, cents: 14_000, includesGst: false, floor: null });
    expect(certificateCap(kind, { requestedOn: "2026-10-27", additional: null, gstRegistered: true })).toEqual({ ok: true, cents: 15_400, includesGst: true, floor: null });
  });
});

describe("fee unit caps (D6, D7)", () => {
  it("are the parts fixed in cents while a fee unit's value is not checked: a certificate $0", () => {
    expect(feeUnitCap(fu(9.64), "2026-10-27", 0)).toEqual({ ok: true, cents: 0, floor: "FEE_UNIT_NOT_CHECKED" });
    expect(certificateCap(VIC_LIKE(), { requestedOn: "2026-10-27", additional: false, gstRegistered: true })).toEqual({ ok: true, cents: 0, includesGst: true, floor: "FEE_UNIT_NOT_CHECKED" });
  });

  it("are in full with a checked fee unit value, rounded down, and the floor in a year without one", () => {
    expect(feeUnitCap(fu(9.64, CHECKED_UNIT), "2026-10-27", 0)).toEqual({ ok: true, cents: 16_648, floor: null }); // 9.64 × $17.27 = $166.4828
    expect(feeUnitCap(fu(1.15, CHECKED_UNIT, 0, 20), "2026-10-27", 3)).toEqual({ ok: true, cents: 1_986 + 60, floor: null }); // 1.15 × $17.27 = $19.8605
    expect(feeUnitCap(fu(1.15, { value: { yearStartsOn: "07-01", byYear: { "2026-27": 1_000 } }, status: "STRATAVERZE", source: "fixture" }), "2026-10-27", 0)).toMatchObject({ cents: 1_150 });
    expect(feeUnitCap(fu(9.64, CHECKED_UNIT), "2027-07-01", 0)).toEqual({ ok: true, cents: 0, floor: "NO_FEE_UNIT_FOR_YEAR" });
  });

  it("use the lowest-cap band until business days are decided, and the narrowest band that covers a turnaround", () => {
    const fee = VIC_LIKE(CHECKED_UNIT).fee as Extract<CertificateKindRule["fee"], { basis: "FEE_UNIT_BANDS" }>;
    expect(certificateBand(fee, null)?.withinBusinessDays).toBe(10);
    expect(certificateBand(fee, 1)?.withinBusinessDays).toBe(2);
    expect(certificateBand(fee, 3)?.withinBusinessDays).toBe(5);
    expect(certificateBand(fee, 10)?.withinBusinessDays).toBe(10);
    expect(certificateBand(fee, 11)).toBeNull();
    expect(certificateBand({ ...fee, bandUntilBusinessDaysDecided: 7 }, null)).toBeNull();
    expect(certificateCap(VIC_LIKE(CHECKED_UNIT), { requestedOn: "2026-10-27", additional: false, gstRegistered: false })).toEqual({ ok: true, cents: 16_648, includesGst: false, floor: null });
    expect(certificateCap(VIC_LIKE(CHECKED_UNIT), { requestedOn: "2026-10-27", additional: true, gstRegistered: false })).toEqual({ ok: true, cents: 9_153, includesGst: false, floor: null }); // 5.3 × $17.27 = $91.531
    expect(certificateCap(VIC_LIKE(CHECKED_UNIT), { requestedOn: "2026-10-27", additional: false, gstRegistered: false, withinBusinessDays: 2 })).toMatchObject({ cents: 29_963 }); // 17.35 × $17.27 = $299.6345
    expect(certificateCap(VIC_LIKE(CHECKED_UNIT), { requestedOn: "2026-10-27", additional: false, gstRegistered: false, withinBusinessDays: 15 })).toMatchObject({ ok: false, reason: "NO_BAND" });
  });

  it("refuse while the additional certificate question is not answered (D8)", () => {
    expect(certificateCap(VIC_LIKE(), { requestedOn: "2026-10-27", additional: null, gstRegistered: false })).toEqual({ ok: false, reason: "QUESTION_UNANSWERED", message: "Answer: Fixture question: an additional certificate?" });
  });
});

describe("records access caps", () => {
  const VIC_RECORDS: Pick<AccessKindRule, "inspection" | "copies" | "nilWhen" | "agentRefused"> = { inspection: "FREE", copies: { basis: "PER_RECORD", first: fu(1.15, UNCHECKED_UNIT, 0, 20), additionalRecordCents: 760 } };
  const VIC_REGISTER: Pick<AccessKindRule, "inspection" | "copies" | "nilWhen" | "agentRefused"> = { inspection: "FREE", copies: { basis: "FEE_UNITS", cap: fu(3.03, UNCHECKED_UNIT, 0, 20) }, agentRefused: { words: "Fixture: copies of the register are not given to a representative yet.", source: "fixture" } };
  const WA_RECORDS: Pick<AccessKindRule, "inspection" | "copies" | "nilWhen" | "agentRefused"> = {
    inspection: { OWNER: [{ from: null, to: null, cents: confirmed(100), gst: "ADD_10_IF_GST_REGISTERED", source: "f" }], AUTHORISED_PERSON: [{ from: null, to: null, cents: confirmed(10_000), gst: "ADD_10_IF_GST_REGISTERED", source: "f" }] },
    copies: { basis: "BY_MEDIUM", photocopy: { firstPages: 5, firstCents: 5_000, extraPageCents: 100 }, electronicCents: 5_000, storageDeviceCents: 5_000, plusDeviceCost: true, gst: "ADD_10_IF_GST_REGISTERED", source: "f" },
  };
  const ACT_RECORDS: Pick<AccessKindRule, "inspection" | "copies" | "nilWhen" | "agentRefused"> = {
    inspection: { "*": [{ from: "2026-07-01", to: null, cents: confirmed(13_400), gst: "INCLUDED", source: "f" }] },
    copies: { basis: "INCLUDED" },
    nilWhen: { key: "ALSO_SALE_CERTIFICATE", question: "Fixture: did they also ask for a sale certificate?", source: "f" },
  };

  it("VIC: free inspection, and copies at the floor: $7.60 for each additional record and 20c a page (3 records, 10 pages: $17.20)", () => {
    expect(accessCap(VIC_RECORDS, given({ inspected: true }))).toEqual({ ok: true, cents: 0, includesGst: false, floor: null });
    expect(accessCap(VIC_RECORDS, given({ inspected: true, records: 3, pages: 10 }))).toEqual({ ok: true, cents: 760 * 2 + 200, includesGst: false, floor: "FEE_UNIT_NOT_CHECKED" });
    expect(cents(accessCap(VIC_REGISTER, given({ pages: 4 })))).toBe(80);
    expect(accessCap(VIC_RECORDS, given({ pages: 4 }))).toMatchObject({ ok: false, reason: "BAD_COUNT" });
  });

  it("VIC: refuses register copies to a representative, but not the inspection", () => {
    expect(accessCap(VIC_REGISTER, given({ requesterType: "AGENT", pages: 2 }))).toEqual({ ok: false, reason: "COPIES_TO_AGENT_REFUSED", message: "Fixture: copies of the register are not given to a representative yet." });
    expect(accessCap(VIC_REGISTER, given({ requesterType: "AGENT", inspected: true }))).toMatchObject({ ok: true, cents: 0 });
  });

  it("WA: the inspection fee by who asks, and copies by medium (5 pages $50, 6 pages $51, electronic $50, a device $50 plus its cost)", () => {
    expect(cents(accessCap(WA_RECORDS, given({ inspected: true })))).toBe(100);
    expect(cents(accessCap(WA_RECORDS, given({ inspected: true, requesterType: "AUTHORISED_PERSON" })))).toBe(10_000);
    expect(cents(accessCap(WA_RECORDS, given({ medium: "PHOTOCOPY", pages: 5 })))).toBe(5_000);
    expect(cents(accessCap(WA_RECORDS, given({ medium: "PHOTOCOPY", pages: 6 })))).toBe(5_100);
    expect(cents(accessCap(WA_RECORDS, given({ medium: "ELECTRONIC", records: 2 })))).toBe(5_000);
    expect(cents(accessCap(WA_RECORDS, given({ medium: "STORAGE_DEVICE", deviceCents: 1_299 })))).toBe(6_299);
    expect(accessCap(WA_RECORDS, given({ inspected: true, medium: "PHOTOCOPY", pages: 6 }))).toEqual({ ok: true, cents: 5_200, includesGst: false, floor: null });
  });

  it("WA: GST added to the fees for a registered building, never to the device cost", () => {
    expect(accessCap(WA_RECORDS, given({ inspected: true, medium: "STORAGE_DEVICE", deviceCents: 1_000, gstRegistered: true }))).toEqual({ ok: true, cents: 110 + 5_500 + 1_000, includesGst: true, floor: null });
  });

  it("WA: recording no copies is always allowed; a missing medium and a device cost on a photocopy are refused", () => {
    expect(accessCap(WA_RECORDS, given({ inspected: true }))).toMatchObject({ ok: true });
    expect(accessCap(WA_RECORDS, given({ pages: 3 }))).toMatchObject({ ok: false, reason: "MEDIUM_NEEDED" });
    expect(accessCap(WA_RECORDS, given({ medium: "PHOTOCOPY", pages: 3, deviceCents: 500 }))).toMatchObject({ ok: false, reason: "DEVICE_COST_NOT_STORAGE" });
    expect(accessCap(WA_RECORDS, given({ inspected: true, requesterType: "BUYER" }))).toMatchObject({ ok: false, reason: "NO_CAP_FOR_REQUESTER" });
  });

  it("ACT: nil where they also asked for a sale certificate, the dated cap otherwise, and refused unanswered (D14)", () => {
    expect(accessCap(ACT_RECORDS, given({ inspected: true, pages: 20, alsoSaleCertificate: true }))).toEqual({ ok: true, cents: 0, includesGst: false, floor: null });
    expect(accessCap(ACT_RECORDS, given({ inspected: true, pages: 20, alsoSaleCertificate: false }))).toEqual({ ok: true, cents: 13_400, includesGst: true, floor: null });
    expect(accessCap(ACT_RECORDS, given({ inspected: true }))).toEqual({ ok: false, reason: "QUESTION_UNANSWERED", message: "Answer: Fixture: did they also ask for a sale certificate?" });
    expect(accessCap(ACT_RECORDS, given({ inspected: true, alsoSaleCertificate: false, requestedOn: "2026-06-30" }))).toMatchObject({ ok: false, reason: "NO_CAP_FOR_DATE" });
  });

  it("refuses copies a kind does not offer, and counts that are not whole", () => {
    expect(accessCap({ inspection: "FREE" }, given({ pages: 1 }))).toMatchObject({ ok: false, reason: "COPIES_NOT_OFFERED" });
    expect(accessCap(WA_RECORDS, given({ medium: "PHOTOCOPY", pages: 1.5 }))).toMatchObject({ ok: false, reason: "BAD_COUNT" });
    expect(accessCap(WA_RECORDS, given({ medium: "PHOTOCOPY", pages: -1 }))).toMatchObject({ ok: false, reason: "BAD_COUNT" });
    expect(accessCap(WA_RECORDS, given({ requestedOn: "" }))).toMatchObject({ ok: false, reason: "BAD_DATE" });
  });
});

describe("the fee entered (D3)", () => {
  const cap: Cap = { ok: true, cents: 15_400, includesGst: true, floor: null };
  it("may be anything up to the cap, never above, in whole cents", () => {
    expect(feeProblem(cap, 0)).toBeNull();
    expect(feeProblem(cap, 15_400)).toBeNull();
    expect(feeProblem(cap, 15_401)).toBe("The fee is above the cap of $154.00 including GST.");
    expect(feeProblem(cap, 100.5)).toBe("Enter the fee charged, in dollars and cents (0 if none).");
    expect(feeProblem(cap, null)).toBe("Enter the fee charged, in dollars and cents (0 if none).");
  });
  it("says when the cap is only the part fixed in cents", () => {
    expect(feeProblem({ ok: true, cents: 0, includesGst: false, floor: "FEE_UNIT_NOT_CHECKED" }, 1)).toBe("The fee is above $0.00, the most StrataVerze can record until the cap's dollar amount is checked.");
  });
});

describe("deadlines, questions and what may be started", () => {
  const kind = (o: Partial<CertificateKindRule>): CertificateKindRule => ({
    key: "SALE",
    title: "Fixture certificate",
    section: "fixture",
    items: [["1", "One"]],
    follows: "fixture",
    conclusiveNote: "fixture",
    fileStem: "fixture-certificate",
    showsLot: true,
    giveWithin: { value: { days: 14, count: "CALENDAR" }, status: "CONFIRMED", source: "f" },
    fee: { basis: "DATED_CENTS", caps: WA_LIKE },
    ...o,
  });

  it("gives a calendar deadline as the request day plus the days (D4), and an unchecked one never as a date (D5)", () => {
    expect(kindDue(kind({}), "2026-10-27")).toEqual({ due: "2026-11-10" });
    expect(kindDue(kind({ giveWithin: { value: null, status: "NOT_CONFIRMED", source: "f", note: "business day not confirmed", guidance: { days: 10, count: "BUSINESS" } } }), "2026-10-27")).toEqual({ notChecked: true, days: 10 });
    expect(kindDue(kind({ giveWithin: { value: { days: 5, count: "BUSINESS" }, status: "STRATAVERZE", source: "f" } }), "2026-10-23")).toEqual({ due: "2026-10-30" });
  });

  it("lists the questions the adviser must answer", () => {
    expect(kindQuestions(VIC_LIKE())).toEqual([{ key: "ADDITIONAL_CERTIFICATE", question: "Fixture question: an additional certificate?" }]);
    expect(kindQuestions({ nilWhen: { key: "ALSO_SALE_CERTIFICATE", question: "Q?", source: "f" } })).toEqual([{ key: "ALSO_SALE_CERTIFICATE", question: "Q?" }]);
    expect(kindQuestions(kind({}))).toEqual([]);
  });

  it("never offers a refused kind, and refuses it, an unknown kind and a requester outside the pack or the kind (D11, D16)", () => {
    const rental = kind({ key: "RENTAL", refused: { words: "Fixture: not offered until its contents are read.", source: "f" } });
    const lot = kind({ key: "LOT", requesterTypes: ["OWNER", "BUYER"] });
    const rules = { requesterTypes: { OWNER: "Owner", BUYER: "Buyer", MORTGAGEE: "Mortgagee" }, kinds: [kind({}), rental, lot] };
    expect(startableKinds(rules.kinds).map((k) => k.key)).toEqual(["SALE", "LOT"]);
    expect(kindRequestProblem(rules, "RENTAL", "OWNER")).toEqual({ field: "kind", message: "Fixture: not offered until its contents are read." });
    expect(kindRequestProblem(rules, "SCHEME", "OWNER")).toEqual({ field: "kind", message: "Choose the kind of certificate." });
    expect(kindRequestProblem(rules, "SALE", "AGENT")).toEqual({ field: "requesterType", message: "Choose who is asking." });
    expect(kindRequestProblem(rules, "SALE", "toString")).toEqual({ field: "requesterType", message: "Choose who is asking." });
    expect(kindRequestProblem(rules, "LOT", "MORTGAGEE")).toEqual({ field: "requesterType", message: "Choose who is asking." });
    expect(kindRequestProblem(rules, "LOT", "BUYER")).toBeNull();
  });

  it("allows an update only within the months after a sale certificate issued for the lot in StrataVerze (D12)", () => {
    const update = kind({ key: "SALE_UPDATE", after: { kind: "SALE", withinMonths: 4, words: "Fixture: an update needs a sale certificate given in the last 4 months.", source: "f" } });
    const sale = (certificateDate: string | null, status = "ISSUED") => ({ kind: "SALE", status, certificateDate });
    expect(afterProblem(update, "2026-10-27", [sale("2026-06-27")])).toBeNull(); // exactly 4 months
    expect(afterProblem(update, "2026-10-27", [sale("2026-06-26")])).toBe("Fixture: an update needs a sale certificate given in the last 4 months.");
    expect(afterProblem(update, "2026-10-27", [sale("2026-10-27")])).toBeNull();
    expect(afterProblem(update, "2026-10-27", [sale("2026-10-28")])).not.toBeNull();
    expect(afterProblem(update, "2026-10-27", [sale(null, "DRAFT"), sale("2026-09-01", "CANCELLED"), { kind: "SALE_UPDATE", status: "ISSUED", certificateDate: "2026-09-01" }])).not.toBeNull();
    expect(afterProblem(update, "2026-10-27", [])).not.toBeNull();
    expect(afterProblem(kind({}), "2026-10-27", [])).toBeNull();
  });
});

describe("review fixes (PR 10a review)", () => {
  const ACT_INSPECTION: DatedCap[] = [{ from: "2026-07-01", to: null, cents: confirmed(13_400), gst: "INCLUDED", source: "f" }];
  const ACT_RECORDS = (refuseFromNextYear?: string): Parameters<typeof accessCapFor>[1] => ({
    inspection: { "*": ACT_INSPECTION },
    ...(refuseFromNextYear ? { refuseFromNextYear } : {}),
    copies: { basis: "INCLUDED" },
    nilWhen: { key: "ALSO_SALE_CERTIFICATE", question: "Q?", source: "f" },
  });

  it("M1: refuses an access fee from the next 1 July after an open cap started (D13)", () => {
    const later = given({ inspected: true, alsoSaleCertificate: false, requestedOn: "2027-07-15" });
    expect(accessCap(ACT_RECORDS("07-01"), later)).toMatchObject({ ok: false, reason: "NEXT_YEAR_NOT_RECORDED" });
    expect(accessCap(ACT_RECORDS("07-01"), { ...later, requestedOn: "2027-06-30" })).toMatchObject({ ok: true, cents: 13_400 });
    expect(accessCap(ACT_RECORDS(), later)).toMatchObject({ ok: true, cents: 13_400 });
  });

  it("L1: a requester type named like an Object property has no cap, and nothing throws", () => {
    const kind: Parameters<typeof accessCapFor>[1] = { inspection: { OWNER: ACT_INSPECTION } };
    for (const requesterType of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
      expect(accessCap(kind, given({ inspected: true, requesterType }))).toMatchObject({ ok: false, reason: "NO_CAP_FOR_REQUESTER" });
    }
    const byYear = { yearStartsOn: "07-01", byYear: { "2026-27": 1_727 } };
    // A financial year key is built from a date, but an inherited one is never read either.
    expect(feeUnitCap(fu(1, { value: byYear, status: "CONFIRMED", source: "f" }), "2026-10-27", 0)).toMatchObject({ ok: true, cents: 1_727 });
  });

  it("L2: a cap or a fee unit value that is not a whole number of cents is not checked, never NaN, a fraction or a negative", () => {
    for (const bad of [Number.NaN, 100.5, -1, Number.POSITIVE_INFINITY]) {
      expect(capOn([{ from: null, to: null, cents: confirmed(bad), gst: "INCLUDED", source: "f" }], "2026-10-27"), String(bad)).toMatchObject({ ok: false, reason: "CAP_NOT_CHECKED" });
      expect(feeUnitCap(fu(1, { value: { yearStartsOn: "07-01", byYear: { "2026-27": bad } }, status: "CONFIRMED", source: "f" }), "2026-10-27", 0), String(bad)).toMatchObject({ ok: false, reason: "CAP_NOT_CHECKED" });
      expect(feeUnitCap(fu(1, UNCHECKED_UNIT, bad), "2026-10-27", 0), String(bad)).toMatchObject({ ok: false, reason: "CAP_NOT_CHECKED" });
      expect(feeUnitCap(fu(1, UNCHECKED_UNIT, 0, bad), "2026-10-27", 0), String(bad)).toMatchObject({ ok: false, reason: "CAP_NOT_CHECKED" });
      expect(feeUnitCap(fu(bad === 100.5 ? Number.NaN : bad), "2026-10-27", 0), String(bad)).toMatchObject({ ok: false, reason: "CAP_NOT_CHECKED" });
      expect(
        accessCap({ inspection: "FREE", copies: { basis: "BY_MEDIUM", photocopy: { firstPages: 5, firstCents: bad, extraPageCents: 100 }, electronicCents: 5_000, storageDeviceCents: 5_000, plusDeviceCost: true, gst: "INCLUDED", source: "f" } }, given({ medium: "ELECTRONIC" })),
        String(bad),
      ).toMatchObject({ ok: false, reason: "CAP_NOT_CHECKED" });
      expect(accessCap({ inspection: "FREE", copies: { basis: "PER_RECORD", first: fu(1.15, UNCHECKED_UNIT, 0, 20), additionalRecordCents: bad } }, given({ records: 2, pages: 2 })), String(bad)).toMatchObject({ ok: false, reason: "CAP_NOT_CHECKED" });
    }
    // A fee unit count may be a fraction (9.64), never negative or not a number.
    expect(feeUnitCap(fu(9.64, CHECKED_UNIT), "2026-10-27", 0)).toMatchObject({ ok: true });
    expect(certificateCap({ fee: { basis: "DATED_CENTS", caps: [{ from: null, to: null, cents: confirmed(Number.NaN), gst: "INCLUDED", source: "f" }] } }, { requestedOn: "2026-10-27", additional: null, gstRegistered: true })).toMatchObject({ ok: false, reason: "CAP_NOT_CHECKED" });
  });

  it("L3: a turnaround that is not a whole number of business days has no band", () => {
    const fee = VIC_LIKE(CHECKED_UNIT).fee as Extract<CertificateKindRule["fee"], { basis: "FEE_UNIT_BANDS" }>;
    for (const bad of [Number.NaN, -1, 2.5, Number.NEGATIVE_INFINITY]) expect(certificateBand(fee, bad), String(bad)).toBeNull();
    expect(certificateBand(fee, 0)?.withinBusinessDays).toBe(2);
    expect(certificateCap(VIC_LIKE(CHECKED_UNIT), { requestedOn: "2026-10-27", additional: false, gstRegistered: false, withinBusinessDays: Number.NaN })).toMatchObject({ ok: false, reason: "NO_BAND" });
  });

  it("L4: checks the copies before the nil fee, and the agent from the pack's agent type", () => {
    const nil = ACT_RECORDS();
    const { copies: _copies, ...noCopies } = nil;
    expect(accessCap(noCopies, given({ pages: 3, alsoSaleCertificate: true }))).toMatchObject({ ok: false, reason: "COPIES_NOT_OFFERED" });
    expect(accessCap(nil, given({ medium: "PHOTOCOPY", deviceCents: 5, alsoSaleCertificate: true }))).toMatchObject({ ok: false, reason: "DEVICE_COST_NOT_STORAGE" });
    expect(accessCap({ ...nil, inspection: { OWNER: ACT_INSPECTION } }, given({ inspected: true, requesterType: "BUYER", alsoSaleCertificate: true }))).toMatchObject({ ok: false, reason: "NO_CAP_FOR_REQUESTER" });
    expect(accessCap(nil, given({ inspected: true, pages: 3, alsoSaleCertificate: true }))).toEqual({ ok: true, cents: 0, includesGst: false, floor: null });
    const register: Parameters<typeof accessCapFor>[1] = { inspection: "FREE", copies: { basis: "FEE_UNITS", cap: fu(3.03, UNCHECKED_UNIT, 0, 20) }, agentRefused: { words: "Refused to a representative.", source: "f" } };
    expect(accessCapFor({ agentType: "AGENT" }, register, given({ requesterType: "AGENT", pages: 1 }))).toMatchObject({ reason: "COPIES_TO_AGENT_REFUSED" });
    expect(accessCapFor({ agentType: "REPRESENTATIVE" }, register, given({ requesterType: "AGENT", pages: 1 }))).toMatchObject({ ok: true, cents: 20 });
    expect(accessCapFor({ agentType: "REPRESENTATIVE" }, register, given({ requesterType: "REPRESENTATIVE", pages: 1 }))).toMatchObject({ reason: "COPIES_TO_AGENT_REFUSED" });
  });

  it("L4: finds what is wrong with a pack's list of dated caps", () => {
    expect(capListProblems(ACT_LIKE, "07-01")).toEqual([]);
    expect(capListProblems(WA_LIKE)).toEqual([]);
    expect(capListProblems(ACT_LIKE, "7-1")).toEqual(["refuseFromNextYear 7-1 is not MM-DD"]);
    expect(capListProblems([{ ...WA_LIKE[0], from: "2026-07-01", to: "2026-07-01" }])).toEqual(["cap 0: from 2026-07-01 is not before to 2026-07-01"]);
    expect(capListProblems([{ ...WA_LIKE[0], from: "1/7/2026" }])).toEqual(["cap 0: from 1/7/2026 is not a day"]);
    expect(capListProblems([...ACT_LIKE, { ...WA_LIKE[0], from: "2027-01-01" }])).toEqual(["caps 1 and 2 overlap"]);
    expect(capListProblems([...WA_LIKE, ...ACT_LIKE])).toEqual(["caps 0 and 1 overlap", "caps 0 and 2 overlap"]);
  });

  it("afterProblem reads a certificate date given as a Date, and refuses a request date that is not a day", () => {
    const update: Pick<CertificateKindRule, "after"> = { after: { kind: "SALE", withinMonths: 4, words: "Needs a sale certificate.", source: "f" } };
    expect(afterProblem(update, "2026-10-27", [{ kind: "SALE", status: "ISSUED", certificateDate: new Date("2026-06-27T00:00:00Z") }])).toBeNull();
    expect(afterProblem(update, "2026-10-27", [{ kind: "SALE", status: "ISSUED", certificateDate: new Date("2026-06-26T00:00:00Z") }])).toBe("Needs a sale certificate.");
    expect(afterProblem(update, "27/10/2026", [{ kind: "SALE", status: "ISSUED", certificateDate: "2026-10-01" }])).toBe("Needs a sale certificate.");
  });
});
