/**
 * NSW golden tests (multi-jurisdiction plan, phase 0, 26 Oct 2026).
 *
 * These record what the platform produces for an NSW scheme today: the
 * statutory constants, the meeting rule set, the AGM template and motion
 * library, levy notice checks, notices and PDFs, interest, capital works,
 * audit and the debt recovery steps. The jurisdiction work (phase 1) moves
 * these rules into a rule pack. Every output here must stay identical.
 *
 * A snapshot change is a change to NSW outputs. Do not update the snapshot to
 * make a refactor pass. Update it only for a deliberate, reviewed change to
 * NSW rules, and say why in the commit.
 */
import { describe, expect, it } from "vitest";
import * as statutory from "@/config/statutory";
import { MEETING_RULES as NSW_RULE_SET } from "@/config/statutory";
import {
  earliestCompliantMeetingDate,
  evaluateResolution,
  minutesDeadline,
  snapshotRuleSet,
  validateNoticePeriod,
  type MeetingType,
  type ResolutionCategory,
  type ResolutionTally,
} from "@/lib/meetings/rules";
import {
  NSW_AGM_TEMPLATE,
  NSW_MOTION_LIBRARY,
  getMotionLibrary,
  resolveAgendaTemplate,
} from "@/lib/meetings/templates";
import { assembleNoticeContent } from "@/lib/meetings/notice";
import { statutoryInterest, allocatePayment, interestSettingProblem } from "@/lib/finance/statutory-interest";
import { validateLevyNoticeContent, type LevyNoticeContentInput } from "@/lib/finance/levy-notice-content";
import { issueDateFor, issueTiming, lateMessage } from "@/lib/levies/issue-timing";
import { projectPlan, requiredAnnualContribution, reviewDueDate, spendByYear } from "@/lib/finance/capital-works-plan";
import { auditRequired } from "@/lib/finance/key-financial-information";
// The NSW rules, as a building in NSW gets them (phase 1: every helper takes its building's rules).
const NSW = statutory.statutoryRulesFor("NSW");
const DEFAULT_RECOVERY_STEPS = NSW.DEBT_RECOVERY_STEPS;
const HARDSHIP_INFORMATION = NSW.HARDSHIP_INFORMATION;
import { levyNoticeEmail } from "@/lib/email-templates/levy-notice";
import { levyNoticeBlocks, statutoryPackBlocks } from "@/lib/pdf/documents";
import type { StatutoryPack } from "@/lib/finance/statutory-pack";

/** The wording constants added in phase 1d: snapshotted on their own below, so adding them did not touch the snapshot above. */
const WORDING = ["TERMINOLOGY", "CITATIONS", "HARDSHIP_INFORMATION", "DEBT_RECOVERY_GUIDANCE"];

/**
 * The NSW statutory workflows added in October 2026 (the gaps found by the
 * multi-jurisdiction review), each with its own golden output below.
 */
const WORKFLOWS = ["PAYMENT_PLANS", "COMMITTEE_TRAINING", "ANNUAL_REPORTING", "RECORD_RETENTION", "SALE_CERTIFICATE", "RECORDS_INSPECTION"] as const;

describe("NSW statutory workflows (Oct 2026)", () => {
  it("are the rules recorded", () => {
    expect(Object.fromEntries(WORKFLOWS.map((n) => [n, (NSW as Record<string, unknown>)[n]]))).toMatchSnapshot();
  });
});

describe("NSW wording (phase 1d)", () => {
  it("is the wording the platform used before", () => {
    expect(Object.fromEntries(WORDING.map((n) => [n, (NSW as Record<string, unknown>)[n]]))).toMatchSnapshot();
  });
});

