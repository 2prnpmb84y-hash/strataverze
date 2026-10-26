import { beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { unzipSync } from "fflate";

/**
 * The vault end to end, against the in-memory database with the database's
 * triggers stood in for (numbering, times, the hash chain): capture,
 * duplicate receipts, versions, notes, checks that catch tampering, and an
 * evidence package that the shipped verify.mjs checks on its own.
 */

const storage = vi.hoisted(() => ({ objects: new Map<string, Uint8Array>() }));

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => {
  const { sharedFake } = await import("@/test/fake-orm");
  const { eventHash, GENESIS_HASH } = await import("./chain");
  let clock = Date.parse("2026-10-25T01:00:00.000Z");
  const now = () => new Date((clock += 1000)).toISOString();
  const base = sharedFake.db.orm.public;
  const wrap = (name: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the fake ORM is untyped
    const c = (base as Record<string, any>)[name];
    if (!["Vault", "VaultRecord", "VaultVersion", "VaultReceipt", "VaultEvent", "VaultCheck"].includes(name)) return c;
    return {
      ...c,
      where: (f: unknown) => c.where(f),
      create: async (data: Record<string, unknown>) => {
        const row = { ...data };
        if (name === "Vault") row.openedAt = now();
        if (name === "VaultRecord") row.createdAt = now();
        if (name === "VaultCheck") row.checkedAt = now();
        if (name === "VaultReceipt") {
          row.receivedAt = now();
          row.schemeId = sharedFake.table("VaultVersion").find((v) => v.id === row.versionId)?.schemeId;
        }
        if (name === "VaultVersion") {
          const rec = sharedFake.table("VaultRecord").find((r) => r.id === row.recordId)!;
          const prior = sharedFake.table("VaultVersion").filter((v) => v.recordId === row.recordId).sort((a, b) => Number(b.versionNo) - Number(a.versionNo))[0];
          if (sharedFake.table("VaultVersion").some((v) => v.schemeId === rec.schemeId && v.contentHash === row.contentHash)) throw new Error("unique violation");
          Object.assign(row, { schemeId: rec.schemeId, versionNo: prior ? Number(prior.versionNo) + 1 : 1, previousVersionId: prior?.id ?? null, capturedAt: now() });
        }
        if (name === "VaultEvent") {
          const last = sharedFake.table("VaultEvent").filter((e) => e.schemeId === row.schemeId).sort((a, b) => Number(b.seq) - Number(a.seq))[0];
          Object.assign(row, { seq: last ? Number(last.seq) + 1 : 1, occurredAt: now(), prevHash: last ? last.rowHash : GENESIS_HASH });
          for (const k of ["recordId", "versionId", "contentHash", "actorProfileId"]) row[k] = row[k] ?? null;
          row.rowHash = eventHash(row as never);
        }
        return c.create(row);
      },
    };
  };
  const orm = { public: new Proxy({}, { get: (_t, name: string) => wrap(name) }) };
  return { db: { orm, transaction: async <T,>(fn: (tx: { orm: typeof orm }) => Promise<T>) => fn({ orm }) } };
});
vi.mock("@/lib/storage/server-storage", () => ({
  downloadObject: async (path: string) => storage.objects.get(path) ?? null,
  writeObjectOnce: async (path: string, bytes: Uint8Array) => {
    if (storage.objects.has(path)) return "exists";
    storage.objects.set(path, bytes);
    return "written";
  },
  signDownload: async (path: string) => `https://storage.test/${path}`,
}));
vi.mock("@/lib/audit/security-audit", () => ({ recordSecurityEvent: vi.fn(async () => {}), recordSecurityEventLater: vi.fn(async () => {}) }));

const { sharedFake } = await import("@/test/fake-orm");
const { annotateRecord, captureFile, openVault } = await import("./capture");
const { runVaultCheck } = await import("./check");
const { buildEvidencePackage } = await import("./export");
const { vaultRecordDetail, vaultTimeline } = await import("./queries");

