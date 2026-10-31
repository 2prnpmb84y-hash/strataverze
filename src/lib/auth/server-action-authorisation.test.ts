import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Guard: every exported function in a "use server" file is a public POST
 * endpoint that anyone can call directly, whatever the UI shows. Each one
 * must call a scheme, role or ownership check, not just "is someone signed
 * in" (security finding SEC-003, SEC-008).
 *
 * A function passes when its body, or a function in the same file that it
 * calls, contains one of the checks below. The allow-list holds the actions
 * that are meant to be open (sign-in, sign-up) or that check ownership in a
 * way this test cannot see; each entry says why. Adding to it needs a reason.
 */

const ROOT = process.cwd();

const CHECKS =
  /\b(requireSchemeMembership|requireSchemeAccess|requireSchemeAccessOrAdmin|requireRolesOrAdmin|requirePageAccess|requirePlatformAdmin|requireFinancialReadAccess|requireAdviserScheme|requireActiveContractorContact|requireContractorOwnership|requireCommitteeAccess|validateMeetingAccess|verifyAccess|authorise\w*|canView\w*)\s*\(/;

const ALLOWED: Record<string, string> = {
  // Public auth and marketing endpoints.
  "src/app/login/actions.ts#login": "sign-in",
  "src/app/login/actions.ts#signup": "sign-up (to be replaced by invitation and supplier sign-up in S2)",
  "src/app/forgot-password/actions.ts#resetPassword": "public password reset request",
  "src/lib/actions/contractor-onboarding.ts#registerContractorAccount": "supplier self-registration",
  // Act only on the caller's own records.
  "src/app/(portal)/settings/actions.ts#updateProfileAction": "updates only the caller's own profile, from an explicit field list",
  "src/lib/actions/sessions.ts#signOutEverywhereAction": "ends only the caller's own sessions",
  "src/lib/actions/sessions.ts#signOutAction": "ends only the caller's own current session",
  "src/lib/actions/uploads.ts#prepareUploadAction": "prepareUpload authorises through the purpose's own check (UPLOAD_PURPOSES in src/lib/storage/uploads.ts)",
  "src/app/(portal)/invitations/actions.ts#acceptInvitationAction": "requires the invitation to be for the caller's email",
  "src/app/(portal)/invitations/actions.ts#declineInvitationAction": "requires the invitation to be for the caller's email",
  "src/lib/actions/scheme-selection.ts#selectScheme": "checks the caller's own memberships",
  "src/lib/actions/scheme-selection.ts#getSelectedSchemeId": "reads the caller's own cookie; never used as authorisation after S1",
  "src/lib/actions/scheme-selection.ts#clearSelectedScheme": "clears the caller's own cookie",
  "src/app/(portal)/owner/(scheme)/finance/actions.ts#uploadPaymentConfirmationAction": "scoped to the caller's own lots and the scheme's payments folder (src/lib/owner/payment-upload.ts)",
  "src/app/search/actions.ts#globalSearch": "scope worked out per scheme from the caller's own memberships (src/lib/search/scope.ts)",
  "src/app/(portal)/owner/(scheme)/maintenance/actions.ts#createOwnerWorkOrderAction": "retired 25 Oct 2026: reads nothing and changes nothing, only returns a message (owners raise works requests instead)",
  "src/lib/actions/works.ts#reviewWorksRequest": "retired 25 Oct 2026: reads nothing and changes nothing, only returns a message (works requests are decided by the committee's vote)",
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

function isUseServerFile(source: ts.SourceFile): boolean {
  const first = source.statements[0];
  return (
    !!first &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === "use server"
  );
}

type Fn = { name: string; body: string; exported: boolean };

function functionsIn(source: ts.SourceFile): Fn[] {
  const out: Fn[] = [];
  for (const statement of source.statements) {
    const exported = !!ts.getModifiers(statement as ts.HasModifiers)?.some(
      (m) => m.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      out.push({ name: statement.name.text, body: statement.body.getText(source), exported });
    } else if (ts.isVariableStatement(statement)) {
      for (const d of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(d.name) &&
          d.initializer &&
          (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))
        ) {
          out.push({ name: d.name.text, body: d.initializer.body.getText(source), exported });
        }
      }
    }
  }
  return out;
}

function passes(fn: Fn, all: Fn[], seen = new Set<string>()): boolean {
  if (CHECKS.test(fn.body)) return true;
  seen.add(fn.name);
  return all.some(
    (other) =>
      !seen.has(other.name) &&
      new RegExp(`\\b${other.name}\\s*\\(`).test(fn.body) &&
      passes(other, all, seen),
  );
}

describe("server actions", () => {
  const files = walk(join(ROOT, "src"));
  const unchecked: string[] = [];
  const needlesslyAllowed: string[] = [];
  const seenKeys = new Set<string>();

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (!text.includes("use server")) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    if (!isUseServerFile(source)) continue;
    const fns = functionsIn(source);
    for (const fn of fns.filter((f) => f.exported)) {
      const key = `${relative(ROOT, file)}#${fn.name}`;
      seenKeys.add(key);
      const ok = passes(fn, fns);
      if (!ok && !ALLOWED[key]) unchecked.push(key);
      if (ok && ALLOWED[key]) needlesslyAllowed.push(key);
    }
  }

  it("each call a scheme, role or ownership check", () => {
    expect(unchecked).toEqual([]);
  });

  it("keep the allow-list to actions that need it", () => {
    expect(needlesslyAllowed).toEqual([]);
  });

  it("have no stale allow-list entries", () => {
    expect(Object.keys(ALLOWED).filter((k) => !seenKeys.has(k))).toEqual([]);
  });
});
