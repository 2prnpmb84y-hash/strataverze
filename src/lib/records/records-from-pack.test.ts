/**
 * Certificates, records inspections, record keeping and works quotes from the
 * building's rule pack (stage 2, step 9, 27 Oct 2026). Queensland gets the
 * body corporate certificate and records access in fee units; NSW stays as
 * it was.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QLD_RULE_PACK, RULE_PACKS, type NswRules, type StatutoryRules } from "@/config/statutory";

const NSW = RULE_PACKS.NSW.rules as NswRules;
const QLD = QLD_RULE_PACK.rules;

// ─── Store mocks (the database, the building's pack and its day) ─────

const pack = vi.hoisted(() => ({ rules: null as unknown, today: "2026-10-27" }));
const rows = vi.hoisted(() => ({
  lot: { id: "lot-1", schemeId: "s1", lotNumber: "7" } as Record<string, unknown> | null,
  scheme: { id: "s1", name: "Seaview", state: "QLD", timeZone: "Australia/Brisbane" } as Record<string, unknown>,
  cert: null as Record<string, unknown> | null,
  issued: [] as Record<string, unknown>[],
  inspection: null as Record<string, unknown> | null,
  notices: [] as Record<string, unknown>[],
  policies: [] as Record<string, unknown>[],
  created: [] as Record<string, unknown>[],
  updated: [] as Record<string, unknown>[],
}));
vi.mock("@/prisma/db", () => {
  const table = (name: string) => {
    const chain: Record<string, unknown> = {};
    const first = async () =>
      name === "Lot" ? rows.lot : name === "SaleCertificate" ? rows.cert : name === "RecordsInspection" ? rows.inspection : name === "Scheme" ? rows.scheme : null;
    const all = async () => (name === "SaleCertificate" ? rows.issued : name === "LevyNotice" ? rows.notices : name === "InsurancePolicy" ? rows.policies : name === "Fund" ? [{ id: "f-admin", fundType: "ADMINISTRATIVE" }, { id: "f-sink", fundType: "CAPITAL_WORKS" }] : []);
    Object.assign(chain, {
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      first,
      all,
      create: async (v: Record<string, unknown>) => (rows.created.push({ table: name, ...v }), { id: "new" }),
      update: async () => undefined,
      updateAndCount: async (v: Record<string, unknown>) => (rows.updated.push({ table: name, ...v }), 1),
    });
    return chain;
  };
  const orm = { public: new Proxy({}, { get: (_t, name: string) => table(name) }) };
  return { db: { orm, transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ orm }) } };
});
vi.mock("@/lib/jurisdiction/scheme-rules", () => ({
  rulesForScheme: async () => ({ rules: pack.rules, label: "AU-TEST" }),
  rulesForState: () => ({ rules: pack.rules, label: "AU-TEST" }),
}));
vi.mock("@/lib/jurisdiction/scheme-time", () => ({ schemeToday: async () => pack.today, schemeTimeZone: async () => "Australia/Brisbane", timeZoneOf: () => "Australia/Brisbane" }));
vi.mock("@/lib/debt-recovery/payment-plan-requests", () => ({ lotArrears: async () => ({ leviesCents: 45_000, interestCents: 1_125 }) }));
vi.mock("@/lib/finance/interest-setting", () => ({ getSchemeInterestSetting: async () => ({ mode: "NONE" }), statutoryInterestForScheme: async () => [] }));

const fees = await import("./fees");
const text = await import("./certificate-text");
const store = await import("./records-store");
const { certificateDrafting, draftCertificateItems } = await import("./certificate-draft");
const { requesterFields } = await import("./requester-fields");
const { keepUntil } = await import("@/lib/compliance/annual-report");
const { quoteRuleFor, quoteRuleSentence, quotesProblem } = await import("@/lib/works/quote-rule");

const NO_DASH_OR_SEMICOLON = /[;–—]| - /;
/** The NSW words for a contribution and the penalty. "Interest schedule" and "proper interest" are Queensland's own terms. */
const NSW_WORDS = /\blev(y|ies)\b|(?<!proper )\binterest\b(?! schedule)/i;

