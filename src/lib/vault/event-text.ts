/** What each vault ledger event means, in plain words (pure, safe in the browser). */

export const EVENT_TEXT: Record<string, string> = {
  "vault.opened": "Vault opened",
  "record.captured": "Captured",
  "version.added": "New version added",
  "receipt.duplicate": "Received again (the same file, kept once)",
  "record.annotated": "Note added",
  "record.corrected": "Correction added",
  "library.metadata_changed": "Library details changed (the original is unchanged)",
  "library.removed": "Removed from the library (the original stays in the vault)",
  "library.new_file": "New file added in the library",
  "export.created": "Evidence package exported",
};
export function describeEvent(eventType: string): string {
  return EVENT_TEXT[eventType] ?? eventType;
}

