/**
 * The NSW messages, labels and titles the finance code writes are unchanged
 * (golden; QLD finance wording go-live, 28 Oct 2026). Recorded against
 * origin/feat/qld-two-year-reminder before they took the building's words:
 * the cutover's file names, field names, row errors, control accounts and
 * problems, the onboarding income and budget checks, the notice content
 * check, the income statement reader, the drill-down basis and source
 * labels, the audit trail labels, the vault's titles, the levy register's
 * titles, the receipt reversal refusals, the plan check and the email
 * footer. The arguments marked "words" were added after the snapshots were
 * recorded; before then they were ignored.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));

const { sharedFake } = await import("@/test/fake-orm");
const { statutoryRulesFor } = await import("@/config/statutory");
const { CUTOVER_LABELS, controlTieOuts, cutoverReadiness, parseArrearsRow } = await import("@/lib/finance/migration-cutover");
const { FIELDS, missingFields } = await import("@/lib/finance/migration-templates");
const { checkIncomeBudget, onboardingYears } = await import("@/lib/onboarding/income-budget");
const { validateLevyNoticeContent } = await import("@/lib/finance/levy-notice-content");
const { parseIncomeStatement } = await import("@/lib/onboarding/read-income-statement");
const { modeLabel } = await import("@/lib/finance/drill-down");
const { getEntrySources } = await import("@/lib/finance/report-drill-down");
const { formatActionLabel, formatEntityTypeLabel } = await import("@/lib/queries/activity-log-utils");
const { financialTitle } = await import("@/lib/vault/sources");
const { levyRegister } = await import("@/lib/levies/levy-ledger");
const { reversalProblem } = await import("@/lib/finance/levy-reversal");
const { checkPlan } = await import("@/lib/levies/notice-plan");
const { emailLayout } = await import("@/lib/email-templates/layout");
const { html } = await import("@/lib/email-templates/html");
const NSW = statutoryRulesFor("NSW");
const T = NSW.TERMINOLOGY; /* words */
const TITLE = { Levy: "Levy", Levies: "Levies", LateCharge: "Interest" }; /* words */
const FUNDS = { admin: "administrative", capitalWorks: "capital works" }; /* words */

beforeEach(() => {
  sharedFake.reset({ Scheme: [{ id: "s1", state: "NSW", name: "Harbour View" }] });
});

describe("NSW cutover words (golden)", () => {
  const funds = [{ id: "f1", name: "Administrative Fund", fundType: "ADMINISTRATIVE" }];
  const lookups = { accounts: [], funds, lots: [{ id: "l1", lotNumber: "1" }], suppliers: [], bankAccounts: [], terms: T /* words */ };

  it("the file and field names, and the missing columns", () => {
    expect(CUTOVER_LABELS).toMatchSnapshot("files");
    expect(FIELDS.levy_arrears).toMatchSnapshot("fields");
    expect(missingFields({}, "levy_arrears", T /* words */)).toMatchSnapshot("missing");
  });

  it("an outstanding notice's row errors", () => {
    expect(parseArrearsRow({ lotNumber: "1", dueDate: "01/08/2026", levyOutstanding: "x", interestCharged: "y", interestPaid: "z" }, 2, lookups, "2026-06-30").errors).toMatchSnapshot("not amounts");
    expect(parseArrearsRow({ lotNumber: "1", dueDate: "01/08/2026", levyOutstanding: "10", interestCharged: "1", interestPaid: "2" }, 3, lookups, "2026-06-30").errors).toMatchSnapshot("paid more");
  });

  it("the control accounts and the problems", () => {
    const arrears = parseArrearsRow({ lotNumber: "1", dueDate: "01/08/2026", levyOutstanding: "10" }, 2, lookups, "2026-06-30");
    const credits = [{ rowNumber: 2, value: { lotId: "l1", lotNumber: "1", fundId: "f1", amountCents: 500, note: null }, errors: [], warnings: [] }];
    const rows = { levy_arrears: [arrears], owner_credits: credits } as never;
    expect(controlTieOuts(rows, funds, T /* words */).map((t) => t.control)).toMatchSnapshot("controls");
    const files = [{ dataType: "levy_arrears" as const, fileName: "a.csv", sha256: "x", rowCount: 1, errorCount: 1 }];
    expect(cutoverReadiness({ files, rows, funds, cutoverDate: null, terms: T /* words */ } as never).problems).toMatchSnapshot("problems");
  });
});

describe("NSW onboarding checks (golden)", () => {
  it("the income and budget levy questions", () => {
    const ctx = { takeoverDate: "2026-06-30", years: onboardingYears("2026-06-30", "06-30"), funds: [], words: { levy: T.levy, levies: T.levies } /* words */ };
    const check = checkIncomeBudget({ funds: [], adoption: { kind: "draft", meetingDate: "" }, levies: { frequency: "", raisedBeforeTakeover: "" } }, ctx);
    expect(check.problems).toMatchSnapshot();
    const all = checkIncomeBudget({ funds: [], adoption: { kind: "draft", meetingDate: "" }, levies: { frequency: "ANNUALLY", raisedBeforeTakeover: "some", raisedInstalments: [1] } }, ctx);
    expect(all.notes).toMatchSnapshot("all raised");
  });

  it("a fund the income statement reader does not recognise", () => {
    const line = (page: number, ...cells: string[]) => ({ page, y: 0, cells: cells.map((text, i) => ({ x: i * 100, text })), text: cells.join("   ") });
    const s = parseIncomeStatement([line(1, "Income and Expenditure Statement", "Special Fund"), line(1, "Income"), line(1, "Total Income", "0.00", "0.00")], { admin: "administrative", capitalWorks: "capital works fund" } /* words */);
    expect(s.issues.filter((i) => i.includes("not recognised"))).toMatchSnapshot();
  });
});

