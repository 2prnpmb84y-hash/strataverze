/**
 * NSW golden output for the s 184 draft, the inspections page and the request
 * errors (stage 2, step 9, 27 Oct 2026). The snapshot was recorded from the
 * code before step 9 (origin/feat/qld-debt-recovery), when these read
 * SALE_CERTIFICATE and RECORDS_INSPECTION directly; the pack's shared shapes
 * must give the same output. Do not update it to make a refactor pass.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RULE_PACKS } from "@/config/statutory";

const NSW = RULE_PACKS.NSW.rules;
const fx = vi.hoisted(() => ({ tables: {} as Record<string, { first?: unknown; all?: unknown[] }> }));

vi.mock("@/prisma/db", () => {
  const table = (name: string) => {
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      include: () => chain,
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
  rulesForScheme: async () => ({ rules: NSW, label: "AU-NSW test" }),
  rulesForState: () => ({ rules: NSW, label: "AU-NSW test" }),
  schemeHasFeature: async () => true,
}));
vi.mock("@/lib/jurisdiction/scheme-time", () => ({ schemeToday: async () => "2026-10-27", schemeTimeZone: async () => "Australia/Sydney", timeZoneOf: () => "Australia/Sydney" }));
vi.mock("@/lib/finance/interest-setting", () => ({ getSchemeInterestSetting: async () => ({ mode: "STATUTORY" }), statutoryInterestForScheme: async () => [{ noticeId: "n1", additionalCents: 250 }] }));
vi.mock("@/lib/debt-recovery/payment-plan-requests", () => ({ lotArrears: async () => ({ leviesCents: 45_000, interestCents: 1_125 }) }));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("notFound"); }, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/(portal)/adviser/schemes/[id]/_sections/require-adviser-scheme", () => ({ requireAdviserScheme: async () => ({ id: "s1", state: "NSW" }) }));
vi.mock("@/lib/actions/records", () => {
  const act = vi.fn(async () => ({}));
  return { cancelInspectionAction: act, completeInspectionAction: act, createInspectionAction: act, recordFeePaidAction: act, scheduleInspectionAction: act };
});

const { draftCertificateItems } = await import("./certificate-draft");
const store = await import("./records-store");
const { default: InspectionsPage } = await import("@/app/(portal)/adviser/schemes/[id]/governance/inspections/page");

const errorOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return { message: (e as Error).message, fieldErrors: (e as { fieldErrors?: unknown }).fieldErrors };
  }
};

beforeEach(() => {
  fx.tables = {
    Scheme: { first: { id: "s1", name: "Harbour View", state: "NSW", timeZone: "Australia/Sydney" } },
    Lot: { first: { id: "lot-1", schemeId: "s1", lotNumber: "7" }, all: [{ id: "lot-1", schemeId: "s1", lotNumber: "7" }, { id: "lot-2", schemeId: "s1", lotNumber: "12" }] },
  };
});

describe("NSW s 184 draft (stage 2, step 9)", () => {
  it("items are unchanged", async () => {
    fx.tables.Fund = { all: [{ id: "f-admin", fundType: "ADMINISTRATIVE" }, { id: "f-cw", fundType: "CAPITAL_WORKS" }] };
    fx.tables.LevyNotice = {
      all: [
        { id: "n1", fundId: "f-admin", levyScheduleId: "ls1", dueDate: "2026-08-01", amountDue: "450.00", amountPaid: "0", periodStart: "2026-07-01", periodEnd: "2026-09-30" },
        { id: "n2", fundId: "f-cw", levyScheduleId: "ls1", dueDate: "2026-11-01", amountDue: "200.00", amountPaid: "50.00", periodStart: "2026-10-01", periodEnd: "2026-12-31" },
        { id: "n3", fundId: "f-cw", levyScheduleId: "ls-special", dueDate: "2026-09-01", amountDue: "1000.00", amountPaid: "1000.00", periodStart: "2026-09-01", periodEnd: "2026-09-30" },
      ],
    };
    fx.tables.LevySchedule = { all: [{ id: "ls1", levyType: "ORDINARY" }, { id: "ls-special", levyType: "SPECIAL" }] };
    fx.tables.Meeting = {
      all: [
        { id: "m1", status: "PUBLISHED", meetingType: "AGM", openedAt: "2026-03-10T23:00:00Z", deletedAt: null },
        { id: "m2", status: "SCHEDULED", meetingType: "COMMITTEE", scheduledAt: "2026-06-01T08:00:00Z", deletedAt: null },
        { id: "m3", status: "NOTICE_ISSUED", meetingType: "EGM", startTime: "2026-11-20T08:00:00Z", deletedAt: null },
      ],
    };
    fx.tables.LotDetail = { first: { lotId: "lot-1", rollOwnerName: "Jo Citizen", ownerAddress: "7/1 Example St" } };
    fx.tables.SchemeMembership = { all: [{ profileId: "p1" }] };
    fx.tables.Profile = { all: [{ id: "p1", firstName: "Ann", lastName: "Chair" }] };
    fx.tables.ByLaw = { all: [{ bylawNumber: 12, title: "Pets", effectiveDate: "2026-08-15", deletedAt: null }] };
    fx.tables.InsurancePolicy = { all: [{ policyType: "PUBLIC_LIABILITY", insurer: "Acme", policyNumber: "PL1", coverageAmount: "20000000", endDate: "2027-03-31", premium: "1200", broker: null }, { policyType: "BUILDING", insurer: "Acme", policyNumber: "B1", coverageAmount: "15000000", endDate: "2027-03-31", premium: "9000", broker: "Brokers Co" }] };
    expect(await draftCertificateItems("s1", "lot-1", new Date("2026-10-27T02:00:00Z"))).toMatchSnapshot();
  });
});

describe("NSW inspections page (stage 2, step 9)", () => {
  it("header, deadlines and requests are unchanged", async () => {
    fx.tables.RecordsInspection = {
      all: [
        { id: "i1", lotId: "lot-1", inspectorType: "OWNER", inspectorName: "Jo Citizen", authorisedBy: null, requestedOn: "2026-10-26", status: "REQUESTED", scheduledFor: null, setByNotice: false, place: null, minutes: null, feeCents: null, feePaidOn: null },
        { id: "i2", lotId: "lot-2", inspectorType: "AUTHORISED_PERSON", inspectorName: "Sam Agent", authorisedBy: "Pat Owner", requestedOn: "2026-10-20", status: "SCHEDULED", scheduledFor: "2026-10-30T00:00:00Z", setByNotice: true, place: "Office", minutes: null, feeCents: null, feePaidOn: null },
        { id: "i3", lotId: "lot-1", inspectorType: "OWNER", inspectorName: "Jo Citizen", authorisedBy: null, requestedOn: "2026-10-01", status: "COMPLETED", scheduledFor: "2026-10-03T00:00:00Z", setByNotice: false, place: "Office", minutes: 75, feeCents: 4_700, feePaidOn: null },
      ],
    };
    const html = renderToStaticMarkup(await InspectionsPage({ params: Promise.resolve({ id: "s1" }) }));
    const texts = html
      .replace(/<script[\s\S]*?<\/script>/g, "")
      .split(/<[^>]+>/)
      .map((t) => t.trim())
      .filter(Boolean);
    expect(texts).toMatchSnapshot();
  });
});

describe("NSW request errors (stage 2, step 9)", () => {
  const requester = { requestedOn: "2026-10-26", requesterType: "OWNER", requesterName: "Jo", requesterAddress: "7/1 Example St", authorisedByType: null, authorisedByName: null, authorisedByAddress: null };
  const inspection = { schemeId: "s1", lotId: "lot-1", inspectorType: "OWNER", inspectorName: "Jo", authorisedBy: null, requestedOn: "2026-10-26", notes: null, actorId: "a1" };

  it("are unchanged", async () => {
    const out: Record<string, unknown> = {};
    out.certificateBadType = await errorOf(store.createCertificate({ schemeId: "s1", lotId: "lot-1", requester: { ...requester, requesterType: "BUYER", requesterName: " ", requestedOn: "2026-10-28" }, actorId: "a1" }));
    out.certificateAuthorised = await errorOf(store.createCertificate({ schemeId: "s1", lotId: "lot-1", requester: { ...requester, requesterType: "AUTHORISED_PERSON", authorisedByType: "AUTHORISED_PERSON" }, actorId: "a1" }));
    fx.tables.SaleCertificate = { first: { id: "c1", schemeId: "s1", lotId: "lot-1", status: "DRAFT", items: [{ no: "1", title: "Strata renewal committee", text: " " }] } };
    out.saveDraft = await errorOf(store.saveCertificateDraft({ schemeId: "s1", certificateId: "c1", requester: { ...requester, requesterType: "AUTHORISED_PERSON" }, itemTexts: {} }));
    out.inspectionBadType = await errorOf(store.createInspection({ ...inspection, inspectorType: "BUYER", inspectorName: "", requestedOn: "2026-11-01" }));
    out.inspectionAuthorised = await errorOf(store.createInspection({ ...inspection, inspectorType: "AUTHORISED_PERSON" }));
    fx.tables.Lot = { first: null };
    out.inspectionNoLot = await errorOf(store.createInspection(inspection));
    fx.tables.RecordsInspection = { first: { id: "i1", schemeId: "s1", inspectorType: "OWNER", requestedOn: "2026-10-26", status: "REQUESTED" } };
    out.scheduleLate = await errorOf(store.scheduleInspection({ schemeId: "s1", id: "i1", when: "2026-11-20T10:00", place: "Office", setByNotice: true }));
    out.scheduleEarly = await errorOf(store.scheduleInspection({ schemeId: "s1", id: "i1", when: "2026-10-20T10:00", place: " ", setByNotice: false }));
    out.completeNoMinutes = await errorOf(store.completeInspection({ schemeId: "s1", id: "i1", minutes: 0 }));
    expect(out).toMatchSnapshot();
  });
});
