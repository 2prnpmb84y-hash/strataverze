/**
 * Statutory wording comes from the building's rule pack (multi-jurisdiction
 * plan, phase 1d). Text the platform shows or sends for a building does not
 * name an Act, a section, a tribunal or a rule's period itself: it takes them
 * from `rules.TERMINOLOGY`, `rules.CITATIONS`, the rule values (via
 * src/lib/jurisdiction/wording.ts) or `rules.NOTICE_RULES.hardship`. Comments
 * may still cite the law. This test fails if such wording appears in code text
 * outside the places listed below.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");

/** Wording that belongs in a rule pack, not in code. */
const PATTERNS = [
  /SSMA/,
  /Strata Schemes Management/,
  /\bNCAT\b/,
  /\b5 weeks\b/,
  /\b5-week\b/,
  /\bone month\b/,
  /National Debt Helpline/,
  /New South Wales/,
  /Fair Trading/,
  // A bare citation in brackets: "(s 85(3))", "(Reg cl 14)", "(cl 21)".
  /\((?:s|ss|cl|Reg cl|Sch) \d/,
  // The NSW rule values written out.
  /\$30,000/,
  /\b14 days instead of 30\b/,
  // The VIC, ACT and WA notice rules (stage 2, PR 6a): the Acts and the forms come from the pack too.
  /UTMA/,
  /Unit Titles/,
  /Owners Corporations Act/,
  /Owners corporation (final )?fee notice/,
  /not later than 28 days/,
  // Debt recovery for the draft packs (stage 2, PR 9a): the ACT charge, the VIC and WA provisions, and where claims
  // are heard come from the pack too. "registrar-general" is the ACT's lower-case term; the NSW certificate's
  // "Registrar-General" (lib/records/certificate-draft.ts) is left as it is.
  /registrar-general/,
  /statutory charge/i,
  /s 163\(2\)/,
  /s 143\(5\)/,
  /\bSAT\b/,
  /State Administrative Tribunal/,
  /\bVCAT\b/,
  /\bACAT\b/,
  /Magistrates Court/,
];

/** Allowed, with the reason. */
const ALLOWED: Record<string, string> = {
  "app/(public)/terms/page.tsx": "StrataVerze's own terms of use are governed by New South Wales law (the company's, not a building's).",
  "app/(portal)/supplier/onboarding/components/step-licences.tsx": "An example licence authority for a contractor (not a building).",
  "lib/meetings/templates.ts": "The NSW AGM template, chosen for NSW buildings by templatesFor(state).",
  "lib/billing/disclosure.ts": "StrataVerze's own fee labels (price book). Which fees are recoverable from an owner by state is phase 2.",
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : files(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".d.ts") ? [p] : [];
  });
}

describe("statutory wording", () => {
  it("comes from the rule pack, not from code", () => {
    const found: string[] = [];
    for (const file of files(SRC)) {
      const rel = relative(SRC, file);
      if (rel.startsWith("config/") || ALLOWED[rel]) continue;
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        const code = line.trim();
        if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")) return;
        for (const p of PATTERNS) if (p.test(line)) found.push(`${rel}:${i + 1} ${code.slice(0, 100)}`);
      });
    }
    expect(found).toEqual([]);
  });

  it("allows only files that exist", () => {
    for (const rel of Object.keys(ALLOWED)) expect(() => statSync(join(SRC, rel))).not.toThrow();
  });
});
