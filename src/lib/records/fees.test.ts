import { describe, expect, it } from "vitest";
import { RECORDS_INSPECTION, SALE_CERTIFICATE } from "@/config/statutory";
import { certificateFee, inspectionDeadlines, inspectionFee } from "./fees";

describe("information certificate fee", () => {
  it("is the full fee, or the repeat fee within 3 months of an earlier certificate for the lot", () => {
    expect(certificateFee("2026-10-26", [], SALE_CERTIFICATE)).toEqual({ cents: 10_900, repeat: false });
    expect(certificateFee("2026-10-26", ["2026-08-01"], SALE_CERTIFICATE)).toEqual({ cents: 9_400, repeat: true });
    expect(certificateFee("2026-10-26", ["2026-07-26"], SALE_CERTIFICATE).repeat).toBe(true);
    expect(certificateFee("2026-10-26", ["2026-07-25"], SALE_CERTIFICATE).repeat).toBe(false);
  });
});

describe("records inspection", () => {
  it("charges the first hour, then each further half hour or part of one", () => {
    expect(inspectionFee("OWNER", 60, RECORDS_INSPECTION)).toBe(3_100);
    expect(inspectionFee("OWNER", 61, RECORDS_INSPECTION)).toBe(4_700);
    expect(inspectionFee("OWNER", 120, RECORDS_INSPECTION)).toBe(6_300);
    expect(inspectionFee("AUTHORISED_PERSON", 45, RECORDS_INSPECTION)).toBe(6_000);
    expect(inspectionFee("AUTHORISED_PERSON", 95, RECORDS_INSPECTION)).toBe(12_000);
  });

  it("gives 3 days to agree a time and 10 days for the owners corporation to set one", () => {
    expect(inspectionDeadlines("2026-10-26", RECORDS_INSPECTION)).toEqual({ agreeBy: "2026-10-29", setBy: "2026-11-05" });
  });
});