const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.4 ${text}`);

beforeEach(() => {
  storage.objects.clear();
  sharedFake.reset({
    Scheme: [
      { id: S1, name: "Opera House", planNumber: "SP 99999", timeZone: "Australia/Perth" },
      { id: S2, name: "Other building", planNumber: "SP 1", timeZone: "Australia/Sydney" },
    ],
    Vault: [], VaultRecord: [], VaultVersion: [], VaultReceipt: [], VaultEvent: [], VaultCheck: [], SecurityAuditEvent: [],
  });
});

async function captureRoof() {
  return captureFile({
    schemeId: S1, actorId: "adviser", bytes: pdf("roof report"), fileName: "Roof report.pdf", mimeType: "application/pdf",
    source: "UPLOAD", sourceRef: "Document:d1", record: { recordType: "REPORT", title: "Roof report", reportedDate: "2019-03-12", reportedBy: "the person who added it to the library" },
  });
}

describe("capturing into a vault", () => {
  it("refuses until the vault is opened", async () => {
    await expect(captureRoof()).rejects.toThrow("vault has not been opened");
  });

  it("keeps the original under its fingerprint and chains the events", async () => {
    await openVault(S1, "adviser");
    const r = await captureRoof();
    expect(r.kind).toBe("new_record");
    const [v] = sharedFake.table("VaultVersion");
    expect(v).toMatchObject({ versionNo: 1, schemeId: S1, storagePath: `schemes/${S1}/vault/originals/${v.contentHash}.pdf` });
    expect(storage.objects.get(String(v.storagePath))).toEqual(pdf("roof report"));
    expect(sharedFake.table("VaultEvent").map((e) => e.eventType)).toEqual(["vault.opened", "record.captured"]);
  });

  it("filters the timeline by days in the building's time zone", async () => {
    await openVault(S1, "adviser");
    await captureRoof();
    // 5 pm UTC on 25 Oct is 1 am on 26 Oct in Perth (S1's zone).
    for (const e of sharedFake.table("VaultEvent")) e.occurredAt = "2026-10-25T17:00:00.000Z";
    expect((await vaultTimeline(S1, { from: "2026-10-26", to: "2026-10-26" })).length).toBe(2);
    expect(await vaultTimeline(S1, { to: "2026-10-25" })).toEqual([]);
  });

  it("records the same file twice as one version with two receipts", async () => {
    await openVault(S1, "adviser");
    await captureRoof();
    const again = await captureFile({ schemeId: S1, actorId: "adviser", bytes: pdf("roof report"), fileName: "Roof report (copy).pdf", mimeType: "application/pdf", source: "UPLOAD", sourceRef: "Document:d2", record: { recordType: "REPORT", title: "Copy" } });
    expect(again.kind).toBe("duplicate");
    expect(sharedFake.table("VaultRecord")).toHaveLength(1);
    expect(sharedFake.table("VaultReceipt").map((x) => x.originalFileName)).toEqual(["Roof report.pdf", "Roof report (copy).pdf"]);
    // A source is captured once.
    expect((await captureRoof()).kind).toBe("already_captured");
  });

  it("numbers a new version and links it to the one before", async () => {
    await openVault(S1, "adviser");
    const r = await captureRoof();
    const v2 = await captureFile({ schemeId: S1, actorId: "adviser", bytes: pdf("roof report, revised"), fileName: "Roof report v2.pdf", mimeType: "application/pdf", source: "UPLOAD", recordId: r.recordId });
    expect(v2.kind).toBe("new_version");
    const versions = sharedFake.table("VaultVersion");
    expect(versions[1]).toMatchObject({ versionNo: 2, previousVersionId: versions[0].id });
  });

  it("will not add a version to another building's record", async () => {
    await openVault(S1, "adviser");
    await openVault(S2, "adviser");
    const r = await captureRoof();
    await expect(captureFile({ schemeId: S2, actorId: "adviser", bytes: pdf("x"), fileName: "x.pdf", mimeType: "application/pdf", source: "UPLOAD", recordId: r.recordId })).rejects.toThrow("Record not found");
    expect(await vaultRecordDetail(S2, r.recordId)).toBeNull();
  });

  it("adds notes and corrections to the history without changing the record", async () => {
    await openVault(S1, "adviser");
    const r = await captureRoof();
    await annotateRecord({ schemeId: S1, recordId: r.recordId, actorId: "adviser", kind: "correction", text: "The report is dated 2020, not 2019." });
    const d = await vaultRecordDetail(S1, r.recordId);
    expect(d!.reportedDate).toBe("2019-03-12");
    expect(d!.history.map((h) => h.eventType)).toEqual(["record.captured", "record.corrected"]);
  });
});

describe("checking a vault", () => {
  it("passes when nothing has changed, and catches a replaced file and an edited event", async () => {
    await openVault(S1, "adviser");
    await captureRoof();
    expect((await runVaultCheck(S1, "adviser")).ok).toBe(true);

    const [v] = sharedFake.table("VaultVersion");
    storage.objects.set(String(v.storagePath), pdf("roof report, quietly replaced"));
    const replaced = await runVaultCheck(S1, "adviser");
    expect(replaced.ok).toBe(false);
    expect(replaced.failedVersionIds).toEqual([v.id]);

    storage.objects.set(String(v.storagePath), pdf("roof report"));
    sharedFake.table("VaultEvent")[1].details = '{"title":"Something else"}';
    const edited = await runVaultCheck(S1, "adviser");
    expect(edited.problems).toContain("Event 2 has been changed since it was recorded.");
  });

  it("catches events removed from the end since the last check", async () => {
    await openVault(S1, "adviser");
    await captureRoof();
    await runVaultCheck(S1, "adviser");
    sharedFake.tables.VaultEvent = sharedFake.table("VaultEvent").filter((e) => Number(e.seq) !== 2);
    expect((await runVaultCheck(S1, "adviser")).problems.join(" ")).toContain("Event 2, the last one seen by the previous check, is missing.");
  });
});

describe("checks that cannot be fooled", () => {
  it("still names every failed file when many fail at once", async () => {
    await openVault(S1, "adviser");
    const ids: string[] = [];
    for (let i = 0; i < 60; i++) {
      const r = await captureFile({ schemeId: S1, actorId: "adviser", bytes: pdf(`report ${i}`), fileName: `A very long file name for report number ${i} of the building.pdf`, mimeType: "application/pdf", source: "UPLOAD", sourceRef: `Document:d${i}`, record: { recordType: "REPORT", title: `Report ${i}` } });
      ids.push(r.recordId);
    }
    for (const v of sharedFake.table("VaultVersion")) storage.objects.set(String(v.storagePath), pdf("restored from the wrong backup"));
    const result = await runVaultCheck(S1, "adviser");
    expect(result.failedVersionIds).toHaveLength(60);
    const last = await vaultRecordDetail(S1, ids[59]);
    expect(last!.versions[0].labels[0]).toMatchObject({ tone: "bad", text: "Check failed" });
  });

  it("finds a version whose recorded fingerprint and file were both swapped", async () => {
    await openVault(S1, "adviser");
    await captureRoof();
    const [v] = sharedFake.table("VaultVersion");
    const { sha256Hex } = await import("./chain");
    const swapped = pdf("a forged report");
    v.contentHash = sha256Hex(swapped);
    storage.objects.set(String(v.storagePath), swapped);
    const result = await runVaultCheck(S1, "adviser");
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("No event in the chain records the capture");
  });
});

describe("the evidence package", () => {
  it("does not disclose earlier exports or other records' security events", async () => {
    await openVault(S1, "adviser");
    const roof = await captureRoof();
    const other = await captureFile({ schemeId: S1, actorId: "adviser", bytes: pdf("private legal advice"), fileName: "Advice.pdf", mimeType: "application/pdf", source: "UPLOAD", sourceRef: "Document:d9", record: { recordType: "CORRESPONDENCE", title: "Legal advice" } });
    await buildEvidencePackage({ schemeId: S1, actorId: "adviser", actorName: "A", recordIds: [other.recordId], reason: "Confidential dispute with lot 7" });
    sharedFake.table("SecurityAuditEvent").push(
      { id: "a1", seq: 1, occurredAt: "2026-10-25T05:00:00.000Z", schemeId: S1, action: "vault.check_failed", outcome: "failed", resourceType: "Vault", resourceId: null, reason: "Advice.pdf changed" },
      { id: "a2", seq: 2, occurredAt: "2026-10-25T05:00:01.000Z", schemeId: S1, action: "vault.download", outcome: "allowed", resourceType: "VaultVersion", resourceId: sharedFake.table("VaultVersion").find((v) => v.recordId === roof.recordId)!.id },
    );
    const pkg = await buildEvidencePackage({ schemeId: S1, actorId: "adviser", actorName: "A", recordIds: [roof.recordId], reason: "Roof" });
    const files = unzipSync(pkg.zip);
    const text = Object.values(files).map((b) => new TextDecoder().decode(b)).join("\n");
    expect(text).not.toContain("Confidential dispute");
    expect(text).not.toContain("Advice.pdf");
    expect(new TextDecoder().decode(files["audit.csv"])).toContain("vault.download");
  });

  async function exportAndUnzip(recordIds: string[] | "all") {
    const pkg = await buildEvidencePackage({ schemeId: S1, actorId: "adviser", actorName: "Ada Adviser", recordIds, reason: "Tribunal application" });
    const dir = mkdtempSync(join(tmpdir(), "vault-pkg-"));
    for (const [name, bytes] of Object.entries(unzipSync(pkg.zip))) {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), bytes);
    }
    return { dir, pkg };
  }
  const verify = (dir: string) => {
    try {
      return { code: 0, out: execFileSync(process.execPath, ["verify.mjs"], { cwd: dir, encoding: "utf8" }) };
    } catch (err) {
      const e = err as { status: number; stdout: string };
      return { code: e.status, out: e.stdout };
    }
  };

  it("checks out with the shipped script, and fails when anything in it is changed", async () => {
    await openVault(S1, "adviser");
    const roof = await captureRoof();
    await captureFile({ schemeId: S1, actorId: "adviser", bytes: pdf("roof report, revised"), fileName: "Roof report v2.pdf", mimeType: "application/pdf", source: "UPLOAD", recordId: roof.recordId });
    const other = await captureFile({ schemeId: S1, actorId: "adviser", bytes: pdf("private legal advice"), fileName: "Advice.pdf", mimeType: "application/pdf", source: "UPLOAD", sourceRef: "Document:d9", record: { recordType: "CORRESPONDENCE", title: "Legal advice" } });

    const { dir, pkg } = await exportAndUnzip([roof.recordId]);
    const ok = verify(dir);
    expect(ok.code).toBe(0);
    expect(ok.out).toContain("Everything checks out.");
    expect(ok.out).toContain("Files checked: 2");

    // The record not chosen is not in it, and its event is a link only.
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    expect(manifest.files.map((f: { recordId: string }) => f.recordId)).toEqual([roof.recordId, roof.recordId]);
    expect(JSON.stringify(manifest)).not.toContain("Legal advice");
    expect(manifest.events.find((e: { seq: number }) => e.seq === 4)).toEqual(expect.objectContaining({ redacted: true }));
    expect(other.kind).toBe("new_record");
    expect(readFileSync(join(dir, "VERIFY.md"), "utf8")).toContain("What it does not show");
    // Times are given in the building's own time zone, and say which.
    expect(readFileSync(join(dir, "VERIFY.md"), "utf8")).toContain("(Australia/Perth time, the building's time zone)");
    expect(readFileSync(join(dir, "timeline.csv"), "utf8").split("\r\n")[0]).toContain("Building time (Australia/Perth)");
    // The export is itself in the ledger, with the manifest's fingerprint.
    const exported = sharedFake.table("VaultEvent").at(-1)!;
    expect(exported.eventType).toBe("export.created");
    expect(JSON.parse(String(exported.details))).toMatchObject({ manifestSha256: pkg.manifestSha256, reason: "Tribunal application" });

    // Change one byte of an original.
    const file = join(dir, manifest.files[0].path);
    writeFileSync(file, Buffer.concat([readFileSync(file), Buffer.from(" ")]));
    const bad = verify(dir);
    expect(bad.code).toBe(1);
    expect(bad.out).toContain("File changed");
  });

  it("fails the script when an event in the manifest is edited", async () => {
    await openVault(S1, "adviser");
    await captureRoof();
    const { dir } = await exportAndUnzip("all");
    const path = join(dir, "manifest.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifest.events[1].details = manifest.events[1].details.replace("Roof report", "Gutter report");
    writeFileSync(path, JSON.stringify(manifest));
    const bad = verify(dir);
    expect(bad.code).toBe(1);
    expect(bad.out).toContain("Event 2 has been changed since it was recorded.");
  });

  it("refuses to export a file that no longer matches its fingerprint", async () => {
    await openVault(S1, "adviser");
    await captureRoof();
    const [v] = sharedFake.table("VaultVersion");
    storage.objects.set(String(v.storagePath), pdf("swapped"));
    await expect(buildEvidencePackage({ schemeId: S1, actorId: "adviser", actorName: "A", recordIds: "all", reason: "x" })).rejects.toThrow("no longer matches its fingerprint");
  });

  it("needs a reason, and only this building's records", async () => {
    await openVault(S1, "adviser");
    await openVault(S2, "adviser");
    const r = await captureRoof();
    await expect(buildEvidencePackage({ schemeId: S1, actorId: "a", actorName: "A", recordIds: "all", reason: " " })).rejects.toThrow("Say why");
    await expect(buildEvidencePackage({ schemeId: S2, actorId: "a", actorName: "A", recordIds: [r.recordId], reason: "x" })).rejects.toThrow("Choose at least one record");
  });
});
