/**
 * Work order status transitions (pure). Security finding F16: the supplier
 * and owner-portal status actions accepted any target status from any current
 * status, so a supplier could re-open a cancelled job or a completed one, and
 * a status could be moved backwards.
 *
 * Statuses: OPEN, QUOTING, AWARDED, IN_PROGRESS, COMPLETED, CANCELLED.
 * Only forward moves are listed; COMPLETED and CANCELLED are final here.
 */

type Transitions = Readonly<Record<string, readonly string[]>>;

/** The awarded supplier: start the job, then finish it. */
export const SUPPLIER_TRANSITIONS: Transitions = {
  AWARDED: ["IN_PROGRESS"],
  IN_PROGRESS: ["COMPLETED"],
};

/** The scheme's committee in the owner portal (matches the status buttons there). */
export const COMMITTEE_TRANSITIONS: Transitions = {
  OPEN: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
};

function allowed(table: Transitions, from: string, to: unknown): boolean {
  return typeof to === "string" && (table[from] ?? []).includes(to);
}

/** Whether the awarded supplier may move the work order from `from` to `to`. */
export function supplierMayTransition(from: string, to: unknown): boolean {
  return allowed(SUPPLIER_TRANSITIONS, from, to);
}

/** Whether a committee member may move the work order from `from` to `to`. */
export function committeeMayTransition(from: string, to: unknown): boolean {
  return allowed(COMMITTEE_TRANSITIONS, from, to);
}
