/**
 * NSW and Queensland debt recovery rules, golden (VIC, ACT and WA stage 2,
 * PR 9a, 29 Oct 2026). Recorded on the step order fix (b964e1e) in a
 * temporary worktree, before the shared debt recovery engine for the draft
 * packs (the gates, the authority check, the forum and the WA pack) was
 * added. What these helpers give for an NSW and a Queensland building must
 * stay exactly the same. Never regenerate these snapshots to make a change
 * pass: a difference is a change to NSW or Queensland debt recovery.
 *
 * Covered: the proceedings deadline helpers (proceedingsDeadlineRule,
 * proceedingsDeadlineFlags and proceedingsDeadlineWarning) over a grid of due
 * dates and days, NSW (no rule) and Queensland; the Queensland reminder run
 * end to end over a run of days (each email's recipient, subject and body,
 * and the claim rows); the fees (neverRecoverableFor, previewRecoveryFees
 * with feeWordingFor over a fixed price book) and the case words
 * (caseWordsFor).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PriceBookEntry } from "@/lib/billing/price-book";

const sent = vi.hoisted(() => ({ emails: [] as Array<{ to: string; subject: string; html: string }> }));

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async (e: { to: string; subject: string; html: string }) => {
    sent.emails.push({ to: e.to, subject: e.subject, html: e.html });
    return true;
  }),
}));
vi.mock("@/lib/log", () => ({ logError: vi.fn() }));
vi.mock("@/lib/site-url", async (orig) => ({ ...(await orig<typeof import("@/lib/site-url")>()), siteUrl: () => "https://app.example.test" }));

const { sharedFake } = await import("@/test/fake-orm");
const { RULE_PACKS } = await import("@/config/statutory");
const { proceedingsDeadlineRule, proceedingsDeadlineFlags, proceedingsDeadlineWarning, flaggableDueOnOrBefore } = await import("./proceedings-deadline");
const { runProceedingsDeadlineReminders } = await import("./proceedings-reminder-run");
const { neverRecoverableFor, previewRecoveryFees } = await import("@/lib/billing/capture");
const { feeWordingFor } = await import("@/lib/billing/disclosure");
const { TEST_PRICE_BOOK } = await import("@/lib/billing/test-price-book");
const { caseWordsFor } = await import("@/lib/jurisdiction/screen-words");
const { auDate } = await import("@/lib/onboarding/property-onboarding");

const STATES = ["NSW", "QLD"] as const;
const rulesOf = (s: (typeof STATES)[number]) => RULE_PACKS[s].rules;

const env = { capture: process.env.PLATFORM_BILLING_CAPTURE, gst: process.env.STRATAVERZE_GST_REGISTERED };
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-02T01:00:00.000Z"));
});
afterAll(() => {
  vi.useRealTimers();
  process.env.PLATFORM_BILLING_CAPTURE = env.capture;
  process.env.STRATAVERZE_GST_REGISTERED = env.gst;
  if (env.capture === undefined) delete process.env.PLATFORM_BILLING_CAPTURE;
  if (env.gst === undefined) delete process.env.STRATAVERZE_GST_REGISTERED;
});

describe("the proceedings deadline helpers", () => {
  const dueDates = ["2024-02-29", "2024-10-27", "2024-10-28", "2024-12-31", "2025-01-27", "2026-01-01"];
  const days = ["2026-02-27", "2026-02-28", "2026-04-28", "2026-04-29", "2026-10-26", "2026-10-27", "2026-12-27", "2026-12-28", "2027-03-01"];
  const lots = dueDates.map((d, i) => ({ lotId: `lot-${i + 1}`, lotNumber: String(i + 1), oldestUnpaidDueDate: d, proceedingsStarted: false }));
  const withStarted = [...lots, { lotId: "lot-s", lotNumber: "90", oldestUnpaidDueDate: "2020-01-01", proceedingsStarted: true }, { lotId: "lot-n", lotNumber: "91", oldestUnpaidDueDate: null, proceedingsStarted: false }];

  for (const st of STATES) {
    it(`${st}: the rule, the flags and the warnings over a grid of days`, () => {
      const rules = rulesOf(st);
      const rule = proceedingsDeadlineRule(rules);
      const grid = days.map((today) => {
        const flags = proceedingsDeadlineFlags(rule, withStarted, today);
        return {
          today,
          flaggableDueOnOrBefore: rule ? flaggableDueOnOrBefore(rule, today) : null,
          flags,
          warnings: rule ? flags.map((f) => proceedingsDeadlineWarning(f, rule, rules.TERMINOLOGY, auDate)) : [],
        };
      });
      expect({ rule, grid }).toMatchSnapshot();
    });
  }
});

describe("the Queensland reminder run", () => {
  it("each email and claim over a run of days (an NSW building is never emailed)", async () => {
    sharedFake.reset({
      Scheme: [
        { id: "qld-1", name: "Riverside", state: "QLD", isActive: true, timeZone: "Australia/Brisbane" },
        { id: "nsw-1", name: "Harbour View", state: "NSW", isActive: true, timeZone: "Australia/Sydney" },
      ],
      LevyNotice: [
        { id: "n-4a", schemeId: "qld-1", lotId: "lot-4", status: "OVERDUE", dueDate: "2024-10-27", balanceOutstanding: "500.00", lot: { lotNumber: "4" } },
        { id: "n-4b", schemeId: "qld-1", lotId: "lot-4", status: "OVERDUE", dueDate: "2025-01-27", balanceOutstanding: "500.00", lot: { lotNumber: "4" } },
        { id: "n-7", schemeId: "qld-1", lotId: "lot-7", status: "PARTIALLY_PAID", dueDate: "2024-02-29", balanceOutstanding: "12.50", lot: { lotNumber: "7" } },
        { id: "n-nsw", schemeId: "nsw-1", lotId: "nsw-lot-1", status: "OVERDUE", dueDate: "2020-01-01", balanceOutstanding: "900.00", lot: { lotNumber: "1" } },
      ],
      DebtRecoveryCase: [],
      DebtRecoveryStep: [],
      ProceedingsDeadlineReminder: [],
      SchemeMembership: [
        { id: "m1", schemeId: "qld-1", profileId: "adviser", role: "ADVISER", isActive: true, lotId: null },
        { id: "m2", schemeId: "qld-1", profileId: "chair", role: "COMMITTEE", isActive: true, lotId: null },
        { id: "m3", schemeId: "qld-1", profileId: "debtor", role: "COMMITTEE", isActive: true, lotId: null },
        { id: "m4", schemeId: "qld-1", profileId: "debtor", role: "OWNER", isActive: true, lotId: "lot-4" },
        { id: "m6", schemeId: "nsw-1", profileId: "nsw-adviser", role: "ADVISER", isActive: true, lotId: null },
      ],
      Profile: ["adviser", "chair", "debtor", "nsw-adviser"].map((id) => ({ id, email: `${id}@example.com`, firstName: id, lastName: null })),
    });
    sharedFake.setUniqueKeys({ ProceedingsDeadlineReminder: [["lotId", "oldestDueOn"]] });
    const runs: unknown[] = [];
    for (const day of ["2026-02-27", "2026-03-01", "2026-04-29", "2026-10-26", "2026-10-27", "2026-11-27", "2026-12-13", "2026-12-20", "2026-12-28", "2027-01-28"]) {
      sent.emails.length = 0;
      const count = await runProceedingsDeadlineReminders(new Date(`${day}T02:00:00Z`));
      runs.push({ day, count, emails: [...sent.emails].sort((a, b) => a.to.localeCompare(b.to) || a.subject.localeCompare(b.subject)) });
    }
    const claims = sharedFake
      .table("ProceedingsDeadlineReminder")
      .map((r) => ({ schemeId: r.schemeId, lotId: r.lotId, oldestDueOn: r.oldestDueOn, deadlineOn: r.deadlineOn, lastStage: r.lastStage, lastSentOn: r.lastSentOn }));
    expect({ runs, claims }).toMatchSnapshot();
  });
});

describe("the recovery fees and case words", () => {
  it("neverRecoverableFor", () => {
    expect({ NSW: neverRecoverableFor("NSW"), QLD: neverRecoverableFor("QLD"), none: neverRecoverableFor(null) ?? "undefined" }).toMatchSnapshot();
  });

  it("previewRecoveryFees with feeWordingFor (fixed price book, capture on)", async () => {
    process.env.PLATFORM_BILLING_CAPTURE = "on";
    process.env.STRATAVERZE_GST_REGISTERED = "on";
    const book: PriceBookEntry[] = [
      ...TEST_PRICE_BOOK,
      { gstInclusive: false, effectiveFrom: "2026-01-01", isActive: true, code: "RECOVERY_STEP", variant: "FINAL_NOTICE", description: "Debt recovery step: final notice", amountCents: 3000, unit: "PER_STEP", payerType: "OWNER_VIA_OC", recoverableFromOwner: true },
    ];
    sharedFake.reset({
      PlatformPriceBook: book.map((e, i) => ({
        id: `pb-${i}`,
        code: e.code,
        variant: e.variant ?? null,
        description: e.description,
        amount: e.amountCents == null ? null : (e.amountCents / 100).toFixed(2),
        gstInclusive: e.gstInclusive,
        unit: e.unit,
        payerType: e.payerType,
        effectiveFrom: e.effectiveFrom,
        effectiveTo: null,
        isActive: e.isActive,
        recoverableFromOwner: e.recoverableFromOwner ?? false,
        bandMin: e.bandMin ?? null,
        bandMax: e.bandMax ?? null,
      })),
    });
    const out: Record<string, unknown> = {};
    for (const st of STATES) {
      const rules = rulesOf(st);
      out[st] = { wording: feeWordingFor(rules), fees: await previewRecoveryFees({ state: st, wording: feeWordingFor(rules) }) };
    }
    out.noBuilding = await previewRecoveryFees();
    process.env.PLATFORM_BILLING_CAPTURE = "off";
    out.captureOff = await previewRecoveryFees({ state: "NSW", wording: feeWordingFor(rulesOf("NSW")) });
    expect(out).toMatchSnapshot();
  });

  it("caseWordsFor", () => {
    expect(Object.fromEntries(STATES.map((st) => [st, caseWordsFor(rulesOf(st))]))).toMatchSnapshot();
  });
});
