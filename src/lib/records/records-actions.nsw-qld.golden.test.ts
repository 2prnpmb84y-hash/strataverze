/**
 * Golden: what the certificate and records inspection actions return and
 * write, for NSW (s 184, s 182) and Queensland (the body corporate
 * certificate, Act s 205 access). Recorded on origin/main 557b283
 * (31 Oct 2026) in a temporary worktree, before PR 10a (certificate kinds
 * and records access for the draft packs) moved the certificate and
 * inspection gates.
 *
 * NEVER REGENERATE THESE SNAPSHOTS. Do not run vitest with -u on this file,
 * and do not update an entry to make a change pass: a difference is a change
 * to NSW or Queensland. An entry may change only when the change is
 * deliberate, and the commit says which entry and why.
 *
 * Covered (what certificates.nsw-qld.golden.test.tsx does not): each action's
 * answer and the rows it leaves, for starting, saving, saving and issuing,
 * issuing (new fee, repeat fee, the Queensland repeat fee for the same person
 * only, a year without fees, figures out of date, an item left to complete,
 * not confirmed), refreshing and cancelling a draft, recording a fee paid,
 * and recording, scheduling, completing and cancelling an inspection; and the
 * refusals, writing nothing, for a pack without the switches. What an issued
 * certificate keeps (issued_content) is recorded as the SHA-256 of its JSON
 * and of its PDF; the content itself is in certificates.nsw-qld.golden.
 */
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fx = vi.hoisted(() => ({ today: "2026-10-27", off: false }));

vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/audit/security-audit", () => ({ recordSecurityEventLater: vi.fn(async () => {}), recordActionInvocation: vi.fn(async () => {}) }));
vi.mock("@/lib/auth/require-membership", () => {
  class AuthorisationError extends Error {}
  return { AuthorisationError, requireSchemeMembership: vi.fn(async () => ({ profile: { id: "adviser-1" }, membership: {}, roles: ["ADVISER"] })) };
});
vi.mock("@/lib/finance/interest-setting", () => ({ getSchemeInterestSetting: async () => ({ mode: "STATUTORY" }), statutoryInterestForScheme: async () => [] }));
vi.mock("@/lib/debt-recovery/payment-plan-requests", () => ({ lotArrears: async () => ({ leviesCents: 45_000, interestCents: 1_125 }) }));
// The building's real pack, recorded under a fixed label so a version bump does not move the snapshots. `fx.off`
// gives the same pack with every workflow switched off, as a pack without the certificate or inspections reads.
vi.mock("@/lib/jurisdiction/scheme-rules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jurisdiction/scheme-rules")>();
  const { db } = await import("@/prisma/db");
  const rulesForScheme = async (schemeId: string) => {
    const scheme = await db.orm.public.Scheme.where((s) => s.id.eq(schemeId)).first();
    const r = actual.rulesForState(scheme?.state);
    const rules = fx.off ? { ...r.rules, FEATURES: Object.fromEntries(Object.keys(r.rules.FEATURES).map((k) => [k, false])) as unknown as typeof r.rules.FEATURES } : r.rules;
    return { ...r, rules, label: `${r.pack.code} golden` };
  };
  return {
    ...actual,
    rulesForScheme,
    rulesForState: (state: string | null | undefined) => {
      const r = actual.rulesForState(state);
      return fx.off ? { ...r, rules: { ...r.rules, FEATURES: Object.fromEntries(Object.keys(r.rules.FEATURES).map((k) => [k, false])) as unknown as typeof r.rules.FEATURES } } : r;
    },
    schemeHasFeature: async (schemeId: string, feature: string) => (await rulesForScheme(schemeId)).rules.FEATURES[feature as "recordsInspections"] === true,
  };
});
vi.mock("@/lib/jurisdiction/scheme-time", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/jurisdiction/scheme-time")>()), schemeToday: async () => fx.today }));

const { sharedFake } = await import("@/test/fake-orm");
const { RULE_PACKS, QLD_RULE_PACK } = await import("@/config/statutory");
const actions = await import("@/lib/actions/records");

const SCHEME = { NSW: "aaaaaaaa-0000-4000-8000-000000000001", QLD: "aaaaaaaa-0000-4000-8000-000000000002" } as const;
const LOT = { NSW: "bbbbbbbb-0000-4000-8000-000000000001", QLD: "bbbbbbbb-0000-4000-8000-000000000002" } as const;
const DRAFT = { NSW: "cccccccc-0000-4000-8000-000000000001", QLD: "cccccccc-0000-4000-8000-000000000002" } as const;
const EARLIER = { NSW: "cccccccc-0000-4000-8000-000000000011", QLD: "cccccccc-0000-4000-8000-000000000012" } as const;
const INSPECTION = { NSW: "dddddddd-0000-4000-8000-000000000001", QLD: "dddddddd-0000-4000-8000-000000000002" } as const;
type State = keyof typeof SCHEME;
const STATES: State[] = ["NSW", "QLD"];

const ITEMS = {
  NSW: RULE_PACKS.NSW.rules.CERTIFICATE!.items.map(([no, title]) => ({ no, title, text: `Item ${no}: Nil.` })),
  QLD: QLD_RULE_PACK.rules.CERTIFICATE.items.map(([no, title]) => ({ no, title, text: `Item ${no}: Nil.` })),
};

const certificate = (s: State, o: Record<string, unknown>) => ({
  schemeId: SCHEME[s],
  lotId: LOT[s],
  requestedOn: "2026-10-20",
  requesterType: "OWNER",
  requesterName: "Jo Citizen",
  requesterAddress: "7/1 Example St",
  authorisedByType: null,
  authorisedByName: null,
  authorisedByAddress: null,
  items: ITEMS[s],
  draftedOn: "2026-10-27",
  certificateDate: null,
  feeCents: null,
  feeRepeat: false,
  feePaidOn: null,
  rulePack: `AU-${s} golden`,
  issuedContent: null,
  createdBy: "adviser-1",
  issuedBy: null,
  ...o,
});
const inspection = (s: State, o: Record<string, unknown>) => ({
  id: INSPECTION[s],
  schemeId: SCHEME[s],
  lotId: LOT[s],
  inspectorType: "OWNER",
  inspectorName: "Jo Citizen",
  authorisedBy: null,
  requestedOn: "2026-10-20",
  status: "REQUESTED",
  scheduledFor: null,
  setByNotice: false,
  place: null,
  minutes: null,
  inspected: null,
  copyPages: null,
  feeCents: null,
  feePaidOn: null,
  notes: null,
  createdBy: "adviser-1",
  ...o,
});

beforeEach(() => {
  fx.today = "2026-10-27";
  fx.off = false;
  sharedFake.reset({
    Scheme: [
      { id: SCHEME.NSW, name: "Harbour View", planNumber: "12345", state: "NSW", timeZone: "Australia/Sydney" },
      { id: SCHEME.QLD, name: "Seaview", planNumber: "4567", state: "QLD", timeZone: "Australia/Brisbane", regulationModule: "STANDARD" },
    ],
    Lot: [
      { id: LOT.NSW, schemeId: SCHEME.NSW, lotNumber: "7" },
      { id: LOT.QLD, schemeId: SCHEME.QLD, lotNumber: "3", entitlement: 12, interestScheduleEntitlement: 15 },
    ],
    SaleCertificate: [],
    RecordsInspection: [],
  });
});

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const sha = (v: unknown) => createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex");
/** A row as the snapshot records it: new ids named, the kept content as hashes, timestamps as ISO text. */
const clean = (row: Record<string, unknown>) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === "id" && typeof v === "string" && v.startsWith("fake-")) out[k] = "(new)";
    else if (k === "issuedContent" && v && typeof v === "object") {
      const c = v as Record<string, unknown>;
      out[k] = { version: c.version, layout: c.layout, source: c.source, rulePack: c.rulePack, fileStem: c.fileStem, pdfSha256: c.pdfSha256, jsonSha256: sha(c) };
    } else if (k === "items" && Array.isArray(v)) out[k] = (v as { no: string; text: string }[]).map((i) => `${i.no}: ${i.text}`);
    else out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
};
const certificates = () => sharedFake.tables.SaleCertificate.map(clean);
const inspections = () => sharedFake.tables.RecordsInspection.map(clean);
const seedCertificates = (...rows: Record<string, unknown>[]) => sharedFake.tables.SaleCertificate.push(...rows);
const seedInspections = (...rows: Record<string, unknown>[]) => sharedFake.tables.RecordsInspection.push(...rows);