beforeEach(() => {
  pack.rules = QLD;
  pack.today = "2026-10-27";
  rows.lot = { id: "lot-1", schemeId: "s1", lotNumber: "7" };
  rows.scheme = { id: "s1", name: "Seaview", state: "QLD", timeZone: "Australia/Brisbane" };
  rows.cert = null;
  rows.issued = [];
  rows.inspection = null;
  rows.notices = [];
  rows.policies = [];
  rows.created = [];
  rows.updated = [];
});

describe("the Queensland body corporate certificate (pack)", () => {
  const c = QLD.CERTIFICATE;

  it("is asked for by the interested persons of Act s 205(13), within 5 business days, for fees in fee units", () => {
    expect(Object.keys(c.requesterTypes)).toEqual(["OWNER", "MORTGAGEE", "BUYER", "DISCLOSURE_RECIPIENT", "PROPER_INTEREST", "AGENT"]);
    expect(c.agentType).toBe("AGENT");
    expect(c.giveWithinBusinessDays).toBe(QLD.BODY_CORPORATE_CERTIFICATE.withinBusinessDays);
    if (c.fee.basis !== "FEE_UNITS") throw new Error("Queensland fees are in fee units");
    expect([c.fee.feeUnits, c.fee.repeatFeeUnits, c.fee.repeatWithinMonths, c.fee.repeatSamePersonOnly]).toEqual([76.75, 65.24, 3, true]);
    expect(c.fee.dollars.byYear["2026-27"]).toEqual({ feeCents: QLD.FEE_UNIT_DOLLARS["2026-27"].certificateCents, repeatFeeCents: QLD.FEE_UNIT_DOLLARS["2026-27"].certificateRepeatCents });
    expect(QLD.FEATURES.bodyCorporateCertificate).toBe(true);
    expect(QLD.FEATURES.strataInformationCertificate).toBe(false);
  });

  it("holds each year's dollar amounts in step with the fee units (one fee unit value across them)", () => {
    const d = QLD.FEE_UNIT_DOLLARS["2026-27"];
    const perUnit = [d.certificateCents / 76.75, d.certificateRepeatCents / 65.24, d.certificatePriorityCents / 27.35, d.inspectionOwnerCents / 18.25, d.inspectionOtherCents / 35.1];
    for (const v of perUnit) expect(Math.abs(v / perUnit[0] - 1)).toBeLessThan(0.01);
  });

  it("is worded for owners and buyers: contribution and penalty, no dashes or semicolons", () => {
    const texts = [c.title, c.buttonLabel, c.conclusiveNote, c.execution, ...c.items.map(([, t]) => t), ...Object.values(c.requesterTypes)];
    for (const t of texts) {
      expect(t).not.toMatch(NO_DASH_OR_SEMICOLON);
      expect(t).not.toMatch(NSW_WORDS);
    }
    expect(c.items.at(-1)?.[1]).toMatch(/approved form/);
    expect(QLD.FOR_REVIEW.some((f) => f.where.startsWith("CERTIFICATE.items"))).toBe(true);
  });
});

