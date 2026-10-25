import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard (25 Oct 2026): Prisma 8 has no count() terminal on a collection.
 * `db.orm.public.X.where(...).count()` type-checks but throws
 * ORM.INCLUDE_INVALID at runtime; it broke every upload. Count with
 * `.aggregate((a) => ({ n: a.count() }))` instead. count() inside include()
 * refinements and aggregate() callbacks is fine and not matched here.
 */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("no count() terminal on a Prisma collection", () => {
  it("is not used anywhere in the app", () => {
    const root = join(process.cwd(), "src");
    const offenders = walk(root).flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return /\)\s*\.count\(\)/.test(text) ? [relative(process.cwd(), file)] : [];
    });
    expect(offenders).toEqual([]);
  });
});
