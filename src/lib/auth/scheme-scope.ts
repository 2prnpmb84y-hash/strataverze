import { AuthorisationError } from "./require-membership";

/**
 * Record-to-scheme checks (security finding SEC-004).
 *
 * The app reads and writes through a privileged database connection, so RLS
 * does not stop a server action from touching another scheme's record. An
 * action that authorises scheme A must confirm that every record id it was
 * sent belongs to scheme A before reading, updating or deleting it.
 *
 * Prefer scheme-scoped queries: give the query helper the schemeId and put it
 * in the where clause, for example
 *   where((l) => and(l.id.eq(lotId), l.schemeId.eq(schemeId)))
 * so a foreign id simply matches nothing. Use assertInScheme when a record
 * has already been loaded, or when the scheme comes from a parent record.
 */

/** Whether the record exists and belongs to the scheme. */
export function inScheme(
  record: { schemeId: string } | null | undefined,
  schemeId: string,
): boolean {
  return !!record && !!schemeId && record.schemeId === schemeId;
}

/**
 * Throw "<label> not found." unless the record exists and belongs to the
 * scheme. The message is the same whether the record is missing or belongs
 * to another scheme, so ids from other schemes cannot be probed.
 */
export function assertInScheme<T extends { schemeId: string }>(
  record: T | null | undefined,
  schemeId: string,
  label = "Record",
): asserts record is T {
  if (!inScheme(record, schemeId)) throw new AuthorisationError(`${label} not found.`);
}

/** Throw unless a child record belongs to the expected parent. */
export function assertBelongsTo(
  actualParentId: string | null | undefined,
  expectedParentId: string,
  label = "Record",
): void {
  if (!actualParentId || !expectedParentId || actualParentId !== expectedParentId) {
    throw new AuthorisationError(`${label} not found.`);
  }
}

/** Throw unless the value is one of the allowed values (status fields and the like). */
export function assertOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label = "value",
): asserts value is T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new AuthorisationError(`Invalid ${label}.`);
  }
}