describe("certificate fees and deadlines", () => {
  it("keep the NSW fee: the repeat fee for any earlier certificate for the lot within 3 months", () => {
    const earlier = [{ issuedOn: "2026-08-01", requesterName: "Someone else" }];
    expect(fees.certificateFeeFor(NSW.CERTIFICATE.fee, "2026-10-26", earlier, "Jo")).toEqual(fees.certificateFee("2026-10-26", ["2026-08-01"], NSW.SALE_CERTIFICATE));
    expect(fees.certificateFeeFor(NSW.CERTIFICATE.fee, "2026-10-26", earlier, "Jo")).toEqual({ cents: 9_400, repeat: true });
  });

  it("charge the Queensland fee for the year of issue, and the repeat fee only for the same person", () => {
    const f = QLD.CERTIFICATE.fee;
    expect(fees.certificateFeeFor(f, "2026-10-27", [], "Jo Citizen")).toEqual({ cents: 8_695, repeat: false });
    expect(fees.certificateFeeFor(f, "2026-10-27", [{ issuedOn: "2026-08-01", requesterName: "  jo   CITIZEN " }], "Jo Citizen")).toEqual({ cents: 7_390, repeat: true });
    expect(fees.certificateFeeFor(f, "2026-10-27", [{ issuedOn: "2026-08-01", requesterName: "Sam Buyer" }], "Jo Citizen")).toEqual({ cents: 8_695, repeat: false });
    expect(fees.certificateFeeFor(f, "2026-10-27", [{ issuedOn: "2026-07-26", requesterName: "Jo Citizen" }], "Jo Citizen")?.repeat).toBe(false);
    // No dollar amounts are held before 1 July 2026 or from 1 July 2027.
    expect(fees.certificateFeeFor(f, "2027-07-01", [], "Jo")).toBeNull();
    expect(fees.certificateFeeFor(f, "2026-06-30", [], "Jo")).toBeNull();
  });

  it("key the fee tables by the financial year from 1 July", () => {
    expect(fees.feeYear("2026-07-01", "07-01")).toBe("2026-27");
    expect(fees.feeYear("2027-06-30", "07-01")).toBe("2026-27");
    expect(fees.feeYear("2026-06-30", "07-01")).toBe("2025-26");
  });

  it("count business days without weekends", () => {
    expect(fees.addBusinessDays("2026-10-26", 5)).toBe("2026-11-02"); // Monday to Monday
    expect(fees.addBusinessDays("2026-10-30", 1)).toBe("2026-11-02"); // Friday to Monday
    expect(fees.addBusinessDays("2026-10-31", 5)).toBe("2026-11-06"); // Saturday to Friday
  });

  it("are stated for NSW as the page stated them, and for Queensland in dollars and fee units", () => {
    const s = NSW.SALE_CERTIFICATE;
    expect(text.certificateFeeText(NSW.CERTIFICATE, "2026-10-27")).toBe(`Fee: $${(s.feeCents / 100).toFixed(2)}, or $${(s.repeatFeeCents / 100).toFixed(2)} for a further certificate for the lot within ${s.repeatWithinMonths} months (${s.feeSource}).`);
    expect(text.certificateDueText(NSW.CERTIFICATE, "2026-10-26")).toBeNull();
    const qld = text.certificateFeeText(QLD.CERTIFICATE, "2026-10-27");
    expect(qld).toContain("$86.95 (76.75 fee units), or $73.90 (65.24 fee units) for a further certificate for the same person and lot within 3 months, at the amounts for 2026-27");
    expect(text.certificateFeeText(QLD.CERTIFICATE, "2027-07-01")).toContain("does not hold the dollar amounts");
    expect(text.certificateDueText(QLD.CERTIFICATE, "2026-10-26")).toContain("by 2026-11-02");
  });
});

describe("records access (Queensland pack)", () => {
  const r = QLD.INSPECTIONS;
  if (r.basis !== "FEE_UNITS") throw new Error("Queensland access is in fee units");

  it("is within 7 days, for the same interested persons, with no GST", () => {
    expect(r.accessWithinDays).toBe(7);
    expect(r.requesterTypes).toBe(QLD.CERTIFICATE.requesterTypes);
    expect(r.feesIncludeGst).toBe(false);
    expect(QLD.FEATURES.recordsInspections).toBe(true);
  });

  it("charges an owner or anyone else to inspect, each page copied, and no inspection fee for copies alone", () => {
    const at = (requesterType: string, inspected: boolean, copyPages: number, feeOn = "2026-10-27") => fees.accessFee(r, { requesterType, inspected, copyPages, feeOn });
    expect(at("OWNER", true, 0)).toBe(2_070);
    expect(at("MORTGAGEE", true, 0)).toBe(3_975);
    expect(at("AGENT", true, 0)).toBe(3_975);
    expect(at("BUYER", false, 10)).toBe(750);
    expect(at("OWNER", true, 4)).toBe(2_370);
    expect(at("OWNER", true, 0, "2027-07-01")).toBeNull();
  });

  it("refuses an NSW inspection fee for a requester type the pack does not price", () => {
    const i = NSW.INSPECTIONS;
    if (i.basis !== "HOURLY") throw new Error("NSW inspections are by the hour");
    expect(() => fees.inspectionFee("BUYER" as never, 60, i)).toThrow(fees.UnknownInspectorTypeError);
  });

  it("states the rules in plain words", () => {
    const t = text.accessRulesText(r, "2026-10-27", QLD.TERMINOLOGY.ownersCorporation);
    expect(t).toContain("within 7 days after the written request and fee");
    expect(t).toContain("an owner $20.70 to inspect, anyone else $39.75, and $0.75 for each page copied");
    for (const s of [t, r.whoMayAsk]) expect(s).not.toMatch(NO_DASH_OR_SEMICOLON);
  });
});

