import { describe, it, expect } from "vitest";
import { formatAuditTrailCsv } from "./activity-log";
import type { AuditTrailRow } from "./activity-log";

describe("formatAuditTrailCsv", () => {
  it("produces a header row when given empty array", () => {
    const result = formatAuditTrailCsv([], "Australia/Sydney");
    expect(result).toBe(
      "Date/Time,User,Email,Action,Entity Type,Entity ID,Details",
    );
  });

  it("formats a single row with all fields", () => {
    const rows: AuditTrailRow[] = [
      {
        id: "1",
        action: "CREATED",
        entityType: "Scheme",
        entityId: "sch-001",
        createdAt: "2024-06-15T10:30:00.000Z",
        metadata: null,
        actorName: "Alice Smith",
        actorEmail: "alice@example.com",
      },
    ];

    const result = formatAuditTrailCsv(rows, "Australia/Sydney");
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      "Date/Time,User,Email,Action,Entity Type,Entity ID,Details",
    );
    // Data row should contain the formatted values
    expect(lines[1]).toContain("Alice Smith");
    expect(lines[1]).toContain("alice@example.com");
    expect(lines[1]).toContain("Created");
    expect(lines[1]).toContain("Scheme");
    expect(lines[1]).toContain("sch-001");
  });

  it("escapes values containing commas", () => {
    const rows: AuditTrailRow[] = [
      {
        id: "1",
        action: "UPDATED",
        entityType: "Scheme",
        entityId: "sch-001",
        createdAt: "2024-06-15T10:30:00.000Z",
        metadata: null,
        actorName: "Smith, Alice",
        actorEmail: "alice@example.com",
      },
    ];

    const result = formatAuditTrailCsv(rows, "Australia/Sydney");
    // Name with comma should be double-quoted
    expect(result).toContain('"Smith, Alice"');
  });

  it("escapes values containing double quotes", () => {
    const rows: AuditTrailRow[] = [
      {
        id: "1",
        action: "UPDATED",
        entityType: "Scheme",
        entityId: null,
        createdAt: "2024-06-15T10:30:00.000Z",
        metadata: { note: 'Changed "status"' },
        actorName: "Bob",
        actorEmail: "bob@example.com",
      },
    ];

    const result = formatAuditTrailCsv(rows, "Australia/Sydney");
    // Double quotes inside value should be escaped as ""
    expect(result).toContain('""status""');
  });

  it("formats metadata as key: value pairs separated by semicolons", () => {
    const rows: AuditTrailRow[] = [
      {
        id: "1",
        action: "UPDATED",
        entityType: "Lot",
        entityId: "lot-001",
        createdAt: "2024-06-15T10:30:00.000Z",
        metadata: { field: "entitlement", oldValue: "100", newValue: "150" },
        actorName: "Charlie",
        actorEmail: "charlie@example.com",
      },
    ];

    const result = formatAuditTrailCsv(rows, "Australia/Sydney");
    expect(result).toContain("field: entitlement");
    expect(result).toContain("oldValue: 100");
  });

  it("handles null entityId", () => {
    const rows: AuditTrailRow[] = [
      {
        id: "1",
        action: "LOGGED_IN",
        entityType: "Session",
        entityId: null,
        createdAt: "2024-06-15T10:30:00.000Z",
        metadata: null,
        actorName: "Dave",
        actorEmail: "dave@example.com",
      },
    ];

    const result = formatAuditTrailCsv(rows, "Australia/Sydney");
    const lines = result.split("\n");
    // Should not throw and should produce a valid row
    expect(lines).toHaveLength(2);
  });

  it("handles multiple rows", () => {
    const rows: AuditTrailRow[] = [
      {
        id: "1",
        action: "CREATED",
        entityType: "Lot",
        entityId: "lot-001",
        createdAt: "2024-06-15T10:00:00.000Z",
        metadata: null,
        actorName: "Alice",
        actorEmail: "alice@example.com",
      },
      {
        id: "2",
        action: "UPDATED",
        entityType: "Lot",
        entityId: "lot-001",
        createdAt: "2024-06-15T11:00:00.000Z",
        metadata: null,
        actorName: "Bob",
        actorEmail: "bob@example.com",
      },
    ];

    const result = formatAuditTrailCsv(rows, "Australia/Sydney");
    const lines = result.split("\n");
    expect(lines).toHaveLength(3); // header + 2 data rows
  });
});
