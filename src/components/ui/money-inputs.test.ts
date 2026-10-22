import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: number fields for money must allow cents. Without a step, browsers
 * only accept whole numbers and silently block the form on "1000.01".
 */
function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

const MONEY = /\(\$\)|amount|premium|cost|value|balance|limit|excess|insured|loss|paid|price/i;

describe("money inputs", () => {
  it("allow cents on every money FormField", () => {
    const offenders: string[] = [];
    for (const file of tsxFiles("src")) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/<FormField\b[^>]*?type="number"[^>]*?\/>/g)) {
        const label = m[0].match(/label=\{?"([^"]+)"/)?.[1] ?? "";
        if (MONEY.test(label) && !/step=/.test(m[0])) offenders.push(`${file}: ${label}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