describe("record keeping in the document library", () => {
  it("is unchanged for NSW", () => {
    expect(keepUntil("FINANCIAL", "2026-10-26", NSW.DOCUMENT_RETENTION)).toBe("2033-10-26");
    expect(keepUntil("BYLAW", "2026-10-26", NSW.DOCUMENT_RETENTION)).toBe("LIFE");
    expect(NSW.DOCUMENT_RETENTION.unlimited).toBe("kept for the life of the scheme");
    expect(NSW.DOCUMENT_RETENTION.note).toBe("Records with a longer period (such as minor renovation approvals, 10 years) are kept longer than shown.");
  });

  it("keeps Queensland minutes, by-laws and policies without a limit, and every other category at least 6 years", () => {
    const q = QLD.DOCUMENT_RETENTION;
    expect(keepUntil("MINUTES", "2026-10-26", q)).toBe("LIFE");
    expect(keepUntil("INSURANCE", "2026-10-26", q)).toBe("LIFE");
    expect(keepUntil("BYLAW", "2026-10-26", q)).toBe("LIFE");
    for (const category of ["FINANCIAL", "COMPLIANCE", "OTHER", "SOMETHING_NEW"]) expect(keepUntil(category, "2026-10-26", q), category).toBe("2032-10-26");
    expect(q.unlimited).toBe("kept without a limit");
    for (const s of [q.unlimited, q.note]) expect(s).not.toMatch(NO_DASH_OR_SEMICOLON);
  });
});

describe("works quotes", () => {
  it("keep the NSW rule and wording", () => {
    const nsw = quoteRuleFor(NSW.WORKS_QUOTES, 500);
    expect(nsw).toEqual({ threshold: 30_000, minimumQuotes: 2, citation: "SSMA s 102", lotsMissing: false });
    expect(quoteRuleFor(NSW.WORKS_QUOTES, null)).toEqual(nsw);
    expect(quoteRuleSentence(nsw)).toBe("Over $30,000, at least 2 quotes are needed before one is approved (SSMA s 102).");
    expect(quotesProblem(nsw, 30_000, 1)).toBeNull();
    expect(quotesProblem(nsw, 30_001, 2)).toBeNull();
    expect(quotesProblem(nsw, 30_001, 1)).toBe("Over $30,000, at least 2 quotes are needed before one is approved (SSMA s 102). Invite more contractors, or extend the deadline.");
  });

  it("use the Queensland major spending limit: the lesser of $1,100 a lot and $10,000", () => {
    expect(quoteRuleFor(QLD.WORKS_QUOTES, 5).threshold).toBe(5_500);
    expect(quoteRuleFor(QLD.WORKS_QUOTES, 20).threshold).toBe(10_000);
    expect(quotesProblem(quoteRuleFor(QLD.WORKS_QUOTES, 20), 10_001, 1)).toBe("Over $10,000, at least 2 quotes are needed before one is approved (Standard Module ss 173, 174). Invite more contractors, or extend the deadline.");
  });

  it("say the number of lots is missing, and still need 2 quotes, when a Queensland building has none recorded", () => {
    for (const lots of [0, null]) {
      const rule = quoteRuleFor(QLD.WORKS_QUOTES, lots);
      expect(rule).toMatchObject({ threshold: 0, lotsMissing: true });
      expect(quoteRuleSentence(rule)).toBe("The building's number of lots is not recorded, so at least 2 quotes are needed before one is approved (Standard Module ss 173, 174).");
      expect(quotesProblem(rule, 1, 1)).toBe("The building's number of lots is not recorded, so at least 2 quotes are needed before one is approved (Standard Module ss 173, 174). Record the number of lots for the building, or invite more contractors.");
      expect(quotesProblem(rule, 1, 2)).toBeNull();
      expect(quoteRuleSentence(rule)).not.toContain("$0");
    }
  });
});

