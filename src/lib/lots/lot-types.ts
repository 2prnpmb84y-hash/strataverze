/**
 * The lot types a lot can have (pure, and safe to import in a client
 * component). The lot form and the CSV lot import both use this list.
 */
export const LOT_TYPE_OPTIONS = [
  { value: "RESIDENTIAL", label: "Residential" },
  { value: "COMMERCIAL", label: "Commercial" },
  { value: "PARKING", label: "Parking" },
  { value: "STORAGE", label: "Storage" },
  { value: "COMMON", label: "Common Property" },
] as const;

export type LotType = (typeof LOT_TYPE_OPTIONS)[number]["value"];

export const LOT_TYPES: readonly string[] = LOT_TYPE_OPTIONS.map((t) => t.value);
