/**
 * Golden: records access and the certificate draft through the store, for
 * NSW (s 182 inspections) and Queensland (Act s 205 access, the body
 * corporate certificate). Recorded on origin/main 557b283 (31 Oct 2026) in a
 * temporary worktree, before PR 10a (certificate kinds and records access
 * for the draft packs) moved the certificate and inspection gates.
 *
 * NEVER REGENERATE THESE SNAPSHOTS. Do not run vitest with -u on this file,
 * and do not update an entry to make a change pass: a difference is a change
 * to NSW or Queensland. An entry may change only when the change is
 * deliberate, and the commit says which entry and why.
 *
 * Covered (what records.golden-store.test.tsx does not): the governance card
 * for NSW and Queensland, and for a pack without records inspections; the
 * Queensland inspections page in every status, in a year with and without
 * the fee table, and refused without the switch; the Queensland draft items
 * through the store (module recorded and missing); the Queensland request
 * errors.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QLD_RULE_PACK, RULE_PACKS, type StatutoryRules } from "@/config/statutory";

const fx = vi.hoisted(() => ({
  tables: {} as Record<string, { first?: unknown; all?: unknown[] }>,
  rules: null as unknown,
  state: "NSW",
  today: "2026-10-27",
  tz: "Australia/Sydney",
}));

vi.mock("@/prisma/db", () => {
  const table = (name: string) => {
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      include: () => chain,
      forNoKeyUpdate: () => chain,
      first: async () => fx.tables[name]?.first ?? null,
      all: async () => fx.tables[name]?.all ?? [],
      create: async () => ({ id: "new" }),
      update: async () => undefined,
      updateAndCount: async () => 1,
    });
    return chain;
  };
  const orm = { public: new Proxy({}, { get: (_t, name: string) => table(name) }) };
  return { db: { orm, transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ orm }) } };
});
vi.mock("@/lib/jurisdiction/scheme-rules", () => ({
  rulesForScheme: async () => ({ rules: fx.rules, label: "AU-TEST golden" }),
  rulesForState: () => ({ rules: fx.rules, label: "AU-TEST golden" }),
  schemeHasFeature: async (_schemeId: string, feature: string) => (fx.rules as StatutoryRules).FEATURES[feature as "recordsInspections"] === true,
}));
vi.mock("@/lib/jurisdiction/scheme-time", () => ({ schemeToday: async () => fx.today, schemeTimeZone: async () => fx.tz, timeZoneOf: () => fx.tz }));
vi.mock("@/lib/finance/interest-setting", () => ({ getSchemeInterestSetting: async () => ({ mode: "STATUTORY" }), statutoryInterestForScheme: async () => [] }));
vi.mock("@/lib/debt-recovery/payment-plan-requests", () => ({ lotArrears: async () => ({ leviesCents: 45_000, interestCents: 1_125 }) }));
vi.mock("@/lib/queries/bylaws", () => ({ getBylawsForScheme: async () => [] }));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/(portal)/adviser/schemes/[id]/_sections/require-adviser-scheme", () => ({ requireAdviserScheme: async () => ({ id: "s1", state: fx.state }) }));
vi.mock("@/lib/actions/records", () => {
  const act = vi.fn(async () => ({}));
  return { cancelInspectionAction: act, completeInspectionAction: act, createInspectionAction: act, recordFeePaidAction: act, scheduleInspectionAction: act };
});

const { draftCertificateItems } = await import("./certificate-draft");
const store = await import("./records-store");
const { default: InspectionsPage } = await import("@/app/(portal)/adviser/schemes/[id]/governance/inspections/page");
const { default: GovernancePage } = await import("@/app/(portal)/adviser/schemes/[id]/governance/page");

const NSW = RULE_PACKS.NSW.rules;
const QLD = QLD_RULE_PACK.rules;
/** The pack with every workflow switched off, as a pack without them reads. */
const switchedOff = (rules: StatutoryRules): StatutoryRules => ({ ...rules, FEATURES: Object.fromEntries(Object.keys(rules.FEATURES).map((k) => [k, false])) as unknown as StatutoryRules["FEATURES"] });

const texts = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .split(/<[^>]+>/)
    .map((t) => t.trim())
    .filter(Boolean);
