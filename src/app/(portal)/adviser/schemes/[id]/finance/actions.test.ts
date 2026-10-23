import { beforeEach, describe, expect, it, vi } from "vitest";

// MFA step-up (stage S4) is tested in src/lib/auth/mfa-enforcement.test.ts.
// Here the caller has verified recently unless a test says otherwise.
const stepUp = vi.hoisted(() => ({ requireRecentMfa: vi.fn(async () => {}) }));
vi.mock("@/lib/auth/mfa-enforcement", () => ({
  requireRecentMfa: stepUp.requireRecentMfa,
  getMfaStatus: vi.fn(async () => null),
  enforceMfa: vi.fn(async () => {}),
  enforceMfaFor: vi.fn(async () => {}),
  StepUpRequiredError: class extends Error {},
}));

/**
 * Cross-scheme tests for the adviser finance server actions (security
 * finding SEC-004). The caller is a genuine adviser of scheme A. Each action
 * is called directly, as an attacker would, with record ids from scheme B.
 * The database is an in-memory fake that evaluates the where clauses, so the
 * real query helpers run and their scheme scoping is what is tested.
 */

const SCHEME_A = "aaaaaaaa-0000-0000-0000-000000000001";
const SCHEME_B = "bbbbbbbb-0000-0000-0000-000000000002";

const membership = vi.fn();
vi.mock("@/lib/auth/require-membership", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-membership")>(
    "@/lib/auth/require-membership",
  );
  return { ...actual, requireSchemeMembership: (...a: unknown[]) => membership(...a) };
});
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/queries/activity-log", () => ({
  logActivity: vi.fn(),
  getAuditTrailForExport: vi.fn(),
  formatAuditTrailCsv: vi.fn(),
}));

const { sharedFake } = await import("@/test/fake-orm");
const actions = await import("./actions");
const { getBankReconciliationReport } = await import("@/lib/queries/reports");

const adviser = { id: "adviser-of-a" };