describe("the certificate form and refresh", () => {
  it("offers who authorised an agent from the other types", () => {
    const nsw = requesterFields({ requesterTypes: NSW.CERTIFICATE.requesterTypes, agentType: NSW.CERTIFICATE.agentType, today: "2026-10-27" });
    expect(nsw.find((f) => f.name === "authorisedByType")?.options?.map((o) => o.value)).toEqual(["OWNER", "MORTGAGEE", "COVENANT_CHARGEE"]);
    const qld = requesterFields({ requesterTypes: QLD.CERTIFICATE.requesterTypes, agentType: "AGENT", today: "2026-10-27" });
    expect(qld.find((f) => f.name === "authorisedByType")?.options?.map((o) => o.value)).toEqual(["OWNER", "MORTGAGEE", "BUYER", "DISCLOSURE_RECIPIENT", "PROPER_INTEREST"]);
  });

  it("refreshes the items each pack's draft works out from the records", () => {
    expect(certificateDrafting(NSW).refreshPrompt).toBe("Replace items 3, 4, 6, 11 to 14, 18 and 19 with today's figures? Your other items are kept.");
    const qld = certificateDrafting(QLD as unknown as StatutoryRules);
    for (const no of qld.figureItems) expect(QLD.CERTIFICATE.items.some(([n]) => n === no)).toBe(true);
  });
});