const page = async (el: Promise<React.ReactElement | null>) => {
  try {
    return texts(renderToStaticMarkup((await el)!));
  } catch (e) {
    return { thrown: (e as Error).message };
  }
};
const errorOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return { message: (e as Error).message, fieldErrors: (e as { fieldErrors?: unknown }).fieldErrors };
  }
};

const useQld = () => {
  fx.rules = QLD;
  fx.state = "QLD";
  fx.tz = "Australia/Brisbane";
  fx.tables.Scheme = { first: { id: "s1", name: "Seaview", state: "QLD", timeZone: "Australia/Brisbane", regulationModule: "STANDARD" } };
};

beforeEach(() => {
  fx.rules = NSW;
  fx.state = "NSW";
  fx.today = "2026-10-27";
  fx.tz = "Australia/Sydney";
  fx.tables = {
    Scheme: { first: { id: "s1", name: "Harbour View", state: "NSW", timeZone: "Australia/Sydney" } },
    Lot: { first: { id: "lot-1", schemeId: "s1", lotNumber: "7" }, all: [{ id: "lot-1", schemeId: "s1", lotNumber: "7" }, { id: "lot-2", schemeId: "s1", lotNumber: "12" }] },
  };
});

describe("the governance card", () => {
  it("NSW", async () => {
    expect(await page(GovernancePage({ params: Promise.resolve({ id: "s1" }) }))).toMatchSnapshot();
  });
  it("Queensland", async () => {
    useQld();
    expect(await page(GovernancePage({ params: Promise.resolve({ id: "s1" }) }))).toMatchSnapshot();
  });
  it("a pack without records inspections (NSW and Queensland words)", async () => {
    fx.rules = switchedOff(NSW);
    const nsw = await page(GovernancePage({ params: Promise.resolve({ id: "s1" }) }));
    useQld();
    fx.rules = switchedOff(QLD);
    const qld = await page(GovernancePage({ params: Promise.resolve({ id: "s1" }) }));
    expect({ nsw, qld }).toMatchSnapshot();
  });
});

const QLD_ROWS = [
  { id: "i1", lotId: "lot-1", inspectorType: "OWNER", inspectorName: "Jo Citizen", authorisedBy: null, requestedOn: "2026-10-26", status: "REQUESTED", scheduledFor: null, setByNotice: false, place: null, minutes: null, inspected: null, copyPages: null, feeCents: null, feePaidOn: null },
  { id: "i2", lotId: "lot-2", inspectorType: "AGENT", inspectorName: "Pat Agent", authorisedBy: "Sam Buyer", requestedOn: "2026-10-20", status: "SCHEDULED", scheduledFor: "2026-10-24T00:00:00Z", setByNotice: false, place: "Office", minutes: null, inspected: null, copyPages: null, feeCents: null, feePaidOn: null },
  { id: "i3", lotId: "lot-1", inspectorType: "BUYER", inspectorName: "Sam Buyer", authorisedBy: null, requestedOn: "2026-10-01", status: "COMPLETED", scheduledFor: "2026-10-03T00:00:00Z", setByNotice: false, place: "Office", minutes: null, inspected: true, copyPages: 12, feeCents: 4_875, feePaidOn: null },
  { id: "i4", lotId: "lot-2", inspectorType: "MORTGAGEE", inspectorName: "Big Bank", authorisedBy: null, requestedOn: "2026-09-01", status: "COMPLETED", scheduledFor: null, setByNotice: false, place: null, minutes: null, inspected: false, copyPages: 4, feeCents: 300, feePaidOn: "2026-09-10" },
  { id: "i5", lotId: "lot-1", inspectorType: "PROPER_INTEREST", inspectorName: "Al Interest", authorisedBy: null, requestedOn: "2026-08-01", status: "CANCELLED", scheduledFor: null, setByNotice: false, place: null, minutes: null, inspected: null, copyPages: null, feeCents: null, feePaidOn: null },
  { id: "i6", lotId: "lot-2", inspectorType: "DISCLOSURE_RECIPIENT", inspectorName: "Di Recipient", authorisedBy: null, requestedOn: "2026-10-27", status: "COMPLETED", scheduledFor: null, setByNotice: false, place: null, minutes: null, inspected: true, copyPages: 0, feeCents: 0, feePaidOn: null },
];

