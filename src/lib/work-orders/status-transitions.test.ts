import { describe, expect, it } from "vitest";
import { committeeMayTransition, supplierMayTransition } from "./status-transitions";

describe("supplierMayTransition (F16)", () => {
  it("allows only forward moves on an awarded job", () => {
    expect(supplierMayTransition("AWARDED", "IN_PROGRESS")).toBe(true);
    expect(supplierMayTransition("IN_PROGRESS", "COMPLETED")).toBe(true);
  });

  it("rejects skipping, going backwards and re-opening", () => {
    expect(supplierMayTransition("AWARDED", "COMPLETED")).toBe(false);
    expect(supplierMayTransition("COMPLETED", "IN_PROGRESS")).toBe(false);
    expect(supplierMayTransition("CANCELLED", "IN_PROGRESS")).toBe(false);
    expect(supplierMayTransition("IN_PROGRESS", "AWARDED")).toBe(false);
  });

  it("rejects statuses a supplier never sets", () => {
    expect(supplierMayTransition("IN_PROGRESS", "CANCELLED")).toBe(false);
    expect(supplierMayTransition("OPEN", "IN_PROGRESS")).toBe(false);
    expect(supplierMayTransition("AWARDED", "PAID")).toBe(false);
    expect(supplierMayTransition("AWARDED", undefined)).toBe(false);
    expect(supplierMayTransition("AWARDED", { toString: () => "IN_PROGRESS" })).toBe(false);
  });
});

describe("committeeMayTransition", () => {
  it("allows the owner-portal buttons", () => {
    expect(committeeMayTransition("OPEN", "IN_PROGRESS")).toBe(true);
    expect(committeeMayTransition("OPEN", "COMPLETED")).toBe(true);
    expect(committeeMayTransition("OPEN", "CANCELLED")).toBe(true);
    expect(committeeMayTransition("IN_PROGRESS", "COMPLETED")).toBe(true);
    expect(committeeMayTransition("IN_PROGRESS", "CANCELLED")).toBe(true);
  });

  it("rejects re-opening finished work and unknown statuses", () => {
    expect(committeeMayTransition("COMPLETED", "OPEN")).toBe(false);
    expect(committeeMayTransition("CANCELLED", "IN_PROGRESS")).toBe(false);
    expect(committeeMayTransition("IN_PROGRESS", "OPEN")).toBe(false);
    expect(committeeMayTransition("OPEN", "AWARDED")).toBe(false);
  });
});
