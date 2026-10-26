/**
 * Work order status transitions (pure). Security finding F16: the owner-portal
 * status action accepted any target status from any current status, so a
 * status could be moved backwards. (The old supplier status action that
 * F16 also covered was removed on 26 Oct 2026: suppliers now work on works
 * work orders, src/lib/works.)
 *
 * Statuses: OPEN, QUOTING, AWARDED, IN_PROGRESS, COMPLETED, CANCELLED.
 * Only forward moves are listed; COMPLETED and CANCELLED are final here.
 */

type Transitions = Readonly<Record<string, readonly string[]>>;

/** The scheme's committee in the owner portal (matches the status buttons there). */
export const COMMITTEE_TRANSITIONS: Transitions = {
  OPEN: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
};

function allowed(table: Transitions, from: string, to: unknown): boolean {
  return typeof to === "string" && (table[from] ?? []).includes(to);
}

/** Whether a committee member may move the work order from `from` to `to`. */
export function committeeMayTransition(from: string, to: unknown): boolean {
  return allowed(COMMITTEE_TRANSITIONS, from, to);
}