describe.each(STATES)("%s certificates", (s) => {
  it("start a draft: an owner, an agent or authorised person with who authorised them, and a bad request", async () => {
    const agent = s === "NSW" ? "AUTHORISED_PERSON" : "AGENT";
    const results = {
      owner: await actions.createCertificateAction(SCHEME[s], LOT[s], {}, form({ requestedOn: "2026-10-20", requesterType: "OWNER", requesterName: " Jo Citizen ", requesterAddress: "7/1 Example St", authorisedByType: "MORTGAGEE", authorisedByName: "Ignored", authorisedByAddress: "Ignored" })),
      agent: await actions.createCertificateAction(SCHEME[s], LOT[s], {}, form({ requestedOn: "2026-10-27", requesterType: agent, requesterName: "Sam Agent", requesterAddress: "2 Agent Rd", authorisedByType: "MORTGAGEE", authorisedByName: "Big Bank", authorisedByAddress: "1 Bank St" })),
      bad: await actions.createCertificateAction(SCHEME[s], LOT[s], {}, form({ requestedOn: "2026-10-28", requesterType: "NOBODY", requesterName: "", requesterAddress: "" })),
      otherLot: await actions.createCertificateAction(SCHEME[s], LOT[s === "NSW" ? "QLD" : "NSW"], {}, form({ requestedOn: "2026-10-20", requesterType: "OWNER", requesterName: "Jo", requesterAddress: "1 St" })),
    };
    expect({ results: { ...results, owner: { ...results.owner, id: results.owner.id ? "(new)" : undefined }, agent: { ...results.agent, id: results.agent.id ? "(new)" : undefined } }, rows: certificates() }).toMatchSnapshot();
  });

  it("save a draft, refuse a blank item, and save and issue", async () => {
    seedCertificates(certificate(s, { id: DRAFT[s], number: 1, status: "DRAFT" }));
    const firstItem = ITEMS[s][0].no;
    const saved = await actions.saveCertificateAction(SCHEME[s], LOT[s], DRAFT[s], {}, form({ requestedOn: "2026-10-21", requesterType: "OWNER", requesterName: "Jo Citizen", requesterAddress: "7/1 Example St", [`item_${firstItem}`]: "  Changed text.  " }));
    const afterSave = certificates();
    const blank = await actions.saveCertificateAction(SCHEME[s], LOT[s], DRAFT[s], {}, form({ requestedOn: "2026-10-21", requesterType: "OWNER", requesterName: "Jo Citizen", requesterAddress: "7/1 Example St", [`item_${firstItem}`]: " " }));
    const notChecked = await actions.saveCertificateAction(SCHEME[s], LOT[s], DRAFT[s], {}, form({ intent: "issue", requestedOn: "2026-10-21", requesterType: "OWNER", requesterName: "Jo Citizen", requesterAddress: "7/1 Example St" }));
    const issued = await actions.saveCertificateAction(SCHEME[s], LOT[s], DRAFT[s], {}, form({ intent: "issue", checkedAll: "on", requestedOn: "2026-10-21", requesterType: "OWNER", requesterName: "Jo Citizen", requesterAddress: "7/1 Example St" }));
    const again = await actions.saveCertificateAction(SCHEME[s], LOT[s], DRAFT[s], {}, form({ requestedOn: "2026-10-21", requesterType: "OWNER", requesterName: "Jo Citizen", requesterAddress: "7/1 Example St" }));
    expect({ saved, afterSave, blank, notChecked, issued, again, rows: certificates() }).toMatchSnapshot();
  });

  it("issue: a new fee, a repeat fee, and the refusals", async () => {
    const issue = (id: string, o: Record<string, string> = { checkedAll: "on" }) => actions.issueCertificateAction(SCHEME[s], LOT[s], id, {}, form(o));
    const out: Record<string, unknown> = {};
    seedCertificates(certificate(s, { id: DRAFT[s], number: 2, status: "DRAFT" }));
    out.notConfirmed = await issue(DRAFT[s], {});
    out.newFee = await issue(DRAFT[s]);
    out.twice = await issue(DRAFT[s]);
    out.newFeeRows = certificates();

    // A further certificate for the lot: the same person, then (Queensland: the repeat fee is for the same person only) another.
    sharedFake.tables.SaleCertificate.length = 0;
    seedCertificates(
      certificate(s, { id: EARLIER[s], number: 1, status: "ISSUED", requestedOn: "2026-08-01", draftedOn: "2026-08-01", certificateDate: "2026-08-01", feeCents: 1, requesterName: "Jo  citizen" }),
      certificate(s, { id: DRAFT[s], number: 2, status: "DRAFT" }),
      certificate(s, { id: "cccccccc-0000-4000-8000-000000000021", number: 3, status: "DRAFT", requesterName: "Someone Else" }),
    );
    out.repeatSamePerson = await issue(DRAFT[s]);
    out.repeatOtherPerson = await issue("cccccccc-0000-4000-8000-000000000021");
    out.repeatRows = certificates();

    // An earlier certificate more than the repeat period before: the full fee.
    sharedFake.tables.SaleCertificate.length = 0;
    seedCertificates(
      certificate(s, { id: EARLIER[s], number: 1, status: "ISSUED", requestedOn: "2026-01-02", draftedOn: "2026-01-02", certificateDate: "2026-01-02", feeCents: 1 }),
      certificate(s, { id: DRAFT[s], number: 2, status: "DRAFT" }),
    );
    out.outsideRepeat = await issue(DRAFT[s]);

    // Refusals, writing nothing.
    sharedFake.tables.SaleCertificate.length = 0;
    seedCertificates(
      certificate(s, { id: "cccccccc-0000-4000-8000-000000000031", number: 1, status: "DRAFT", draftedOn: "2026-10-26" }),
      certificate(s, { id: "cccccccc-0000-4000-8000-000000000032", number: 2, status: "DRAFT", items: ITEMS[s].map((i, n) => (n === 1 || n === 2 ? { ...i, text: "StrataVerze holds no record of this. Check and complete." } : i)) }),
      certificate(s, { id: "cccccccc-0000-4000-8000-000000000033", number: 3, status: "DRAFT", requestedOn: "2026-06-30" }),
      certificate(s, { id: "cccccccc-0000-4000-8000-000000000034", number: 4, status: "CANCELLED" }),
    );
    out.figuresOutOfDate = await issue("cccccccc-0000-4000-8000-000000000031");
    out.checkAndCompleteLeft = await issue("cccccccc-0000-4000-8000-000000000032");
    out.yearWithoutFees = await issue("cccccccc-0000-4000-8000-000000000033");
    out.cancelled = await issue("cccccccc-0000-4000-8000-000000000034");
    out.notFound = await issue("cccccccc-0000-4000-8000-000000000099");
    out.otherScheme = await actions.issueCertificateAction(SCHEME[s === "NSW" ? "QLD" : "NSW"], LOT[s], "cccccccc-0000-4000-8000-000000000031", {}, form({ checkedAll: "on" }));
    out.refusalRows = certificates();
    expect(out).toMatchSnapshot();
  });

  it("refresh and cancel a draft, and record the fee paid", async () => {
    seedCertificates(
      certificate(s, { id: DRAFT[s], number: 1, status: "DRAFT", draftedOn: "2026-10-01" }),
      certificate(s, { id: EARLIER[s], number: 2, status: "ISSUED", requestedOn: "2026-10-10", draftedOn: "2026-10-12", certificateDate: "2026-10-12", feeCents: 5_000 }),
    );
    const out: Record<string, unknown> = {};
    out.refresh = await actions.refreshCertificateAction(SCHEME[s], LOT[s], DRAFT[s]);
    out.refreshedRow = certificates()[0];
    out.refreshIssued = await actions.refreshCertificateAction(SCHEME[s], LOT[s], EARLIER[s]);
    out.paidFuture = await actions.recordFeePaidAction(SCHEME[s], "certificate", EARLIER[s], {}, form({ paidOn: "2026-10-28" }));
    out.paidBeforeRequest = await actions.recordFeePaidAction(SCHEME[s], "certificate", EARLIER[s], {}, form({ paidOn: "2026-10-09" }));
    out.paidDraft = await actions.recordFeePaidAction(SCHEME[s], "certificate", DRAFT[s], {}, form({ paidOn: "2026-10-27" }));
    out.paid = await actions.recordFeePaidAction(SCHEME[s], "certificate", EARLIER[s], {}, form({ paidOn: "2026-10-15" }));
    out.paidTwice = await actions.recordFeePaidAction(SCHEME[s], "certificate", EARLIER[s], {}, form({ paidOn: "2026-10-16" }));
    out.badKind = await actions.recordFeePaidAction(SCHEME[s], "other" as "certificate", EARLIER[s], {}, form({ paidOn: "2026-10-16" }));
    out.cancelIssued = await actions.cancelCertificateAction(SCHEME[s], LOT[s], EARLIER[s]);
    out.cancel = await actions.cancelCertificateAction(SCHEME[s], LOT[s], DRAFT[s]);
    out.cancelAgain = await actions.cancelCertificateAction(SCHEME[s], LOT[s], DRAFT[s]);
    out.rows = certificates();
    expect(out).toMatchSnapshot();
  });
});

