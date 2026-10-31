import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: the service role client (src/lib/supabase/admin.ts) bypasses RLS and
 * Auth checks. No browser code may import it, and only the files listed here
 * may use it, each after authorising the caller.
 */
const ALLOWED_USERS = new Set([
  "src/lib/actions/admin-mfa.ts",
  "src/app/(portal)/admin/security/page.tsx",
  // The documents bucket (S3): every caller authorises first.
  "src/lib/storage/server-storage.ts",
  // Reads a held change of owner's recorder's current Auth addresses (H-1, L1, L4): for
  // confirmOwnerChangeAction (after requireRolesOrAdmin(["ADVISER"]) and the step-up check) and the
  // review card on the Adviser's lot page and /admin/owner-changes (each checked first).
  "src/lib/owner/recorder-addresses.ts",
]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("service role client", () => {
  const users = walk(join(process.cwd(), "src"))
    .filter((f) => /from ["']@\/lib\/supabase\/admin["']/.test(readFileSync(f, "utf8")))
    .map((f) => relative(process.cwd(), f));

  it("is never imported by client code", () => {
    const client = users.filter((f) => /^\s*["']use client["']/.test(readFileSync(f, "utf8")));
    expect(client).toEqual([]);
  });

  it("is used only where listed", () => {
    expect(users.filter((f) => !ALLOWED_USERS.has(f)).sort()).toEqual([]);
  });
});