describe("a Queensland certificate (store)", () => {
  const requester = { requestedOn: "2026-10-26", requesterType: "BUYER", requesterName: "Sam Buyer", requesterAddress: "1 Sea St", authorisedByType: null, authorisedByName: null, authorisedByAddress: null };

  it("is drafted under the Queensland headings, saying contribution and penalty", async () => {
    rows.notices = [{ id: "n1", fundId: "f-admin", levyScheduleId: "ls", dueDate: "2026-08-01", amountDue: "450.00", amountPaid: "0", periodStart: "2026-07-01", periodEnd: "2026-09-30" }];
    const items = await draftCertificateItems("s1", "lot-1", new Date("2026-10-27T02:00:00Z"));
    expect(items.map((i) => i.title)).toEqual(QLD.CERTIFICATE.items.map(([, t]) => t));
    const byNo = Object.fromEntries(items.map((i) => [i.no, i.text]));
    expect(byNo["4"]).toContain("Administrative Fund:\nDue 2026-08-01");
    expect(byNo["4"]).toContain("No contribution notices for this fund");
    expect(byNo["6"]).toContain("Unpaid contributions overdue at 2026-10-27: $450.00.");
    expect(byNo["6"]).toContain("Penalty charged and unpaid: $11.25.");
    for (const i of items) {
      expect(i.text, i.no).not.toMatch(NSW_WORDS);
      expect(i.text, i.no).not.toMatch(NO_DASH_OR_SEMICOLON);
    }
  });

  it("is drafted with the building's regulation module and both of the lot's entitlements (stage 2, step 10)", async () => {
    rows.scheme = { ...rows.scheme, regulationModule: "STANDARD" };
    rows.lot = { id: "lot-1", schemeId: "s1", lotNumber: "7", entitlement: 50, interestScheduleEntitlement: 45 };
    const byNo = Object.fromEntries((await draftCertificateItems("s1", "lot-1", new Date("2026-10-27T02:00:00Z"))).map((i) => [i.no, i.text]));
    expect(byNo["2"]).toBe("Scheme name: Seaview. Regulation module: Standard Module.");
    expect(byNo["5"]).toBe(
      "Contribution schedule lot entitlement: 50\nInterest schedule lot entitlement: 45\nFrom StrataVerze's records. Check them before the certificate is issued.",
    );
  });

  it("says plainly when the module or an entitlement is not recorded, and never fills one from the other", async () => {
    rows.lot = { id: "lot-1", schemeId: "s1", lotNumber: "7", entitlement: 50, interestScheduleEntitlement: null };
    const items = await draftCertificateItems("s1", "lot-1", new Date("2026-10-27T02:00:00Z"));
    const byNo = Object.fromEntries(items.map((i) => [i.no, i.text]));
    expect(byNo["2"]).toBe("Scheme name: Seaview. Regulation module: not recorded for this building in StrataVerze. Check and complete.");
    expect(byNo["5"]).toContain("Contribution schedule lot entitlement: 50\n");
    expect(byNo["5"]).toContain("Interest schedule lot entitlement: not recorded for this lot in StrataVerze. Check and complete.");
    for (const i of items) {
      expect(i.text, i.no).not.toMatch(NSW_WORDS);
      expect(i.text, i.no).not.toMatch(NO_DASH_OR_SEMICOLON);
    }
  });

  it("takes the Queensland requester types, and refuses the NSW-only ones", async () => {
    await store.createCertificate({ schemeId: "s1", lotId: "lot-1", requester, actorId: "a1" });
    expect(rows.created[0]).toMatchObject({ table: "SaleCertificate", requesterType: "BUYER", authorisedByType: null });
    await expect(store.createCertificate({ schemeId: "s1", lotId: "lot-1", requester: { ...requester, requesterType: "COVENANT_CHARGEE" }, actorId: "a1" })).rejects.toMatchObject({ fieldErrors: { requesterType: "Choose who is asking." } });
    await expect(store.createCertificate({ schemeId: "s1", lotId: "lot-1", requester: { ...requester, requesterType: "AGENT" }, actorId: "a1" })).rejects.toMatchObject({ fieldErrors: { authorisedByType: "Choose who authorised them." } });
    await store.createCertificate({ schemeId: "s1", lotId: "lot-1", requester: { ...requester, requesterType: "AGENT", authorisedByType: "BUYER", authorisedByName: "Sam Buyer", authorisedByAddress: "1 Sea St" }, actorId: "a1" });
    expect(rows.created[1]).toMatchObject({ requesterType: "AGENT", authorisedByType: "BUYER", authorisedByName: "Sam Buyer" });
  });

  it("is issued for the fee of the year the request was received, the repeat fee for the same person, and not when that year's fees are not held", async () => {
    const draft = { id: "c1", schemeId: "s1", lotId: "lot-1", status: "DRAFT", requestedOn: "2026-10-26", draftedOn: "2026-10-27", requesterName: "Sam Buyer", items: [{ no: "1", title: "Lot", text: "Done" }] };
    rows.cert = draft;
    expect(await store.issueCertificate({ schemeId: "s1", certificateId: "c1", actorId: "a1", checkedAll: true })).toEqual({ cents: 8_695, repeat: false });
    rows.issued = [{ certificateDate: "2026-09-01", requesterName: "sam buyer" }];
    expect(await store.issueCertificate({ schemeId: "s1", certificateId: "c1", actorId: "a1", checkedAll: true })).toEqual({ cents: 7_390, repeat: true });
    rows.issued = [];
    // Requested in 2026-27 and issued on 1 July 2027: the 2026-27 fee.
    pack.today = "2027-07-01";
    rows.cert = { ...draft, requestedOn: "2027-06-30", draftedOn: "2027-07-01" };
    expect(await store.issueCertificate({ schemeId: "s1", certificateId: "c1", actorId: "a1", checkedAll: true })).toEqual({ cents: 8_695, repeat: false });
    rows.cert = { ...draft, requestedOn: "2027-07-01", draftedOn: "2027-07-01" };
    await expect(store.issueCertificate({ schemeId: "s1", certificateId: "c1", actorId: "a1", checkedAll: true })).rejects.toThrow(/does not hold the fee for a request received on 2027-07-01/);
  });
});