describe.each(STATES)("%s records inspections", (s) => {
  it("record a request: the owner, the agent or authorised person, and a bad request", async () => {
    const agent = s === "NSW" ? "AUTHORISED_PERSON" : "AGENT";
    const out: Record<string, unknown> = {};
    out.owner = await actions.createInspectionAction(SCHEME[s], {}, form({ lotId: LOT[s], inspectorType: "OWNER", inspectorName: " Jo Citizen ", authorisedBy: "Ignored", requestedOn: "2026-10-26", notes: "  Minutes  " }));
    out.agent = await actions.createInspectionAction(SCHEME[s], {}, form({ lotId: LOT[s], inspectorType: agent, inspectorName: "Sam Agent", authorisedBy: " Jo Citizen ", requestedOn: "2026-10-27", notes: "" }));
    out.bad = await actions.createInspectionAction(SCHEME[s], {}, form({ lotId: LOT[s === "NSW" ? "QLD" : "NSW"], inspectorType: "NOBODY", inspectorName: "", requestedOn: "2026-10-28" }));
    out.rows = inspections();
    expect(out).toMatchSnapshot();
  });

  it("schedule: agreed, set by notice inside and outside the period, and the refusals", async () => {
    const out: Record<string, unknown> = {};
    const schedule = (o: Record<string, string>) => actions.scheduleInspectionAction(SCHEME[s], INSPECTION[s], {}, form(o));
    seedInspections(inspection(s, {}));
    out.beforeRequest = await schedule({ when: "2026-10-19T10:00", place: "Office" });
    out.noPlace = await schedule({ when: "2026-10-22T10:00", place: " " });
    out.noTime = await schedule({ when: "", place: "Office" });
    out.byNoticeLate = await schedule({ when: "2026-10-31T10:00", place: "Office", setByNotice: "on" });
    out.byNoticeLastDay = await schedule({ when: "2026-10-30T16:30", place: " Office ", setByNotice: "on" });
    out.byNoticeRow = inspections();
    out.agreedLate = await schedule({ when: "2026-11-30T09:00", place: "Online" });
    out.agreedRow = inspections();
    sharedFake.tables.RecordsInspection[0].status = "COMPLETED";
    out.completed = await schedule({ when: "2026-10-22T10:00", place: "Office" });
    expect(out).toMatchSnapshot();
  });

  it("complete, record the fee paid and cancel", async () => {
    const out: Record<string, unknown> = {};
    const complete = (o: Record<string, string>) => actions.completeInspectionAction(SCHEME[s], INSPECTION[s], {}, form(o));
    const reset = (o: Record<string, unknown>) => {
      sharedFake.tables.RecordsInspection.length = 0;
      seedInspections(inspection(s, o));
    };
    if (s === "NSW") {
      reset({});
      out.noMinutes = await complete({ minutes: "0" });
      out.notWhole = await complete({ minutes: "60.5" });
      out.tooLong = await complete({ minutes: "1441" });
      out.oneHour = await complete({ minutes: "60" });
      out.oneHourRow = inspections();
      reset({ inspectorType: "AUTHORISED_PERSON", authorisedBy: "Jo Citizen", status: "SCHEDULED" });
      out.authorised = await complete({ minutes: "91" });
      out.authorisedRow = inspections();
    } else {
      reset({});
      out.nothing = await complete({ copyPages: "0" });
      out.badPages = await complete({ inspected: "on", copyPages: "-1" });
      out.inspectedOwner = await complete({ inspected: "on", copyPages: "0" });
      out.inspectedOwnerRow = inspections();
      reset({ inspectorType: "BUYER" });
      out.copiesOnly = await complete({ copyPages: "12" });
      out.copiesOnlyRow = inspections();
      reset({ inspectorType: "AGENT", authorisedBy: "Sam Buyer", status: "SCHEDULED" });
      out.both = await complete({ inspected: "on", copyPages: "3" });
      out.bothRow = inspections();
      reset({ requestedOn: "2026-06-30" });
      out.yearWithoutFees = await complete({ inspected: "on", copyPages: "1" });
    }
    out.again = await complete({ minutes: "60", inspected: "on", copyPages: "1" });
    out.paidFuture = await actions.recordFeePaidAction(SCHEME[s], "inspection", INSPECTION[s], {}, form({ paidOn: "2026-10-28" }));
    out.paid = await actions.recordFeePaidAction(SCHEME[s], "inspection", INSPECTION[s], {}, form({ paidOn: "2026-10-27" }));
    out.cancelCompleted = await actions.cancelInspectionAction(SCHEME[s], INSPECTION[s]);
    out.paidRows = inspections();
    reset({ status: "SCHEDULED" });
    out.cancel = await actions.cancelInspectionAction(SCHEME[s], INSPECTION[s]);
    out.cancelAgain = await actions.cancelInspectionAction(SCHEME[s], INSPECTION[s]);
    out.notFound = await actions.cancelInspectionAction(SCHEME[s === "NSW" ? "QLD" : "NSW"], INSPECTION[s]);
    out.cancelRows = inspections();
    expect(out).toMatchSnapshot();
  });
});

