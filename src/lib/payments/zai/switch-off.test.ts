/**
 * Switched off, the Zai integration changes nothing for anyone:
 * - no screen, component, action or other route imports it, so nothing new
 *   renders and no existing path runs any of it; the webhook route is the
 *   only way in, and it answers 404 while off (route.test.ts);
 * - no cron calls it (vercel.json);
 * - no committed environment file switches it on;
 * - it is off with no environment at all.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { zaiConfig } from "./config";

const ZAI_DIR = join("src", "lib", "payments", "zai");
const WEBHOOK_ROUTE_DIR = join("src", "app", "api", "payments", "zai", "webhook");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx|mts|js|jsx)$/.test(name) ? [path] : [];
  });
}

describe("switched off", () => {
  it("is imported only by its own files and the webhook route", () => {
    const importers = files("src")
      .filter((f) => !f.startsWith(ZAI_DIR) && !f.startsWith(WEBHOOK_ROUTE_DIR))
      .filter((f) => /payments\/zai/.test(readFileSync(f, "utf8")));
    expect(importers).toEqual([]);
  });

  it("adds no page, layout or component", () => {
    const added = files(join("src", "app")).filter((f) => /payments[/\\]zai/.test(f));
    expect(added.every((f) => f.startsWith(WEBHOOK_ROUTE_DIR) && /route(\.test)?\.ts$/.test(f))).toBe(true);
    expect(files(join("src", "components")).filter((f) => /zai/i.test(f))).toEqual([]);
  });

  it("has no cron", () => {
    expect(readFileSync("vercel.json", "utf8")).not.toMatch(/zai/i);
  });

  it("is not switched on by any committed environment file", () => {
    const envFiles = readdirSync(".").filter((f) => f.startsWith(".env"));
    for (const f of envFiles) expect(readFileSync(f, "utf8"), f).not.toMatch(/^\s*ZAI_PAYMENTS\s*=\s*["']?on/m);
  });

  it("is off with no environment", () => {
    expect(zaiConfig({}).enabled).toBe(false);
  });
});