describe("NSW statutory constants", () => {
  it("are unchanged", () => {
    // The NSW constants as at phase 0, by name, so adding a rule or a
    // jurisdiction does not touch this snapshot (phase 1, 26 Oct 2026).
    const names = [
      "AUDIT_THRESHOLD",
      "CAPITAL_WORKS_PLAN",
      "DEFAULT_ACCOUNTING_BASIS",
      "KEY_FINANCIAL_INFORMATION",
      "LEVY_NOTICE_RULES",
      "PAYMENT_ALLOCATION_ORDER",
      "STATUTORY_INTEREST",
      "WORKS_SPENDING_RULES",
    ] as const;
    expect(Object.fromEntries(names.map((n) => [n, statutory[n]]))).toMatchSnapshot();
    // A new NSW constant must be added to this list (and its golden output)
    // on purpose: MEETING_RULES is covered by the meeting tests below, and
    // DEBT_RECOVERY_STEPS (moved into the pack unchanged in phase 1b) by the
    // debt recovery test at the end.
    const constants = Object.entries(statutory.statutoryRulesFor("NSW"))
      .filter(([k, v]) => typeof v !== "function" && !["MEETING_RULES", "DEBT_RECOVERY_STEPS", ...WORDING, ...WORKFLOWS].includes(k))
      .map(([k]) => k)
      .sort();
    expect(constants).toEqual([...names].sort());
    // The NSW pack holds the same values.
    for (const n of names) expect(statutory.statutoryRulesFor("NSW")[n]).toBe(statutory[n]);
    expect(statutory.statutoryRulesFor("NSW").MEETING_RULES).toBe(NSW_RULE_SET);
  });

  it("give the same default accounting basis", () => {
    const types = ["ADMINISTRATIVE", "CAPITAL_WORKS", "ADMIN", "SINKING", "SPECIAL", ""];
    expect(Object.fromEntries(types.map((t) => [t, statutory.defaultAccountingBasis(t)]))).toMatchSnapshot();
  });
});

describe("NSW meetings", () => {
  const types: MeetingType[] = ["AGM", "EGM", "COMMITTEE", "FIRST_AGM"];
  const from = new Date("2026-03-01T00:00:00Z");

  it("rule set and its stored snapshot are unchanged", () => {
    expect(NSW_RULE_SET).toMatchSnapshot();
    expect(snapshotRuleSet(NSW_RULE_SET)).toEqual(NSW_RULE_SET);
  });

  it("notice dates and minutes deadlines are unchanged", () => {
    const out = types.map((t) => ({
      type: t,
      earliest: earliestCompliantMeetingDate(NSW_RULE_SET, t, from)?.toISOString() ?? null,
      minutesBy: minutesDeadline(NSW_RULE_SET, t, from)?.toISOString() ?? null,
      sixDays: validateNoticePeriod(NSW_RULE_SET, t, from, new Date("2026-03-07T09:00:00Z"), "UTC"),
      fourteenDays: validateNoticePeriod(NSW_RULE_SET, t, from, new Date("2026-03-15T09:00:00Z"), "UTC"),
    }));
    expect(out).toMatchSnapshot();
  });

  it("resolution results are unchanged", () => {
    const categories = Object.keys(NSW_RULE_SET.resolutionCategories) as ResolutionCategory[];
    const tallies: Record<string, ResolutionTally> = {
      clearFor: { forCount: 10, againstCount: 2, forUE: 900, againstUE: 100 },
      tied: { forCount: 5, againstCount: 5, forUE: 500, againstUE: 500 },
      quarterAgainst: { forCount: 6, againstCount: 4, forUE: 750, againstUE: 250 },
      justUnderQuarter: { forCount: 6, againstCount: 4, forUE: 751, againstUE: 249 },
      halfAgainst: { forCount: 3, againstCount: 7, forUE: 500, againstUE: 500 },
      pollReverses: { forCount: 7, againstCount: 3, forUE: 300, againstUE: 700, poll: true },
      noneAgainst: { forCount: 4, againstCount: 0, forUE: 400, againstUE: 0 },
      noUE: { forCount: 8, againstCount: 1 },
      noVotes: { forCount: 0, againstCount: 0, forUE: 0, againstUE: 0 },
    };
    const out = categories.map((c) => ({
      category: c,
      results: Object.fromEntries(Object.entries(tallies).map(([k, t]) => [k, evaluateResolution(NSW_RULE_SET, c, t)])),
    }));
    expect(out).toMatchSnapshot();
  });

  it("AGM template and motion library are unchanged", () => {
    expect(NSW_AGM_TEMPLATE).toMatchSnapshot();
    expect(NSW_MOTION_LIBRARY).toMatchSnapshot();
    expect(types.map((t) => ({ t, motions: getMotionLibrary("NSW", t).map((m) => m.title) }))).toMatchSnapshot();
    expect(resolveAgendaTemplate("NSW", "AGM", { planNumber: "12345", lastMeetingDate: "15/03/2026" })).toMatchSnapshot();
    expect(resolveAgendaTemplate("NSW", "EGM", { planNumber: "12345" })).toEqual([]);
  });

  it("notice content is unchanged", () => {
    const scheme = { name: "Harbour View", planNumber: "12345", address: "1 Harbour St", suburb: "Sydney", state: "NSW", postcode: "2000" };
    const out = (["AGM", "FIRST_AGM", "EGM", "SGM", "COMMITTEE"] as const).map((meetingType) => {
      const c = assembleNoticeContent({
        scheme,
        meeting: { title: "Meeting", meetingType, startTime: "2026-04-01T08:00:00Z", format: "IN_PERSON", location: "Foyer", joinUrl: null, joinDetails: null, timezone: "Australia/Sydney" },
        items: [{ position: 1, title: "Confirmation of Minutes", resolutionText: "That the minutes be approved.", explanatoryNote: null, resolutionCategory: "ORDINARY" }],
      });
      const { generatedAt: _generatedAt, ...rest } = c;
      return rest;
    });
    expect(out).toMatchSnapshot();
  });
});

