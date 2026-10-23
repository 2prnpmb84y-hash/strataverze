import { AuthorisationError } from "./errors";
import { recordSecurityEventLater } from "@/lib/audit/security-audit";

/**
 * Record a refused record lookup (S6). These helpers are synchronous, so the
 * write is started and left to finish; it never throws. The request's
 * signed-in person is filled in by the audit helper.
 */
function recordRefusal(label: string, schemeId: string | null, reason: string) {
  void recordSecurityEventLater({
    action: "access.denied",
    outcome: "denied",
    schemeId,
    resourceType: label,
    reason,
  });
}

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
  if (!inScheme(record, schemeId)) {
    recordRefusal(label, schemeId, record ? "record belongs to another building" : "record not found");
    throw new AuthorisationError(`${label} not found.`);
  }
}

/** Throw unless a child record belongs to the expected parent. */
export function assertBelongsTo(
  actualParentId: string | null | undefined,
  expectedParentId: string,
  label = "Record",
): void {
  if (!actualParentId || !expectedParentId || actualParentId !== expectedParentId) {
    recordRefusal(label, null, "record does not belong to the expected parent");
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
