import { and } from "@prisma/orm-postgres/orm-client";
import { strToU8, zipSync } from "fflate";
import { db } from "@/prisma/db";
import { downloadObject } from "@/lib/storage/server-storage";
import { appendVaultEvent, VaultError } from "./capture";
import { sha256Hex } from "./chain";
import { loadChain } from "./check";
import { auDateTime } from "./labels";
import { describeEvent } from "./event-text";
import { safeParse } from "./queries";
import { VERIFY_SCRIPT } from "./verify-script";

/**
 * The evidence package (server side): a zip a reader can check without
 * StrataVerze. Callers must authorise first (and require a recent
 * authenticator check). The export itself is written to the ledger.
 */

const iso = (v: unknown) => new Date(String(v)).toISOString();
const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
const extOf = (path: string) => /\.([a-z0-9]{1,8})$/i.exec(path)?.[1] ?? "bin";

export const MANIFEST_FORMAT = "strataverze-vault-evidence/1";

export async function buildEvidencePackage(input: {
  schemeId: string;
  actorId: string;
  actorName: string;
  recordIds: string[] | "all";
  reason: string;
}): Promise<{ fileName: string; zip: Uint8Array; manifestSha256: string; exportSeq: number }> {
  const reason = input.reason.trim().slice(0, 500);
  if (!reason) throw new VaultError("Say why the package is needed. It is recorded with the export.");
  const scheme = await db.orm.public.Scheme.where((s) => s.id.eq(input.schemeId)).first();
  if (!scheme) throw new VaultError("Building not found.");

  const allRecords = await db.orm.public.VaultRecord.where((r) => r.schemeId.eq(input.schemeId)).all();
  const records = input.recordIds === "all" ? allRecords : allRecords.filter((r) => (input.recordIds as string[]).includes(r.id));
  if (records.length === 0) throw new VaultError("Choose at least one record.");
  if (input.recordIds !== "all" && records.length !== new Set(input.recordIds).size) throw new VaultError("A chosen record is not in this building's vault.");
  const selected = new Set(records.map((r) => r.id));

  const [versions, receipts, chain, security] = await Promise.all([
    db.orm.public.VaultVersion.where((v) => v.schemeId.eq(input.schemeId)).all(),
    db.orm.public.VaultReceipt.where((r) => r.schemeId.eq(input.schemeId)).all(),
    loadChain(input.schemeId),
    db.orm.public.SecurityAuditEvent.where((e) => and(e.schemeId.eq(input.schemeId), e.resourceType.in(["VaultRecord", "VaultVersion", "VaultSource", "Vault"]))).all(),
  ]);
  const chosenVersions = versions.filter((v) => selected.has(v.recordId)).sort((a, b) => (a.recordId === b.recordId ? a.versionNo - b.versionNo : a.recordId.localeCompare(b.recordId)));

  const files: Record<string, Uint8Array> = {};
  const manifestFiles = [];
  for (const v of chosenVersions) {
    const bytes = await downloadObject(v.storagePath);
    if (!bytes) throw new VaultError(`The stored file for "${v.fileName}" could not be read. Run a check from the vault page.`);
    const actual = sha256Hex(bytes);
    if (actual !== v.contentHash) throw new VaultError(`The stored file for "${v.fileName}" no longer matches its fingerprint. Run a check from the vault page; nothing was exported.`);
    const path = `originals/${v.contentHash}.${extOf(v.storagePath)}`;
    files[path] = bytes;
    const rec = records.find((r) => r.id === v.recordId)!;
    manifestFiles.push({ path, sha256: v.contentHash, size: bytes.byteLength, recordId: v.recordId, versionId: v.id, versionNo: v.versionNo, title: rec.title, fileName: v.fileName, capturedAt: iso(v.capturedAt) });
  }

  // Events for the chosen records and for the vault itself in full; the rest
  // linked only (their details may concern records not in this package).
  const events = chain.map((e) =>
    e.recordId === null || selected.has(e.recordId)
      ? { ...e, redacted: false }
      : { seq: e.seq, prevHash: e.prevHash, rowHash: e.rowHash, redacted: true },
  );

  for (const r of records) {
    const recVersions = versions.filter((v) => v.recordId === r.id).sort((a, b) => a.versionNo - b.versionNo);
    files[`records/${r.id}.json`] = strToU8(JSON.stringify({
      id: r.id,
      title: r.title,
      recordType: r.recordType,
      source: r.source,
      sourceRef: r.sourceRef ?? null,
      reportedDate: r.reportedDate ? String(r.reportedDate).slice(0, 10) : null,
      reportedBy: r.reportedBy ?? null,
      reportedDateNote: r.reportedDate ? "As reported. Not checked independently." : undefined,
      createdAt: iso(r.createdAt),
      versions: recVersions.map((v) => ({
        id: v.id, versionNo: v.versionNo, previousVersionId: v.previousVersionId ?? null, sha256: v.contentHash, size: Number(v.sizeBytes),
        mimeType: v.mimeType, fileName: v.fileName, capturedAt: iso(v.capturedAt), capturedBy: v.capturedBy ?? null,
        receipts: receipts.filter((x) => x.versionId === v.id).map((x) => ({ source: x.source, sourceRef: x.sourceRef ?? null, originalFileName: x.originalFileName, receivedAt: iso(x.receivedAt), receivedBy: x.receivedBy ?? null })),
      })),
      history: chain.filter((e) => e.recordId === r.id).map((e) => ({ seq: e.seq, occurredAt: e.occurredAt, eventType: e.eventType, details: safeParse(e.details) })),
    }, null, 2));
  }

  const titleOf = new Map(records.map((r) => [r.id, r.title]));
  files["timeline.csv"] = strToU8(csv([
    ["Event", "StrataVerze time (UTC)", "Sydney time", "What happened", "Record", "Fingerprint", "Actor profile"],
    ...chain.filter((e) => e.recordId === null || selected.has(e.recordId)).map((e) => [
      e.seq, e.occurredAt, auDateTime(e.occurredAt), describeEvent(e.eventType), e.recordId ? titleOf.get(e.recordId) ?? e.recordId : "", e.contentHash ?? "", e.actorProfileId ?? "",
    ]),
  ]));
  files["audit.csv"] = strToU8(csv([
    ["Time (UTC)", "Action", "Outcome", "Actor profile", "Resource", "Reason"],
    ...security
      .filter((s) => !s.resourceId || s.resourceType === "Vault" || selected.has(s.resourceId) || chosenVersions.some((v) => v.id === s.resourceId))
      .sort((a, b) => Number(a.seq) - Number(b.seq))
      .map((s) => [iso(s.occurredAt), s.action, s.outcome, s.actorProfileId ?? "", `${s.resourceType ?? ""} ${s.resourceId ?? ""}`.trim(), s.reason ?? ""]),
  ]));

  const exportedAt = new Date().toISOString();
  const manifest = {
    format: MANIFEST_FORMAT,
    building: { schemeId: scheme.id, name: scheme.name, planNumber: scheme.planNumber },
    exportedAt,
    exportedBy: { profileId: input.actorId, name: input.actorName },
    reason,
    hashFormula: "SHA-256 hex of: prevHash, schemeId, seq, occurredAt (ISO UTC, milliseconds), eventType, recordId, versionId, contentHash, actorProfileId, details, joined by a newline, UTF-8. Empty string for a missing value. The first prevHash is 64 zeros.",
    files: manifestFiles,
    events,
  };
  const manifestText = JSON.stringify(manifest, null, 2);
  const manifestSha256 = sha256Hex(manifestText);
  files["manifest.json"] = strToU8(manifestText);
  files["verify.mjs"] = strToU8(VERIFY_SCRIPT);
  files["VERIFY.md"] = strToU8(verifyReadme({ name: scheme.name, planNumber: scheme.planNumber, exportedAt, reason, fileCount: manifestFiles.length, eventCount: events.length, manifestSha256 }));

  const exported = await appendVaultEvent({
    schemeId: input.schemeId,
    eventType: "export.created",
    actorId: input.actorId,
    details: { reason, manifestSha256, records: records.length, files: manifestFiles.length, recordIds: records.length <= 50 ? records.map((r) => r.id).sort() : undefined },
  });
  files["export-receipt.json"] = strToU8(JSON.stringify({
    note: "This export is itself recorded in the building's vault ledger. Ask the building's manager to confirm this event and fingerprint in StrataVerze.",
    manifestSha256,
    exportEventSeq: Number(exported.seq),
    exportEventHash: exported.rowHash,
    exportedAt: iso(exported.occurredAt),
  }, null, 2));

  const name = String(scheme.planNumber || scheme.name).replace(/[^A-Za-z0-9]+/g, "-");
  return { fileName: `evidence-${name}-${exportedAt.slice(0, 10)}.zip`, zip: zipSync(files), manifestSha256, exportSeq: Number(exported.seq) };
}

