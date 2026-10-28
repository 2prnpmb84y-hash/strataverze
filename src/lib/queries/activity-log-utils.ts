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

/**
 * The building's words for a levy and a late charge, in title case
 * (packWordsFor: "Levy", "Levies", "Interest"). The codes are stored as they
 * are; only the label shown names them in the building's words.
 */
export type LabelWords = { Levy: string; Levies: string; LateCharge: string };

/** A label in the building's words: "Levy Notice Issued" becomes "Contribution Notice Issued". */
function inWords(label: string, w?: LabelWords): string {
  if (!w) return label;
  return label.replace(/\b(Levy|Levies|Interest)\b/g, (m) => (m === "Levy" ? w.Levy : m === "Levies" ? w.Levies : w.LateCharge));
}

/** Human-readable label for an action code, in the building's words where given. */
export function formatActionLabel(action: string, words?: LabelWords): string {
  return inWords(
    action
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    words,
  );
}

/** Human-readable label for an entity type code, in the building's words where given. */
export function formatEntityTypeLabel(entityType: string, words?: LabelWords): string {
  // Insert spaces before uppercase letters (CamelCase to Title Case)
  return inWords(entityType.replace(/([a-z])([A-Z])/g, "$1 $2"), words);
}