describe("the Queensland inspections page", () => {
  it("header, deadlines and requests in every status", async () => {
    useQld();
    fx.tables.RecordsInspection = { all: QLD_ROWS };
    expect(await page(InspectionsPage({ params: Promise.resolve({ id: "s1" }) }))).toMatchSnapshot();
  });
  it("in a financial year StrataVerze holds no fees for", async () => {
    useQld();
    fx.today = "2027-07-01";
    fx.tables.RecordsInspection = { all: QLD_ROWS.slice(0, 1) };
    expect(await page(InspectionsPage({ params: Promise.resolve({ id: "s1" }) }))).toMatchSnapshot();
  });
  it("is refused for a pack without records inspections (NSW and Queensland)", async () => {
    useQld();
    fx.rules = switchedOff(QLD);
    const qld = await page(InspectionsPage({ params: Promise.resolve({ id: "s1" }) }));
    fx.rules = switchedOff(NSW);
    const nsw = await page(InspectionsPage({ params: Promise.resolve({ id: "s1" }) }));
    expect({ nsw, qld }).toMatchSnapshot();
  });
});

describe("the Queensland body corporate certificate draft (store)", () => {
  const records = () => {
    fx.tables.Fund = { all: [{ id: "f-admin", fundType: "ADMINISTRATIVE" }, { id: "f-sink", fundType: "CAPITAL_WORKS" }] };
    fx.tables.LevyNotice = {
      all: [
        { id: "n1", fundId: "f-admin", levyScheduleId: "ls1", dueDate: "2026-08-01", amountDue: "450.00", amountPaid: "0", periodStart: "2026-07-01", periodEnd: "2026-09-30" },
        { id: "n2", fundId: "f-sink", levyScheduleId: "ls1", dueDate: "2026-11-01", amountDue: "200.00", amountPaid: "50.00", periodStart: "2026-10-01", periodEnd: "2026-12-31" },
        { id: "n3", fundId: "f-sink", levyScheduleId: "ls-special", dueDate: "2026-09-01", amountDue: "1000.00", amountPaid: "1000.00", periodStart: "2026-09-01", periodEnd: "2026-09-30" },
      ],
    };
    fx.tables.LevySchedule = { all: [{ id: "ls1", levyType: "ORDINARY" }, { id: "ls-special", levyType: "SPECIAL" }] };
    fx.tables.InsurancePolicy = { all: [{ policyType: "BUILDING", insurer: "Acme", policyNumber: "B1", coverageAmount: "15000000", endDate: "2027-03-31", premium: "9000", broker: "Brokers Co" }] };
  };
  it("with the module and both entitlements recorded", async () => {
    useQld();
    records();
    fx.tables.Lot = { first: { id: "lot-1", schemeId: "s1", lotNumber: "7", entitlement: 12, interestScheduleEntitlement: 15 } };
    expect(await draftCertificateItems("s1", "lot-1", new Date("2026-10-27T02:00:00Z"))).toMatchSnapshot();
  });
  it("with the module and the entitlements missing, and nothing else recorded", async () => {
    useQld();
    fx.tables.Scheme = { first: { id: "s1", name: "Seaview", state: "QLD", timeZone: "Australia/Brisbane", regulationModule: null } };
    fx.tables.Lot = { first: { id: "lot-1", schemeId: "s1", lotNumber: "7", entitlement: null, interestScheduleEntitlement: null } };
    expect(await draftCertificateItems("s1", "lot-1", new Date("2026-10-27T02:00:00Z"))).toMatchSnapshot();
  });
});

