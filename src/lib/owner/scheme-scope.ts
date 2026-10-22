/**
 * Owner portal scheme scope (pure, no I/O).
 *
 * Owner pages show the scheme the owner picked, so the content always matches
 * the persistent scheme header. With nothing picked, pages keep showing every
 * scheme the owner belongs to.
 */
export function scopeToSelectedScheme<T extends { id: string }>(
  schemes: T[],
  selectedSchemeId: string | null | undefined,
): T[] {
  if (!selectedSchemeId) return schemes;
  return schemes.filter((s) => s.id === selectedSchemeId);
}

/** The same rule for a list of scheme IDs. */
export function scopeSchemeIds(
  schemeIds: string[],
  selectedSchemeId: string | null | undefined,
): string[] {
  if (!selectedSchemeId) return schemeIds;
  return schemeIds.filter((id) => id === selectedSchemeId);
}