function seed() {
  sharedFake.reset({
    JournalEntry: [
      { id: "je-a", schemeId: SCHEME_A, status: "DRAFT", entryType: "MANUAL", transactionDate: "2026-09-01" },
      { id: "je-b", schemeId: SCHEME_B, status: "DRAFT", entryType: "MANUAL", transactionDate: "2026-09-01" },
    ],
    FinancialPeriod: [
      { id: "fp-a-closed", schemeId: SCHEME_A, name: "Aug 2026", status: "CLOSED", startDate: "2026-08-01", endDate: "2026-08-31" },
      { id: "fp-a-locked", schemeId: SCHEME_A, name: "Jul 2026", status: "LOCKED", startDate: "2026-07-01", endDate: "2026-07-31" },
      { id: "fp-b-locked", schemeId: SCHEME_B, name: "Jul 2026", status: "LOCKED", startDate: "2026-07-01", endDate: "2026-07-31" },
    ],
    SchemeBankAccount: [
      { id: "ba-a", schemeId: SCHEME_A, accountName: "A operating", isActive: true, lastReconciledBalance: "0" },
      { id: "ba-b", schemeId: SCHEME_B, accountName: "B operating", isActive: true, lastReconciledBalance: "1000" },
    ],
    BankTransaction: [
      { id: "bt-b", bankAccountId: "ba-b", schemeId: SCHEME_B, amount: "250.00", reconciliationStatus: "UNMATCHED", transactionDate: "2026-09-02", description: "B receipt", reference: null },
      // A forged row: A's account id but B's scheme. Must not appear in A's report.
      { id: "bt-x", bankAccountId: "ba-a", schemeId: SCHEME_B, amount: "99.00", reconciliationStatus: "UNMATCHED", transactionDate: "2026-09-02", description: "forged", reference: null },
      { id: "bt-a", bankAccountId: "ba-a", schemeId: SCHEME_A, amount: "10.00", reconciliationStatus: "UNMATCHED", transactionDate: "2026-09-03", description: "A receipt", reference: null },
    ],
    AccountCode: [
      { id: "ac-a", schemeId: SCHEME_A, code: "4000", isActive: true },
      { id: "ac-b", schemeId: SCHEME_B, code: "4000", isActive: true },
    ],
    Fund: [
      { id: "fund-a", schemeId: SCHEME_A, fundType: "ADMINISTRATIVE" },
      { id: "fund-b", schemeId: SCHEME_B, fundType: "ADMINISTRATIVE" },
    ],
    MatchingRule: [],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  membership.mockResolvedValue({ profile: adviser, membership: { role: "ADVISER" }, roles: ["ADVISER"] });
  seed();
});

describe("postJournalEntryAction", () => {
  it("refuses to post another scheme's draft entry", async () => {
    const r = await actions.postJournalEntryAction(SCHEME_A, "je-b");
    expect(r.error).toBe("Journal entry not found.");
    expect(sharedFake.table("JournalEntry").find((e) => e.id === "je-b")?.status).toBe("DRAFT");
  });

  it("posts the scheme's own draft entry", async () => {
    const r = await actions.postJournalEntryAction(SCHEME_A, "je-a");
    expect(r).toEqual({ success: true });
    expect(sharedFake.table("JournalEntry").find((e) => e.id === "je-a")?.status).toBe("POSTED");
  });
});

describe("reopenPeriodAction and lockPeriodAction", () => {
  it("refuses to reopen another scheme's locked period", async () => {
    const r = await actions.reopenPeriodAction(SCHEME_A, "fp-b-locked");
    expect(r.error).toBe("Financial period not found.");
    expect(sharedFake.table("FinancialPeriod").find((p) => p.id === "fp-b-locked")?.status).toBe("LOCKED");
  });

  it("refuses to reopen a locked period of the scheme itself", async () => {
    const r = await actions.reopenPeriodAction(SCHEME_A, "fp-a-locked");
    expect(r.error).toMatch(/Only a closed period can be reopened/);
    expect(sharedFake.table("FinancialPeriod").find((p) => p.id === "fp-a-locked")?.status).toBe("LOCKED");
  });

  it("reopens the scheme's own closed period", async () => {
    const r = await actions.reopenPeriodAction(SCHEME_A, "fp-a-closed");
    expect(r).toEqual({ success: true });
    expect(sharedFake.table("FinancialPeriod").find((p) => p.id === "fp-a-closed")?.status).toBe("OPEN");
  });

  it("refuses to lock another scheme's period", async () => {
    sharedFake.table("FinancialPeriod").push({ id: "fp-b-closed", schemeId: SCHEME_B, status: "CLOSED" });
    const r = await actions.lockPeriodAction(SCHEME_A, "fp-b-closed");
    expect(r.error).toBe("Financial period not found.");
    expect(sharedFake.table("FinancialPeriod").find((p) => p.id === "fp-b-closed")?.status).toBe("CLOSED");
  });
});

describe("createMatchingRuleAction (mass assignment)", () => {
  const base = { name: "Planted", matchType: "DESCRIPTION", descriptionPattern: "x", autoPost: true };

  it("ignores a schemeId in the data: the rule is always the authorised scheme's", async () => {
    const r = await actions.createMatchingRuleAction(SCHEME_A, {
      ...base,
      targetAccountCodeId: "ac-a",
      targetFundId: "fund-a",
      schemeId: SCHEME_B,
    } as Parameters<typeof actions.createMatchingRuleAction>[1]);
    expect(r.success).toBe(true);
    const rules = sharedFake.table("MatchingRule");
    expect(rules).toHaveLength(1);
    expect(rules[0].schemeId).toBe(SCHEME_A);
  });

  it("refuses a target account or fund from another scheme", async () => {
    const r1 = await actions.createMatchingRuleAction(SCHEME_A, { ...base, targetAccountCodeId: "ac-b", targetFundId: "fund-a" });
    expect(r1.error).toBe("Account not found.");
    const r2 = await actions.createMatchingRuleAction(SCHEME_A, { ...base, targetAccountCodeId: "ac-a", targetFundId: "fund-b" });
    expect(r2.error).toBe("Fund not found.");
    expect(sharedFake.table("MatchingRule")).toHaveLength(0);
  });

  it("refuses an unknown match type", async () => {
    const r = await actions.createMatchingRuleAction(SCHEME_A, { ...base, matchType: "REGEX_EVAL" });
    expect(r.error).toMatch(/Invalid match type/);
    expect(sharedFake.table("MatchingRule")).toHaveLength(0);
  });
});

describe("updateBankAccountAction", () => {
  function form(fields: Record<string, string>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  }

  it("refuses to change another scheme's bank account", async () => {
    const r = await actions.updateBankAccountAction(SCHEME_A, "ba-b", {}, form({ accountName: "Hijacked" }));
    expect(r.error).toBe("Bank account not found.");
    expect(sharedFake.table("SchemeBankAccount").find((b) => b.id === "ba-b")?.accountName).toBe("B operating");
  });

  it("updates the scheme's own bank account", async () => {
    const r = await actions.updateBankAccountAction(SCHEME_A, "ba-a", {}, form({ accountName: "Renamed" }));
    expect(r).toEqual({ success: true });
    expect(sharedFake.table("SchemeBankAccount").find((b) => b.id === "ba-a")?.accountName).toBe("Renamed");
  });

  it("refuses to deactivate another scheme's bank account", async () => {
    const r = await actions.deactivateBankAccountAction(SCHEME_A, "ba-b");
    expect(r.error).toBe("Bank account not found.");
    expect(sharedFake.table("SchemeBankAccount").find((b) => b.id === "ba-b")?.isActive).toBe(true);
  });
});

describe("createJournalEntryAction", () => {
  it("refuses lines that use another scheme's account", async () => {
    const r = await actions.createJournalEntryAction(SCHEME_A, {
      transactionDate: "2026-09-10",
      description: "Cross-scheme",
      entryType: "MANUAL",
      sourceType: "MANUAL",
      lines: [
        { accountCodeId: "ac-b", fundId: "fund-a", debit: 10 },
        { accountCodeId: "ac-a", fundId: "fund-a", credit: 10 },
      ],
    });
    expect(r.error).toBe("Account not found.");
  });

  it("refuses an entry type outside the manual types", async () => {
    const r = await actions.createJournalEntryAction(SCHEME_A, {
      transactionDate: "2026-09-10",
      description: "Pretend reversal",
      entryType: "REVERSAL",
      sourceType: "MANUAL",
      lines: [{ accountCodeId: "ac-a", fundId: "fund-a", debit: 10 }, { accountCodeId: "ac-a", fundId: "fund-a", credit: 10 }],
    });
    expect(r.error).toMatch(/Invalid entry type/);
  });
});

describe("getBankReconciliationReport", () => {
  it("returns nothing for another scheme's bank account", async () => {
    const report = await getBankReconciliationReport("ba-b", SCHEME_A, "2026-12-31");
    expect(report.totalTransactions).toBe(0);
    expect(report.lastReconciledBalance).toBe(0);
    expect(report.unmatchedTransactions).toEqual([]);
  });

  it("counts only the scheme's own transactions on its own account", async () => {
    const report = await getBankReconciliationReport("ba-a", SCHEME_A, "2026-12-31");
    expect(report.unmatchedTransactions.map((t) => t.id)).toEqual(["bt-a"]);
  });
});

describe("uploadFinancialDocumentAction", () => {
  const doc = { documentType: "INVOICE", fileName: "a.pdf", fileSize: 1000, mimeType: "application/pdf" };

  it("is for advisers only", async () => {
    await actions.uploadFinancialDocumentAction(SCHEME_A, { ...doc, fileUrl: `schemes/${SCHEME_A}/1-a.pdf` });
    expect(membership).toHaveBeenCalledWith(SCHEME_A, ["ADVISER"]);
  });

  it("refuses a web address or another scheme's folder as the file", async () => {
    for (const fileUrl of ["https://evil.example/phish.pdf", `schemes/${SCHEME_B}/1-a.pdf`, `schemes/${SCHEME_A}/../${SCHEME_B}/a.pdf`]) {
      const r = await actions.uploadFinancialDocumentAction(SCHEME_A, { ...doc, fileUrl });
      expect(r.error).toMatch(/not in this scheme's folder/);
    }
    expect(sharedFake.table("FinancialDocument")).toHaveLength(0);
  });

  it("refuses a link to another scheme's bank transaction", async () => {
    const r = await actions.uploadFinancialDocumentAction(SCHEME_A, {
      ...doc,
      fileUrl: `schemes/${SCHEME_A}/1-a.pdf`,
      bankTransactionId: "bt-b",
    });
    expect(r.error).toBe("Bank transaction not found.");
    expect(sharedFake.table("FinancialDocument")).toHaveLength(0);
  });
});

describe("reviewDocumentAction", () => {
  it("refuses another scheme's document and an unknown status", async () => {
    sharedFake.table("FinancialDocument").push({ id: "fd-b", schemeId: SCHEME_B, documentStatus: "UPLOADED" });
    const r1 = await actions.reviewDocumentAction(SCHEME_A, "fd-b", { documentStatus: "REVIEWED" });
    expect(r1.error).toBe("Document not found.");
    const r2 = await actions.reviewDocumentAction(SCHEME_A, "fd-b", { documentStatus: "PWNED" });
    expect(r2.error).toMatch(/Invalid document status/);
    expect(sharedFake.table("FinancialDocument").find((d) => d.id === "fd-b")?.documentStatus).toBe("UPLOADED");
  });
});
