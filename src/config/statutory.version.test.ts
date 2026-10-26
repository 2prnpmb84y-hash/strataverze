/**
 * A rule pack's version must change whenever its rules change
 * (multi-jurisdiction plan, phase 1b, 26 Oct 2026).
 *
 * The version is recorded on every levy notice, interest charge and debt
 * recovery case, so two records with the same version must have been worked
 * out under the same rules. This test fingerprints each pack's rules. If it
 * fails, a rule changed: give the pack a new `version` in
 * src/config/statutory.ts and add the new fingerprint below. Never change an
 * existing line, because records already carry that version.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RULE_PACKS, rulePackLabel } from "./statutory";

/**
 * Every value in the pack, keys sorted. Functions are recorded by name only,
 * so a build tool change cannot fail the test; what they return is covered by
 * the golden tests (nsw.golden.test.ts).
 */
function fingerprint(value: unknown): string {
  const seen = (v: unknown): unknown => {
    if (typeof v === "function") return `fn:${v.name}`;
    if (Array.isArray(v)) return v.map(seen);
    if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, seen((v as Record<string, unknown>)[k])]));
    return v;
  };
  return createHash("sha256").update(JSON.stringify(seen(value))).digest("hex");
}

/**
 * What each function in a pack returns for fixed inputs, so a change to a
 * function's behaviour changes the fingerprint too. Every function in a pack
 * must be listed here (checked below).
 */
const FUND_TYPES = ["ADMINISTRATIVE", "CAPITAL_WORKS", "ADMIN", "SINKING", "SPECIAL", ""];
const PROBES: Record<string, (fn: (...a: never[]) => unknown) => unknown> = {
  defaultAccountingBasis: (fn) => FUND_TYPES.map((t) => (fn as (t: string) => unknown)(t)),
};

function packFingerprint(rules: Record<string, unknown>): string {
  const probed = Object.fromEntries(
    Object.entries(rules)
      .filter(([, v]) => typeof v === "function")
      .map(([k, v]) => [k, PROBES[k]?.(v as (...a: never[]) => unknown)]),
  );
  return fingerprint({ rules, probed });
}

/** Pack label: fingerprint of its rules. Add a line for each new version; never edit one. */
const KNOWN_VERSIONS: Record<string, string> = {
  "AU-NSW 2026.10.1": "beadc77f5a9c5145fb733bf4f8da8f7f0aef5800cdf2c8851aa7e287d63b3194",
  "AU-NSW 2026.10.2": "dc4fe58d43251ff7ea6192fa0d975442767ee743dc5737d204108632ab8d3d8d",
  "AU-NSW 2026.10.3": "fba9d1564ced3f81500c13f0d100cda92da1a6f7b045133b95dbcfce4d311807",
  "AU-NSW 2026.10.4": "4a3c7269761dcf0b47f55e0400c50f86a0a7639df718bccf22f4c58da503d56c",
};

describe("rule pack versions", () => {
  it.each(Object.values(RULE_PACKS).map((p) => [rulePackLabel(p), p] as const))("%s matches its recorded rules", (label, pack) => {
    expect(KNOWN_VERSIONS[label], `${label} has no recorded fingerprint. If its rules changed, give the pack a new version.`).toBeDefined();
    expect(packFingerprint(pack.rules as unknown as Record<string, unknown>), `The rules of ${label} changed. Give the pack a new version and record its fingerprint.`).toBe(KNOWN_VERSIONS[label]);
  });

  it("every function in a pack has a probe, so its behaviour is fingerprinted", () => {
    for (const p of Object.values(RULE_PACKS)) {
      const fns = Object.entries(p.rules).filter(([, v]) => typeof v === "function").map(([k]) => k);
      for (const k of fns) expect(PROBES[k], `Add a probe for ${k} in statutory.version.test.ts`).toBeDefined();
    }
  });

  it("labels fit the database column (40 characters)", () => {
    for (const p of Object.values(RULE_PACKS)) expect(rulePackLabel(p).length).toBeLessThanOrEqual(40);
  });
});
