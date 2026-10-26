import { describe, expect, it } from "vitest";
import { auDateTime, auDay, vaultLabels } from "./labels";

const base = { source: "UPLOAD", reportedDate: null, reportedBy: null, versionId: "v1", capturedAt: "2026-10-25T01:00:00.000Z" };

describe("vault labels", () => {
  it("never says just 'verified', and says when it has not been checked", () => {
    const [l] = vaultLabels({ ...base, lastCheck: null });
    expect(l).toMatchObject({ tone: "neutral", text: "Fingerprint recorded, not yet checked" });
    expect(l.text.toLowerCase()).not.toContain("verified");
  });

  it("says unchanged only when a check ran after the capture", () => {
    const after = vaultLabels({ ...base, lastCheck: { ok: true, checkedAt: "2026-10-25T02:00:00.000Z", failedVersionIds: new Set() } });
    expect(after[0]).toMatchObject({ tone: "good", text: "Unchanged since captured 25/10/2026" });
    const before = vaultLabels({ ...base, lastCheck: { ok: true, checkedAt: "2026-10-25T00:00:00.000Z", failedVersionIds: new Set() } });
    expect(before[0].tone).toBe("neutral");
  });

  it("names the failure for the version that failed only", () => {
    const failed = { ok: false, checkedAt: "2026-10-25T02:00:00.000Z", failedVersionIds: new Set(["v1"]) };
    expect(vaultLabels({ ...base, lastCheck: failed })[0]).toMatchObject({ tone: "bad", text: "Check failed" });
    expect(vaultLabels({ ...base, versionId: "v2", lastCheck: failed })[0].tone).toBe("good");
  });

  it("marks a document's own date as reported, not checked", () => {
    const labels = vaultLabels({ ...base, reportedDate: "2019-03-12", reportedBy: "Urbanise", lastCheck: null });
    expect(labels[1]).toMatchObject({ tone: "warning", text: "Dated 12/03/2019, as reported" });
    expect(labels[1].detail).toContain("not been checked independently");
  });

  it("says when StrataVerze issued it", () => {
    expect(vaultLabels({ ...base, source: "STRATAVERZE", lastCheck: null }).map((l) => l.text)).toContain("Issued by StrataVerze");
  });

  it("shows dates in the building's time zone, Sydney by default", () => {
    // 15:30 UTC on 25 Oct 2026 is 2:30 am on 26 Oct in Sydney (+11) but 11:30 pm on 25 Oct in Perth (+8).
    const at = "2026-10-25T15:30:00.000Z";
    expect(auDateTime(at)).toBe(auDateTime(at, "Australia/Sydney"));
    expect(auDateTime(at)).toMatch(/^26\/10\/2026 2:30\sam$/i);
    expect(auDateTime(at, "Australia/Perth")).toMatch(/^25\/10\/2026 11:30\spm$/i);
    expect(auDay(at)).toBe("26/10/2026");
    expect(auDay(at, "Australia/Perth")).toBe("25/10/2026");

    const check = { ok: true, checkedAt: "2026-10-25T16:00:00.000Z", failedVersionIds: new Set<string>() };
    const sydney = vaultLabels({ ...base, capturedAt: at, lastCheck: check });
    const perth = vaultLabels({ ...base, capturedAt: at, lastCheck: check, timeZone: "Australia/Perth" });
    expect(sydney[0].text).toBe("Unchanged since captured 26/10/2026");
    expect(perth[0].text).toBe("Unchanged since captured 25/10/2026");
    expect(perth[0].detail).toContain(auDateTime(at, "Australia/Perth"));
    expect(perth[0].detail).toContain(auDateTime(check.checkedAt, "Australia/Perth"));
  });
});
