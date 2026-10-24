import { describe, expect, it } from "vitest";
import { PRODUCTION_SITE_URL, siteUrl } from "./site-url";

describe("siteUrl", () => {
  it("uses APP_URL, then NEXT_PUBLIC_SITE_URL, without a trailing slash", () => {
    expect(siteUrl({ APP_URL: "https://app.example.com.au/", NODE_ENV: "production" })).toBe(
      "https://app.example.com.au",
    );
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "https://site.example.com", NODE_ENV: "production" })).toBe(
      "https://site.example.com",
    );
  });

  it("falls back to the production deployment, never the unregistered domain", () => {
    const url = siteUrl({ NODE_ENV: "production" });
    expect(url).toBe(PRODUCTION_SITE_URL);
    expect(url).not.toContain("strataverze.com.au");
  });

  it("never uses localhost outside development", () => {
    expect(siteUrl({ NODE_ENV: "production" })).not.toContain("localhost");
    expect(siteUrl({ NODE_ENV: "development" })).toBe("http://localhost:3000");
  });

  it("ignores insecure or malformed values", () => {
    expect(siteUrl({ APP_URL: "http://phish.example.com", NODE_ENV: "production" })).toBe(PRODUCTION_SITE_URL);
    expect(siteUrl({ APP_URL: "https://evil.example.com/path?x=1", NODE_ENV: "production" })).toBe(
      PRODUCTION_SITE_URL,
    );
  });
});