describe("records access (store)", () => {
  const request = { schemeId: "s1", lotId: "lot-1", inspectorName: "Sam Buyer", authorisedBy: null, requestedOn: "2026-10-26", notes: null, actorId: "a1" };

  it("records a Queensland request from any interested person, and an agent with who they act for", async () => {
    await store.createInspection({ ...request, inspectorType: "BUYER" });
    expect(rows.created[0]).toMatchObject({ table: "RecordsInspection", inspectorType: "BUYER", authorisedBy: null });
    await expect(store.createInspection({ ...request, inspectorType: "AGENT" })).rejects.toMatchObject({ fieldErrors: { authorisedBy: "Enter who they act for." } });
    await expect(store.createInspection({ ...request, inspectorType: "AUTHORISED_PERSON" })).rejects.toMatchObject({ fieldErrors: { inspectorType: "Choose who is asking." } });
  });

  it("records Queensland access given: the inspection and pages copied, with the fee", async () => {
    rows.inspection = { id: "i1", schemeId: "s1", inspectorType: "OWNER", requestedOn: "2026-10-26", status: "REQUESTED" };
    expect(await store.completeInspection({ schemeId: "s1", id: "i1", inspected: true, copyPages: 4 })).toEqual({ cents: 2_370, gstIncluded: false });
    expect(rows.updated.at(-1)).toMatchObject({ status: "COMPLETED", inspected: true, copyPages: 4, feeCents: 2_370 });
    await expect(store.completeInspection({ schemeId: "s1", id: "i1", inspected: false, copyPages: 0 })).rejects.toThrow(/inspection or copies/);
  });

  it("never sets a Queensland time by notice", async () => {
    rows.inspection = { id: "i1", schemeId: "s1", inspectorType: "OWNER", requestedOn: "2026-10-26", status: "REQUESTED" };
    await store.scheduleInspection({ schemeId: "s1", id: "i1", when: "2026-11-20T10:00", place: "Office", setByNotice: true });
    expect(rows.updated.at(-1)).toMatchObject({ status: "SCHEDULED", setByNotice: false });
  });

  it("keeps NSW as it was: hourly fees including GST, and a date set by notice within 10 days", async () => {
    pack.rules = NSW;
    rows.inspection = { id: "i1", schemeId: "s1", inspectorType: "OWNER", requestedOn: "2026-10-26", status: "REQUESTED" };
    expect(await store.completeInspection({ schemeId: "s1", id: "i1", minutes: 61 })).toEqual({ cents: 4_700, gstIncluded: true });
    expect(rows.updated.at(-1)).toEqual({ table: "RecordsInspection", status: "COMPLETED", minutes: 61, feeCents: 4_700 });
    await expect(store.scheduleInspection({ schemeId: "s1", id: "i1", when: "2026-11-20T10:00", place: "Office", setByNotice: true })).rejects.toMatchObject({ fieldErrors: { when: "A date set by notice must be within 10 days of the request (by 2026-11-05)." } });
    await expect(store.createInspection({ ...request, inspectorType: "BUYER" })).rejects.toMatchObject({ fieldErrors: { inspectorType: "Choose the owner or a person they authorised." } });
  });
});

describe("screens", () => {
  it("take no pack values in client files", () => {
    for (const rel of ["components/records/records-forms.tsx", "components/documents/documents-tab-content.tsx", "components/works/decision-panel.tsx", "components/works/quotes-panel.tsx"]) {
      const t = readFileSync(join(__dirname, "..", "..", rel), "utf8");
      expect(t.startsWith('"use client"'), rel).toBe(true);
      for (const m of t.matchAll(/from "(@\/config\/statutory[^"]*)"/g)) expect(m[1], rel).toBe("@/config/statutory/need-rule");
    }
  });
});