describe("NSW notice content check (golden)", () => {
  it("names every missing item", () => {
    const empty = {
      scheme: { name: null, planNumber: null },
      lotNumber: null,
      ownerNames: [],
      noticeDate: "2026-10-01",
      dueDate: "2026-11-15",
      fundName: null,
      amountCents: 0,
      payment: { accountName: null, bsb: null, accountNumber: null, reference: null },
      contact: { name: null, emailOrPhone: null },
      includesInterestWarning: false,
      includesHardshipStatement: false,
      includesLedgerAccess: false,
    };
    expect(validateLevyNoticeContent(empty, NSW.NOTICE_RULES, T, FUNDS /* words */).map((m) => m.message)).toMatchSnapshot();
  });
});

describe("NSW drill-down, audit, vault and register words (golden)", () => {
  it("the basis labels", () => {
    expect([modeLabel("CASH", T), modeLabel("ACCRUAL", T), modeLabel("LEDGER", T)] /* words */).toMatchSnapshot();
  });

  it("the source labels", async () => {
    sharedFake.reset({
      Scheme: [{ id: "s1", state: "NSW", name: "Harbour View" }],
      LevyNotice: [{ id: "n1", schemeId: "s1", noticeNumber: "LN-1", levyScheduleId: "sc1", lotId: "l1" }],
      LevySchedule: [{ id: "sc1", schemeId: "s1", title: null, financialYear: 2026, frequency: "QUARTERLY" }],
      LevyPayment: [{ id: "p1", schemeId: "s1", journalEntryId: "j3", levyNoticeId: "n1" }],
    });
    const sources = await getEntrySources(
      "s1",
      [
        { id: "j1", sourceType: "INTEREST", sourceId: "n1" },
        { id: "j2", sourceType: "LEVY_RAISED", sourceId: "sc1" },
        { id: "j3", sourceType: "PAYMENT", sourceId: null },
      ],
      T /* words */,
    );
    expect([...sources.values()].map((s) => s.source?.label)).toMatchSnapshot();
  });

  it("the audit trail labels", () => {
    expect(["INTEREST_CHARGED", "LEVY_NOTICE_ISSUED", "LEVIES_GENERATED"].map((a) => formatActionLabel(a, TITLE /* words */))).toMatchSnapshot("actions");
    expect(["Levy", "LevyItem", "LevyNotice", "LevySchedule"].map((e) => formatEntityTypeLabel(e, TITLE /* words */))).toMatchSnapshot("entities");
  });

  it("the vault titles of a levy notice", () => {
    expect([financialTitle("LEVY_NOTICE", "Levy-notice-LN-1-Lot-1.pdf", T.levy), financialTitle("LEVY_NOTICE", "scan.pdf", T.levy)] /* words */).toMatchSnapshot();
  });

  it("the levy register's titles", () => {
    const base = { lotId: "l1", schemeId: "s1", fundId: "f1", status: "ISSUED", dueDate: "2026-08-01", amountDue: "1", amountPaid: "0", balanceOutstanding: "1", interestCharged: "0", fund: { name: "Administrative Fund" } };
    const notices = [
      { ...base, id: "n1", noticeNumber: "LN-1", levyScheduleId: "sc1", levySchedule: { levyType: "ORDINARY", financialYear: 2026 } },
      { ...base, id: "n2", noticeNumber: "LN-2", levyScheduleId: "sc2", levySchedule: { levyType: "SPECIAL", title: "Roof" } },
    ];
    expect(levyRegister(notices as never, "2026-10-27", T /* words */).map((g) => [g.title, g.levyType])).toMatchSnapshot();
  });

  it("the receipt reversal refusals", () => {
    const base = { entryStatus: "POSTED", sourceType: "PAYMENT", payments: [{ id: "p", reversedAt: null }], credits: [], bankTransactions: [], reason: "ENTERED_IN_ERROR" as const, levy: T.levy /* words */ };
    expect([reversalProblem({ ...base, sourceType: "INVOICE" }), reversalProblem({ ...base, payments: [] })]).toMatchSnapshot();
  });

  it("the plan check", () => {
    const lots = [{ lotId: "a", lotNumber: "1", entitlement: 10, ownerId: null }];
    expect(checkPlan({ lots, totalEntitlement: 20, totalCents: 0, words: { levy: T.levy, entitlement: NSW.ENTITLEMENT_SCHEDULES[0].name } /* words */ }).map((i) => i.message)).toMatchSnapshot();
  });

  it("the email footer", () => {
    expect(emailLayout(html`<p>Hello</p>`, { ownersCorporation: T.ownersCorporation } /* words */).match(/You are receiving[^<]*/)?.[0]).toMatchSnapshot();
  });
});