describe("Queensland request errors", () => {
  const requester = { requestedOn: "2026-10-26", requesterType: "OWNER", requesterName: "Jo", requesterAddress: "7/1 Example St", authorisedByType: null, authorisedByName: null, authorisedByAddress: null };
  const inspection = { schemeId: "s1", lotId: "lot-1", inspectorType: "OWNER", inspectorName: "Jo", authorisedBy: null, requestedOn: "2026-10-26", notes: null, actorId: "a1" };

  it("are as recorded", async () => {
    useQld();
    const out: Record<string, unknown> = {};
    out.certificateBadType = await errorOf(store.createCertificate({ schemeId: "s1", lotId: "lot-1", requester: { ...requester, requesterType: "COVENANT_CHARGEE", requesterName: " ", requestedOn: "2026-10-28" }, actorId: "a1" }));
    out.certificateAgent = await errorOf(store.createCertificate({ schemeId: "s1", lotId: "lot-1", requester: { ...requester, requesterType: "AGENT", authorisedByType: "AGENT" }, actorId: "a1" }));
    out.certificateAuthorisedPerson = await errorOf(store.createCertificate({ schemeId: "s1", lotId: "lot-1", requester: { ...requester, requesterType: "AUTHORISED_PERSON" }, actorId: "a1" }));
    fx.tables.SaleCertificate = { first: { id: "c1", schemeId: "s1", lotId: "lot-1", status: "DRAFT", items: [{ no: "1", title: "Body corporate", text: " " }] } };
    out.saveDraft = await errorOf(store.saveCertificateDraft({ schemeId: "s1", certificateId: "c1", requester: { ...requester, requesterType: "AGENT" }, itemTexts: {} }));
    out.inspectionBadType = await errorOf(store.createInspection({ ...inspection, inspectorType: "AUTHORISED_PERSON", inspectorName: "", requestedOn: "2026-11-01" }));
    out.inspectionAgent = await errorOf(store.createInspection({ ...inspection, inspectorType: "AGENT" }));
    fx.tables.Lot = { first: null };
    out.inspectionNoLot = await errorOf(store.createInspection(inspection));
    fx.tables.RecordsInspection = { first: { id: "i1", schemeId: "s1", inspectorType: "OWNER", requestedOn: "2026-10-26", status: "REQUESTED" } };
    out.scheduleEarly = await errorOf(store.scheduleInspection({ schemeId: "s1", id: "i1", when: "2026-10-20T10:00", place: " ", setByNotice: true }));
    out.scheduleNoTime = await errorOf(store.scheduleInspection({ schemeId: "s1", id: "i1", when: "", place: "Office", setByNotice: false }));
    out.completeNothing = await errorOf(store.completeInspection({ schemeId: "s1", id: "i1", inspected: false, copyPages: 0 }));
    out.completeBadPages = await errorOf(store.completeInspection({ schemeId: "s1", id: "i1", inspected: true, copyPages: Number.NaN }));
    fx.tables.RecordsInspection = { first: { id: "i1", schemeId: "s1", inspectorType: "OWNER", requestedOn: "2026-06-30", status: "REQUESTED" } };
    out.completeNoFeeYear = await errorOf(store.completeInspection({ schemeId: "s1", id: "i1", inspected: true, copyPages: 1 }));
    expect(out).toMatchSnapshot();
  });

  it("refuse every certificate and inspection step for a pack without the switches (NSW and Queensland)", async () => {
    const out: Record<string, unknown> = {};
    for (const [name, rules] of [["NSW", NSW], ["QLD", QLD]] as const) {
      fx.rules = switchedOff(rules);
      fx.tables.SaleCertificate = { first: { id: "c1", schemeId: "s1", lotId: "lot-1", status: "DRAFT", draftedOn: "2026-10-27", items: [{ no: "1", title: "One", text: "Nil" }] } };
      fx.tables.RecordsInspection = { first: { id: "i1", schemeId: "s1", inspectorType: "OWNER", requestedOn: "2026-10-26", status: "REQUESTED" } };
      out[name] = {
        create: await errorOf(store.createCertificate({ schemeId: "s1", lotId: "lot-1", requester, actorId: "a1" })),
        save: await errorOf(store.saveCertificateDraft({ schemeId: "s1", certificateId: "c1", requester, itemTexts: {} })),
        issue: await errorOf(store.issueCertificate({ schemeId: "s1", certificateId: "c1", actorId: "a1", checkedAll: true })),
        createInspection: await errorOf(store.createInspection(inspection)),
        schedule: await errorOf(store.scheduleInspection({ schemeId: "s1", id: "i1", when: "2026-10-28T10:00", place: "Office", setByNotice: false })),
        complete: await errorOf(store.completeInspection({ schemeId: "s1", id: "i1", minutes: 60, inspected: true, copyPages: 1 })),
      };
    }
    expect(out).toMatchSnapshot();
  });
});
