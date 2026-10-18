/**
 * Tests for the redirect sanitisation logic used in:
 * - src/app/auth/callback/route.ts (sanitiseRedirectPath)
 * - src/proxy.ts (sanitisePath)
 *
 * These functions protect against open redirect attacks (F-02).
 * Since the functions are not exported from their modules, we
 * replicate the logic here to unit test the algorithm.
 *
 * The sanitisation strategy converts dangerous URLs into safe
 * local paths rather than rejecting them. For example,
 * "//evil.com" becomes "/evil.com" (a local path on localhost).
 */

import { describe, it, expect } from "vitest";

// ── Replicate sanitiseRedirectPath from auth/callback/route.ts ──

function sanitiseRedirectPath(raw: string): string {
  const fallback = "/dashboard";
  if (!raw || typeof raw !== "string") return fallback;

  // Strip any leading double-slash or protocol to prevent open redirect
  const cleaned = raw.replace(/^[/\\]{2,}/, "/").replace(/^https?:\/\//i, "/");

  // Must start with a single slash and not contain authority component
  if (!cleaned.startsWith("/") || cleaned.startsWith("//")) return fallback;

  try {
    const url = new URL(cleaned, "http://localhost");
    if (url.hostname !== "localhost") return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

// ── Replicate sanitisePath from proxy.ts ──

function sanitisePath(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/^\/\/+/, "/");
  if (!cleaned.startsWith("/") || cleaned.includes("://")) return null;
  try {
    const parsed = new URL(cleaned, "http://localhost");
    if (parsed.hostname !== "localhost") return null;
    return parsed.pathname + parsed.search;
  } catch {
    return null;
  }
}

describe("sanitiseRedirectPath (auth callback)", () => {
  it("allows simple internal paths", () => {
    expect(sanitiseRedirectPath("/dashboard")).toBe("/dashboard");
    expect(sanitiseRedirectPath("/owner/schemes")).toBe("/owner/schemes");
    expect(sanitiseRedirectPath("/adviser/schemes/123")).toBe(
      "/adviser/schemes/123",
    );
  });

  it("preserves query parameters on internal paths", () => {
    expect(sanitiseRedirectPath("/owner?tab=finance")).toBe(
      "/owner?tab=finance",
    );
  });

  it("strips protocol-relative URLs to local paths (//evil.com → /evil.com)", () => {
    // The function strips leading double-slashes to a single slash,
    // converting it to a local path which is safe
    const result = sanitiseRedirectPath("//evil.com");
    expect(result).toBe("/evil.com");
    // Crucially this is a local path, not a redirect to evil.com
  });

  it("strips absolute https URLs to local paths", () => {
    // https://evil.com → after protocol strip → /evil.com (local path)
    const result = sanitiseRedirectPath("https://evil.com");
    expect(result).toBe("/evil.com");
  });

  it("strips absolute http URLs to local paths", () => {
    const result = sanitiseRedirectPath("http://evil.com");
    expect(result).toBe("/evil.com");
  });

  it("rejects at-sign based redirects (@evil.com)", () => {
    // @evil.com does not start with / after cleaning, so falls back
    const result = sanitiseRedirectPath("@evil.com");
    expect(result).toBe("/dashboard");
  });

  it("strips backslash double-slash to local path", () => {
    // \\evil.com → after regex replace → /evil.com (local path)
    const result = sanitiseRedirectPath("\\\\evil.com");
    expect(result).toBe("/evil.com");
  });

  it("falls back on empty string", () => {
    expect(sanitiseRedirectPath("")).toBe("/dashboard");
  });

  it("falls back on null-ish values", () => {
    expect(sanitiseRedirectPath(null as unknown as string)).toBe("/dashboard");
    expect(sanitiseRedirectPath(undefined as unknown as string)).toBe(
      "/dashboard",
    );
  });

  it("handles encoded slashes as a local path", () => {
    // /%2F/evil.com is treated as a local path with literal %2F in it
    const result = sanitiseRedirectPath("/%2F/evil.com");
    // The URL parser keeps encoded characters in the path
    expect(result).toContain("/%2F/evil.com");
  });

  it("strips triple-slash to local path", () => {
    // ///evil.com → after regex → /evil.com
    const result = sanitiseRedirectPath("///evil.com");
    expect(result).toBe("/evil.com");
  });

  it("rejects javascript protocol", () => {
    const result = sanitiseRedirectPath("javascript:alert(1)");
    expect(result).toBe("/dashboard");
  });

  it("ensures all sanitised results stay on localhost", () => {
    const dangerousInputs = [
      "//evil.com",
      "https://evil.com/steal",
      "http://evil.com",
      "///evil.com",
      "\\\\evil.com",
    ];
    for (const input of dangerousInputs) {
      const result = sanitiseRedirectPath(input);
      // All results must be local paths starting with /
      expect(result).toMatch(/^\//);
      // Verify via URL parse that they resolve to localhost
      const parsed = new URL(result, "http://localhost");
      expect(parsed.hostname).toBe("localhost");
    }
  });
});

describe("sanitisePath (proxy)", () => {
  it("allows simple internal paths", () => {
    expect(sanitisePath("/dashboard")).toBe("/dashboard");
    expect(sanitisePath("/owner/schemes")).toBe("/owner/schemes");
  });

  it("strips protocol-relative URLs to local paths", () => {
    // //evil.com → /evil.com (a safe local path)
    const result = sanitisePath("//evil.com");
    expect(result).toBe("/evil.com");
  });

  it("returns null for absolute URLs with protocol", () => {
    // These contain "://" so are rejected
    expect(sanitisePath("https://evil.com")).toBeNull();
    expect(sanitisePath("http://evil.com")).toBeNull();
  });

  it("returns null for empty/null input", () => {
    expect(sanitisePath(null)).toBeNull();
    expect(sanitisePath("")).toBeNull();
  });

  it("strips triple-slash to local path", () => {
    const result = sanitisePath("///evil.com");
    expect(result).toBe("/evil.com");
  });

  it("preserves query string on internal paths", () => {
    expect(sanitisePath("/owner?tab=finance")).toBe("/owner?tab=finance");
  });

  it("rejects paths containing :// even in query string", () => {
    // The includes("://") check catches protocol in any position
    expect(sanitisePath("/redirect?url=https://evil.com")).toBeNull();
  });

  it("ensures all sanitised results stay on localhost", () => {
    const inputs = ["/dashboard", "//evil.com", "///test"];
    for (const input of inputs) {
      const result = sanitisePath(input);
      if (result !== null) {
        const parsed = new URL(result, "http://localhost");
        expect(parsed.hostname).toBe("localhost");
      }
    }
  });
});
