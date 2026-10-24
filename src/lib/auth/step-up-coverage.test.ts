import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every sensitive operation in the security plan needs an authenticator
 * check within the last 15 minutes (requireRecentMfa). This keeps the list
 * from quietly losing one: each named function must call requireRecentMfa,
 * or a helper that does (listed in HELPERS).
 *
 * To add an operation, add it here and call requireRecentMfa in it.
 */
const SENSITIVE: Record<string, string[]> = {
  "src/lib/actions/works.ts": [
    "authoriseWorksPayment",
    "recordWorksPayment",
    "submitApprovalDecision",
    "approveWorksInvoiceAction",
    "createDelegation",
    "revokeDelegation",
    "createApprovalRoute",
    "updateApprovalRoute",
    "updateContractorBusiness",
  ],
  "src/lib/actions/payment-controls.ts": [
    "setTreasurerAction",
    "savePaymentPolicyAction",
    "verifySupplierBankDetailsAction",
    "changeSupplierBankDetailsAction",
  ],
  "src/lib/actions/contractor-onboarding.ts": ["saveBankDetails"],
  "src/lib/actions/contractor-review.ts": [
    "approveContractor",
    "rejectContractor",
    "requestClarification",
    "suspendContractor",
    "resolveReviewItem",
  ],
  "src/lib/actions/admin-mfa.ts": ["resetUserMfaAction"],
  "src/app/(portal)/owner/(scheme)/finance/approvals/approve-actions.ts": ["ownerApproveSupplierInvoiceAction"],
  "src/app/(portal)/adviser/schemes/[id]/finance/actions.ts": [
    "approveInvoiceAction",
    "recordInvoicePaymentAction",
    "createBankAccountAction",
    "updateBankAccountAction",
    "deactivateBankAccountAction",
    "reopenPeriodAction",
    "exportAuditTrailAction",
  ],
  "src/app/(portal)/adviser/schemes/[id]/finance/migration/actions.ts": ["signOffCutoverAction", "executeCutoverAction"],
  "src/app/(portal)/adviser/schemes/[id]/members/actions.ts": ["sendInvitationAction", "revokeInvitationAction"],
  "src/app/(portal)/adviser/schemes/[id]/lots/actions.ts": ["assignOwnerAction", "removeOwnerAction"],
  "src/app/(portal)/adviser/schemes/actions.ts": ["deleteSchemeAction"],
  "src/app/mfa/actions.ts": ["removeTotpFactorAction"],
};

/** Local helpers that call requireRecentMfa themselves. */
const HELPERS = ["requireReviewer"];

/** The body of `export async function name(...) {...}`, by brace matching. */
function functionBody(source: string, name: string): string | null {
  const re = new RegExp(`export async function ${name}\\b`);
  const m = re.exec(source);
  if (!m) return null;
  // Skip the parameter list (which can contain braces in types) to the body.
  let i = source.indexOf("(", m.index);
  let depth = 0;
  for (; i < source.length; i++) {
    if (source[i] === "(") depth++;
    else if (source[i] === ")" && --depth === 0) break;
  }
  // The body's opening brace ends its line; braces in a return type do not.
  const open = source.indexOf("{\n", i);
  let braces = 0;
  for (let j = open; j < source.length; j++) {
    if (source[j] === "{") braces++;
    else if (source[j] === "}" && --braces === 0) return source.slice(open, j + 1);
  }
  return null;
}

describe("sensitive operations need a fresh authenticator check", () => {
  for (const [file, names] of Object.entries(SENSITIVE)) {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    for (const name of names) {
      it(`${name} (${file})`, () => {
        const body = functionBody(source, name);
        expect(body, `${name} not found in ${file}`).not.toBeNull();
        const calls = /requireRecentMfa\(/.test(body!) || HELPERS.some((h) => new RegExp(`\\b${h}\\(`).test(body!));
        expect(calls, `${name} must call requireRecentMfa`).toBe(true);
      });
    }
  }

  it("the owner credit approvals are gated", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/actions/owner-credits.ts"), "utf8");
    expect(source.match(/requireRecentMfa\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("the audit export route is gated", () => {
    const source = readFileSync(join(process.cwd(), "src/app/api/finance/audit-export/route.ts"), "utf8");
    expect(source).toMatch(/requireRecentMfa\(\)/);
  });
});