export function verifyReadme(p: { name: string; planNumber: string; exportedAt: string; reason: string; fileCount: number; eventCount: number; manifestSha256: string }): string {
  return [
    `# Evidence package: ${p.name} (${p.planNumber})`,
    "",
    `Exported from StrataVerze on ${auDateTime(p.exportedAt)} (Sydney time). Reason given: ${p.reason}`,
    "",
    "## What is in it",
    "",
    "- `originals/` each original file exactly as StrataVerze captured it, named by its SHA-256 fingerprint.",
    "- `records/` one file per record: its versions, when each was received and from where, and its history.",
    "- `timeline.csv` the events for these records, in order.",
    "- `audit.csv` who viewed, downloaded or exported these records through StrataVerze.",
    "- `manifest.json` every file with its fingerprint, and the building's chain of events.",
    "- `verify.mjs` a check you can run yourself. `export-receipt.json` where this export is recorded.",
    "",
    "## How to check it",
    "",
    "1. Unzip the package into a folder.",
    "2. With Node.js 18 or later installed, run `node verify.mjs` in that folder. It needs no internet and no StrataVerze code. Read it first if you like: it is short.",
    "3. It re-fingerprints every file, recomputes every event in the chain and checks each one links to the one before, and checks each file is the one the chain says was captured.",
    "4. Without Node.js, check any file by hand: `sha256sum originals/<file>` (Linux), `shasum -a 256 originals/<file>` (macOS) or `Get-FileHash originals\\<file>` (Windows). The result must equal the file's name and its `sha256` in `manifest.json`.",
    `5. The fingerprint of this package's manifest.json is ${p.manifestSha256}. StrataVerze recorded it in the building's vault when the package was made (see export-receipt.json).`,
    "",
    "## What a successful check shows",
    "",
    `- The ${p.fileCount} files are byte for byte the ones StrataVerze captured, at the times shown.`,
    `- The ${p.eventCount} events form one unbroken chain: none has been changed, removed or reordered since it was recorded, as far as this copy of the chain goes.`,
    "",
    "## What it does not show",
    "",
    "- Who wrote a document, or whether what it says is true. A fingerprint proves the file has not changed, not that it is genuine.",
    "- That a date printed in a document, or reported by another system, is right. Those dates are marked \"as reported\".",
    "- Anything about documents that never reached StrataVerze.",
    "- That the chain was not rewritten as a whole before this export. For that, compare the last event's hash with one recorded earlier (for example in an earlier package, or a check shown in StrataVerze). Off-platform signed checkpoints are planned but not part of this trial.",
    "- Events for records not in this package are included as links only, so the chain can be checked without disclosing them.",
    "",
    "Whether this package is accepted as evidence is for the tribunal or court. StrataVerze makes no claim about that.",
    "",
  ].join("\n");
}