describe("NSW levies", () => {
  const complete: LevyNoticeContentInput = {
    scheme: { name: "Harbour View", planNumber: "12345" },
    lotNumber: "7",
    ownerNames: ["Alex Nguyen"],
    noticeDate: "2026-10-01",
    dueDate: "2026-11-05",
    fundName: "Administrative Fund",
    amountCents: 82_509,
    payment: { accountName: "The Owners SP 12345", bsb: "062-000", accountNumber: "12345678", reference: "LN-0042" },
    contact: { name: "Sam Adviser", emailOrPhone: "sam@example.com" },
    includesInterestWarning: true,
    includesHardshipStatement: true,
    includesLedgerAccess: true,
  };

  it("levy notice content checks are unchanged", () => {
    const cases: Record<string, LevyNoticeContentInput> = {
      complete,
      shortNotice: { ...complete, dueDate: "2026-10-20" },
      urgentFourteenDays: { ...complete, dueDate: "2026-10-15", isUrgentSpecialLevy: true },
      urgentTooShort: { ...complete, dueDate: "2026-10-10", isUrgentSpecialLevy: true },
      nothingFilled: {
        scheme: { name: null, planNumber: null },
        lotNumber: null,
        ownerNames: [],
        noticeDate: "2026-10-01",
        dueDate: "2026-10-02",
        fundName: null,
        amountCents: 0,
        payment: { accountName: null, bsb: null, accountNumber: null, reference: null },
        contact: { name: null, emailOrPhone: null },
        includesInterestWarning: false,
        includesHardshipStatement: false,
        includesLedgerAccess: false,
      },
    };
    expect(HARDSHIP_INFORMATION).toMatchSnapshot();
    expect(Object.fromEntries(Object.entries(cases).map(([k, v]) => [k, validateLevyNoticeContent(v, NSW.LEVY_NOTICE_RULES)]))).toMatchSnapshot();
  });

  it("issue timing is unchanged", () => {
    const due = "2026-12-01";
    const out = ["2026-10-01", "2026-10-27", "2026-10-28", "2026-11-01", "2026-11-20"].map((today) => {
      const t = issueTiming(due, today, NSW.LEVY_NOTICE_RULES);
      return { today, timing: t, message: lateMessage(t, "Q3 levy", NSW.LEVY_NOTICE_RULES) };
    });
    expect({ issueDate: issueDateFor(due, NSW.LEVY_NOTICE_RULES), out }).toMatchSnapshot();
  });

  it("interest is unchanged", () => {
    const base = { levyCents: 100_000, dueDate: "2026-01-31", payments: [] as { date: string; amountCents: number }[] };
    const cases = {
      notYetDue: { ...base, asAt: "2026-01-15" },
      inGrace: { ...base, asAt: "2026-02-20" },
      graceEndsMonthEnd: { ...base, asAt: "2026-02-28" },
      afterGrace: { ...base, asAt: "2026-03-31" },
      oneYear: { ...base, asAt: "2027-01-31" },
      paidInGrace: { ...base, asAt: "2026-06-30", payments: [{ date: "2026-02-15", amountCents: 100_000 }] },
      partPaid: { ...base, asAt: "2026-06-30", payments: [{ date: "2026-04-01", amountCents: 40_000 }] },
      stopped: { ...base, asAt: "2026-12-31", stopAt: "2026-05-01" },
      noInterest: { ...base, asAt: "2026-12-31", noInterest: true },
      nothingOwing: { ...base, levyCents: 0, asAt: "2026-12-31" },
    };
    expect(Object.fromEntries(Object.entries(cases).map(([k, v]) => [k, statutoryInterest(v, NSW.STATUTORY_INTEREST)]))).toMatchSnapshot();
  });

  it("payment allocation and interest settings are unchanged", () => {
    expect(statutory.PAYMENT_ALLOCATION_ORDER).toEqual(["LEVY", "INTEREST", "RECOVERY_COSTS"]);
    const owing = { levyCents: 50_000, interestCents: 2_000, recoveryCostsCents: 10_000 };
    expect([10_000, 51_000, 62_000, 70_000].map((p) => allocatePayment(p, owing))).toMatchSnapshot();
    expect(
      [
        { mode: "STATUTORY" },
        { mode: "STATUTORY", ratePercent: 8 },
        { mode: "NO_INTEREST" },
        { mode: "NO_INTEREST", resolutionMeetingId: "m", resolutionMotionId: "x" },
        { mode: "CUSTOM" },
      ].map((i) => interestSettingProblem(i, NSW.STATUTORY_INTEREST)),
    ).toMatchSnapshot();
  });

  it("levy notice email and PDF are unchanged", () => {
    const doc = {
      schemeName: "Harbour View",
      planNumber: "12345",
      lotNumber: "7",
      ownerNames: ["Alex Nguyen"],
      noticeNumber: "LN-0042",
      noticeDate: "2026-10-01",
      dueDate: "2026-11-05",
      periodStart: "2026-10-01",
      periodEnd: "2026-12-31",
      fundName: "Administrative Fund",
      amountCents: 82_509,
      payment: { accountName: "The Owners SP 12345", bsb: "062-000", accountNumber: "12345678", reference: "LN-0042" },
      contact: { name: "Sam Adviser", emailOrPhone: "sam@example.com" },
      ledgerUrl: "https://app.strataverze.com/owner/levies",
      noInterest: false,
      interest: NSW.STATUTORY_INTEREST,
      hardship: NSW.HARDSHIP_INFORMATION,
      ownersCorporation: NSW.TERMINOLOGY.ownersCorporation,
    };
    expect(levyNoticeBlocks(doc)).toMatchSnapshot();
    expect(levyNoticeBlocks({ ...doc, noInterest: true })).toMatchSnapshot();
    expect(
      levyNoticeEmail({
        to: "alex@example.com",
        ownerName: "Alex Nguyen",
        schemeName: doc.schemeName,
        planNumber: "12345",
        lotNumber: "7",
        noticeNumber: doc.noticeNumber,
        noticeDate: doc.noticeDate,
        dueDate: doc.dueDate,
        fundName: doc.fundName,
        amount: "$825.09",
        payment: doc.payment,
        contact: doc.contact,
        ledgerUrl: doc.ledgerUrl,
        noInterest: false,
        interest: NSW.STATUTORY_INTEREST,
        hardship: NSW.HARDSHIP_INFORMATION,
        ownersCorporation: NSW.TERMINOLOGY.ownersCorporation,
      }),
    ).toMatchSnapshot();
  });
});