describe.each(STATES)("%s with the certificate and inspection switches off", (s) => {
  it("refuses every action, writing nothing", async () => {
    seedCertificates(certificate(s, { id: DRAFT[s], number: 1, status: "DRAFT" }));
    seedInspections(inspection(s, {}));
    const before = { certificates: certificates(), inspections: inspections() };
    fx.off = true;
    const out = {
      create: await actions.createCertificateAction(SCHEME[s], LOT[s], {}, form({ requestedOn: "2026-10-20", requesterType: "OWNER", requesterName: "Jo", requesterAddress: "1 St" })),
      save: await actions.saveCertificateAction(SCHEME[s], LOT[s], DRAFT[s], {}, form({ requestedOn: "2026-10-20", requesterType: "OWNER", requesterName: "Jo", requesterAddress: "1 St" })),
      saveAndIssue: await actions.saveCertificateAction(SCHEME[s], LOT[s], DRAFT[s], {}, form({ intent: "issue", checkedAll: "on", requestedOn: "2026-10-20", requesterType: "OWNER", requesterName: "Jo", requesterAddress: "1 St" })),
      issue: await actions.issueCertificateAction(SCHEME[s], LOT[s], DRAFT[s], {}, form({ checkedAll: "on" })),
      createInspection: await actions.createInspectionAction(SCHEME[s], {}, form({ lotId: LOT[s], inspectorType: "OWNER", inspectorName: "Jo", requestedOn: "2026-10-26" })),
      schedule: await actions.scheduleInspectionAction(SCHEME[s], INSPECTION[s], {}, form({ when: "2026-10-22T10:00", place: "Office" })),
      complete: await actions.completeInspectionAction(SCHEME[s], INSPECTION[s], {}, form({ minutes: "60", inspected: "on", copyPages: "1" })),
    };
    const after = { certificates: certificates(), inspections: inspections() };
    expect({ out, unchanged: JSON.stringify(after) === JSON.stringify(before) }).toMatchSnapshot();
  });
});
