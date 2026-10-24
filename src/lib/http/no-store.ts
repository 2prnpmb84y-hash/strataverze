/**
 * Responses from signed-in routes must never be kept by a browser or a
 * shared cache (security stage S7, finding SEC-028). Next.js otherwise sends
 * `public, max-age=0` on route handler responses.
 */
export const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/** Mark a response as not to be stored, and return it. */
export function noStore<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", NO_STORE["Cache-Control"]);
  return response;
}
