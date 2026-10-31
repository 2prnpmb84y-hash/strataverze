import { describe, expect, it } from "vitest";
import { fetchWithTimeout } from "./admin";

/**
 * The admin client's request timeout (S2a, second review M-2). No network:
 * the fetch underneath is a stand-in that never answers, unless aborted.
 */

/** A fetch that answers only by rejecting when its signal aborts. */
const hanging: typeof fetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
  });

describe("fetchWithTimeout", () => {
  it("gives up after the time given", async () => {
    const started = Date.now();
    await expect(fetchWithTimeout(50, hanging)("https://auth.example.test/admin/users/x")).rejects.toMatchObject({ name: "TimeoutError" });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("still honours the caller's own signal", async () => {
    const caller = new AbortController();
    const pending = fetchWithTimeout(10_000, hanging)("https://auth.example.test/admin/users/x", { signal: caller.signal });
    caller.abort(new Error("stopped by caller"));
    await expect(pending).rejects.toThrow("stopped by caller");
  });

  it("passes the request through unchanged otherwise", async () => {
    let seen: RequestInit | undefined;
    const ok: typeof fetch = async (_input, init) => {
      seen = init;
      return new Response("{}", { status: 200 });
    };
    const res = await fetchWithTimeout(1_000, ok)("https://auth.example.test/x", { method: "PUT", body: "{}" });
    expect(res.status).toBe(200);
    expect(seen).toMatchObject({ method: "PUT", body: "{}" });
    expect(seen?.signal).toBeInstanceOf(AbortSignal);
  });
});
