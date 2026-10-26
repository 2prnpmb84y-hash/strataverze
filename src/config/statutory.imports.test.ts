/**
 * Application code never takes a jurisdiction's rules directly
 * (multi-jurisdiction plan, phase 1b, 26 Oct 2026).
 *
 * A building's rules come from `rulesForScheme(schemeId)`,
 * `rulesForState(state)` or `statutoryRulesFor(state)`, so a building is never
 * silently given the NSW rules. `@/config/statutory` still exports the NSW
 * rules under their own names, for tests and for `src/config` itself. This
 * test fails if any other file imports one of them.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import * as statutory from "./statutory";

/** What application code may import from `@/config/statutory`: the index, never a rule. */
const ALLOWED = new Set([
  "RULE_PACKS",
  "rulePackFor",
  "rulePackForScheme",
  "rulePackLabel",
  "statutoryRulesFor",
  "UnsupportedJurisdictionError",
  "StatutoryRules",
  "RulePack",
]);

const SRC = join(__dirname, "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : files(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".d.ts") ? [p] : [];
  });
}

describe("statutory rule imports", () => {
  it("only the rule pack index is imported by application code", () => {
    const problems: string[] = [];
    for (const file of files(SRC)) {
      const rel = relative(SRC, file);
      if (rel.startsWith("config/")) continue;
      const text = readFileSync(file, "utf8");
      if (/from "@\/config\/statutory\/[^"]+"/.test(text)) problems.push(`${rel} imports a jurisdiction file directly`);
      for (const m of text.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"@\/config\/statutory"/g)) {
        for (const raw of m[1].split(",")) {
          const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
          if (name && !ALLOWED.has(name)) problems.push(`${rel} imports ${name}`);
        }
      }
      if (/import\s+\*\s+as\s+\w+\s+from\s+"@\/config\/statutory"/.test(text)) problems.push(`${rel} imports every rule`);
    }
    expect(problems).toEqual([]);
  });

  it("the allowed names exist", () => {
    for (const n of ALLOWED) {
      if (n === "StatutoryRules" || n === "RulePack") continue; // types
      expect(statutory, n).toHaveProperty(n);
    }
  });
});
