import { describe, expect, it } from "vitest";
import robots from "./robots";

describe("robots.txt (AR-015)", () => {
  it("disallows all crawling of the app and names no sitemap", () => {
    const r = robots();
    expect(r.rules).toEqual({ userAgent: "*", disallow: "/" });
    expect(r.sitemap).toBeUndefined();
  });
});
