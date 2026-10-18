/**
 * Pure utility functions and types for audit trail display.
 * Safe to import from client components (no server-side dependencies).
 */

export type AuditTrailFilters = {
  startDate?: string; // ISO date string e.g. "2025-07-01"
  endDate?: string;
  entityType?: string;
  action?: string;
  actorId?: string;
};

/** Human-readable label for an action code. */
export function formatActionLabel(action: string): string {
  return action
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Human-readable label for an entity type code. */
export function formatEntityTypeLabel(entityType: string): string {
  // Insert spaces before uppercase letters (CamelCase to Title Case)
  return entityType.replace(/([a-z])([A-Z])/g, "$1 $2");
}