describe("NSW finance reporting", () => {
  it("capital works plan maths is unchanged", () => {
    const items = [
      { plannedYear: 2027, estimatedCostCents: 1_000_000 },
      { plannedYear: 2029, estimatedCostCents: 2_500_000 },
      { plannedYear: 2035, estimatedCostCents: 8_000_000 },
      { plannedYear: 2040, estimatedCostCents: 9_999_999 },
    ];
    const { horizonYears: years, reviewEveryYears } = NSW.CAPITAL_WORKS_PLAN;
    const out = {
      spend: spendByYear(items, 2027, years),
      level: requiredAnnualContribution({ items, startYear: 2027, openingBalanceCents: 500_000, method: "LEVEL", years }),
      average: requiredAnnualContribution({ items, startYear: 2027, openingBalanceCents: 500_000, method: "AVERAGE", years }),
      projection: projectPlan({ items, startYear: 2027, openingBalanceCents: 500_000, annualContributionCents: 1_500_000, years }),
      reviewDue: reviewDueDate("2026-04-01", reviewEveryYears),
      reviewDueLeap: reviewDueDate("2028-02-29", reviewEveryYears),
    };
    expect(out).toMatchSnapshot();
  });

  it("audit test is unchanged", () => {
    const t = statutory.AUDIT_THRESHOLD;
    const cases = [
      { lots: 100, leviesRaisedCents: 25_000_000 },
      { lots: 101, leviesRaisedCents: 0 },
      { lots: 10, leviesRaisedCents: 25_000_001 },
      { lots: 150, leviesRaisedCents: 30_000_000 },
    ];
    expect(cases.map((c) => ({ ...c, result: auditRequired({ ...c, lotsMoreThan: t.lotsMoreThan, leviesRaisedMoreThanCents: t.leviesRaisedMoreThanCents }) }))).toMatchSnapshot();
  });

  it("statutory pack PDF content is unchanged", () => {
    const fund = {
      fundId: "a",
      fundName: "Administrative Fund",
      fundType: "ADMINISTRATIVE",
      basis: "CASH" as const,
      keyInformation: {
        balanceCarriedForwardCents: 500_000,
        totalIncomeReceivedCents: 800_000,
        totalInterestEarnedCents: 0,
        totalContributionsPaidCents: 800_000,
        totalUnpaidContributionsCents: 200_000,
        maintenanceExpenditureCents: 300_000,
        administrationExpenditureCents: 50_000,
        balanceAtEndCents: 950_000,
        principalItemsNextPeriod: [{ description: "Insurance", amountCents: 60_000 }],
      },
      income: [{ accountId: "i", accountCode: "4-1000", accountName: "Levy Income", accountType: "INCOME" as const, accountSubType: "LEVY_INCOME", fundId: "a", amountCents: 800_000 }],
      expenditure: [],
      comparative: { incomeCents: 0, expenseCents: 0, surplusCents: 0 },
      totals: { incomeCents: 800_000, expenseCents: 350_000, surplusCents: 450_000 },
      balanceSheet: { assets: [], liabilities: [], ownersFundsCents: 950_000 },
      levyRegister: [],
      arrearsByLot: [{ lotNumber: "3", unpaidCents: 200_000 }],
    };
    const pack: StatutoryPack = {
      scheme: { name: "Harbour View", planNumber: "12345", lots: 12 },
      financialYear: 2026,
      start: "2026-07-01",
      end: "2027-06-30",
      generatedAt: "2027-07-10T00:00:00Z",
      funds: [fund, { ...fund, fundId: "c", fundName: "Capital Works Fund", fundType: "CAPITAL_WORKS", basis: "ACCRUAL" }],
      notes: ["An audit is not required by size."],
      audit: { required: false, byLots: false, byBudget: false, annualBudgetCents: 1 },
      rules: { rulePack: "AU-NSW test", keyFinancialInformation: NSW.KEY_FINANCIAL_INFORMATION, auditThreshold: NSW.AUDIT_THRESHOLD },
      adopted: null,
    };
    expect(statutoryPackBlocks(pack)).toMatchSnapshot();
  });
});

describe("NSW debt recovery", () => {
  it("default recovery steps are unchanged", () => {
    expect(DEFAULT_RECOVERY_STEPS).toMatchSnapshot();
  });
});
