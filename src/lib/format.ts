/**
 * Prefix a lot number with "Lot " only when the value does not
 * already start with "Lot" (case-insensitive).  Prevents the
 * "Lot Lot 1" duplication that occurs when the stored value
 * already carries the prefix.
 */
export function formatLotLabel(lotNumber: string | number): string {
  const s = String(lotNumber);
  return /^lot\s/i.test(s) ? s : `Lot ${s}`;
}
