import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { downloadObject, writeObjectOnce } from "@/lib/storage/server-storage";
import { recordSecurityEvent } from "@/lib/audit/security-audit";
import { isVaultTrialBuilding } from "@/config/vault";
import { canonicalJson, sha256Hex } from "./chain";

/**
 * Capturing into a building's vault (server side). Every source goes
 * through captureFile: fingerprint the exact bytes, keep them once under
 * their fingerprint, then in one transaction write the record, version,
 * receipt and ledger event. The database numbers versions, stamps times and
 * chains the ledger; nothing here can change or remove what is there.
 *
 * Callers must authorise first, and must only pass a schemeId the person
 * may act on.
 */

export type VaultSource = "UPLOAD" | "STRATAVERZE";

export class VaultError extends Error {}

const ts = (v: string) => v as never;

export async function getVault(schemeId: string) {
  return db.orm.public.Vault.where((v) => v.schemeId.eq(schemeId)).first();
}

/**
 * The building's vault, only for a trial building. Every other building
 * never touches the vault tables, so a vault problem cannot reach them.
 */
export async function getTrialVault(schemeId: string) {
  const scheme = await db.orm.public.Scheme.where((s) => s.id.eq(schemeId)).first();
  if (!scheme || !isVaultTrialBuilding(scheme.planNumber)) return null;
  return getVault(schemeId);
}

/** Open the building's vault. Safe to call twice: the second call returns the first vault. */
export async function openVault(schemeId: string, actorId: string) {
  const existing = await getVault(schemeId);
  if (existing) return { vault: existing, opened: false };
  try {
    const vault = await db.transaction(async (tx) => {
      const v = await tx.orm.public.Vault.create({ schemeId, openedBy: actorId });
      await tx.orm.public.VaultEvent.create({
        schemeId,
        eventType: "vault.opened",
        actorProfileId: actorId,
        details: canonicalJson({ trial: true }),
      });
      return v;
    });
    return { vault, opened: true };
  } catch (err) {
    // Opened at the same moment by someone else.
    const again = await getVault(schemeId);
    if (again) return { vault: again, opened: false };
    throw err;
  }
}

/** Write a ledger event for the building. The database numbers and chains it. */
export async function appendVaultEvent(input: {
  schemeId: string;
  eventType: string;
  actorId: string | null;
  recordId?: string | null;
  versionId?: string | null;
  contentHash?: string | null;
  details?: Record<string, unknown>;
}) {
  return db.orm.public.VaultEvent.create({
    schemeId: input.schemeId,
    eventType: input.eventType,
    actorProfileId: input.actorId,
    recordId: input.recordId ?? null,
    versionId: input.versionId ?? null,
    contentHash: input.contentHash ?? null,
    details: canonicalJson(input.details ?? {}),
  });
}

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "application/json": "json",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "text/plain": "txt",
};

/** Where an original is kept: the building's vault folder, named by its fingerprint. */
export function vaultObjectPath(schemeId: string, contentHash: string, fileName: string, mimeType: string): string {
  const fromName = /\.([a-z0-9]{1,8})$/i.exec(fileName)?.[1]?.toLowerCase();
  const ext = EXTENSIONS[mimeType] ?? fromName ?? "bin";
  return `schemes/${schemeId}/vault/originals/${contentHash}.${ext}`;
}

export type CaptureResult =
  | { kind: "new_record"; recordId: string; versionId: string; contentHash: string }
  | { kind: "new_version"; recordId: string; versionId: string; contentHash: string }
  | { kind: "duplicate"; recordId: string; versionId: string; contentHash: string }
  | { kind: "already_captured"; recordId: string; versionId: string | null; contentHash: string | null };

export interface CaptureInput {
  schemeId: string;
  actorId: string | null;
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  source: VaultSource;
  /** What produced it, e.g. "Document:<id>" or "FinancialDocument:<id>". Captures with a sourceRef happen once. */
  sourceRef?: string | null;
  /** A new record. */
  record?: { recordType: string; title: string; reportedDate?: string | null; reportedBy?: string | null };
  /** Or a new version of this record. */
  recordId?: string;
  details?: Record<string, unknown>;
}

/** The record a source already made, if any (a record's own source, or a later receipt). */
export async function findBySourceRef(schemeId: string, sourceRef: string) {
  const record = await db.orm.public.VaultRecord.where((r) => and(r.schemeId.eq(schemeId), r.sourceRef.eq(sourceRef))).first();
  if (record) return { recordId: record.id };
  const receipt = await db.orm.public.VaultReceipt.where((r) => and(r.schemeId.eq(schemeId), r.sourceRef.eq(sourceRef))).first();
  if (!receipt) return null;
  const version = await db.orm.public.VaultVersion.where((v) => v.id.eq(receipt.versionId)).first();
  return version ? { recordId: version.recordId } : null;
}

/** Keep the bytes under their fingerprint. If the path is taken, what is there must be the same bytes. */
async function keepOriginal(path: string, bytes: Uint8Array, mimeType: string, contentHash: string) {
  const written = await writeObjectOnce(path, bytes, mimeType);
  if (written === "written") return;
  const there = await downloadObject(path);
  if (!there) throw new VaultError("The stored copy could not be confirmed. Nothing was captured. Please try again.");
  if (sha256Hex(there) !== contentHash) {
    await recordSecurityEvent({
      action: "vault.integrity_problem",
      outcome: "failed",
      resourceType: "VaultVersion",
      resourceId: path.slice(0, 200),
      reason: "the file stored under this fingerprint does not match it",
    });
    throw new VaultError("A different file is already stored under this fingerprint. Nothing was captured, and the problem has been logged in the security log.");
  }
}

async function recordDuplicate(input: CaptureInput, existing: { id: string; recordId: string; contentHash: string }): Promise<CaptureResult> {
  await db.transaction(async (tx) => {
    await tx.orm.public.VaultReceipt.create({
      versionId: existing.id,
      source: input.source,
      sourceRef: input.sourceRef ?? null,
      originalFileName: input.fileName.slice(0, 255) || "file",
      receivedBy: input.actorId,
    });
    await tx.orm.public.VaultEvent.create({
      schemeId: input.schemeId,
      eventType: "receipt.duplicate",
      actorProfileId: input.actorId,
      recordId: existing.recordId,
      versionId: existing.id,
      contentHash: existing.contentHash,
      details: canonicalJson({ ...(input.details ?? {}), fileName: input.fileName, source: input.source, sourceRef: input.sourceRef ?? null }),
    });
  });
  return { kind: "duplicate", recordId: existing.recordId, versionId: existing.id, contentHash: existing.contentHash };
}

export async function captureFile(input: CaptureInput): Promise<CaptureResult> {
  if (!input.bytes.byteLength) throw new VaultError("The file is empty.");
  const vault = await getVault(input.schemeId);
  if (!vault) throw new VaultError("This building's vault has not been opened.");

  if (input.sourceRef) {
    const done = await findBySourceRef(input.schemeId, input.sourceRef);
    if (done) return { kind: "already_captured", recordId: done.recordId, versionId: null, contentHash: null };
  }

  const contentHash = sha256Hex(input.bytes);
  const fileName = input.fileName.slice(0, 255) || "file";
  const findSame = () =>
    db.orm.public.VaultVersion.where((v) => and(v.schemeId.eq(input.schemeId), v.contentHash.eq(contentHash))).first();

  const same = await findSame();
  if (same) return recordDuplicate(input, same);

  let recordId = input.recordId ?? null;
  if (recordId) {
    const rec = await db.orm.public.VaultRecord.where((r) => and(r.id.eq(recordId!), r.schemeId.eq(input.schemeId))).first();
    if (!rec) throw new VaultError("Record not found.");
  } else if (!input.record) {
    throw new VaultError("Say which record this is.");
  }

  const storagePath = vaultObjectPath(input.schemeId, contentHash, fileName, input.mimeType);
  await keepOriginal(storagePath, input.bytes, input.mimeType, contentHash);

  try {
    return await db.transaction(async (tx) => {
      const isNew = !recordId;
      if (!recordId) {
        const r = input.record!;
        const created = await tx.orm.public.VaultRecord.create({
          vaultId: vault.id,
          schemeId: input.schemeId,
          recordType: r.recordType,
          title: r.title.slice(0, 300) || fileName,
          source: input.source,
          sourceRef: input.sourceRef ?? null,
          reportedDate: r.reportedDate ? ts(r.reportedDate.slice(0, 10)) : null,
          reportedBy: r.reportedBy ?? null,
          createdBy: input.actorId,
        });
        recordId = created.id;
      }
      const version = await tx.orm.public.VaultVersion.create({
        recordId: recordId!,
        contentHash,
        sizeBytes: BigInt(input.bytes.byteLength) as never,
        mimeType: input.mimeType.slice(0, 100),
        fileName,
        storagePath,
        capturedBy: input.actorId,
      });
      await tx.orm.public.VaultReceipt.create({
        versionId: version.id,
        source: input.source,
        sourceRef: input.sourceRef ?? null,
        originalFileName: fileName,
        receivedBy: input.actorId,
      });
      await tx.orm.public.VaultEvent.create({
        schemeId: input.schemeId,
        eventType: isNew ? "record.captured" : "version.added",
        actorProfileId: input.actorId,
        recordId: recordId!,
        versionId: version.id,
        contentHash,
        details: canonicalJson({
          ...(input.details ?? {}),
          fileName,
          mimeType: input.mimeType,
          size: input.bytes.byteLength,
          source: input.source,
          sourceRef: input.sourceRef ?? null,
          ...(isNew ? { title: input.record!.title, recordType: input.record!.recordType, reportedDate: input.record!.reportedDate ?? null, reportedBy: input.record!.reportedBy ?? null } : {}),
        }),
      });
      return { kind: isNew ? "new_record" : "new_version", recordId: recordId!, versionId: version.id, contentHash } as CaptureResult;
    });
  } catch (err) {
    // Captured at the same moment by another request. The same source first
    // (it was this very capture), then the same file (a second receipt).
    if (input.sourceRef) {
      const done = await findBySourceRef(input.schemeId, input.sourceRef);
      if (done) return { kind: "already_captured", recordId: done.recordId, versionId: null, contentHash: null };
    }
    const raced = await findSame();
    if (raced) return recordDuplicate(input, raced);
    throw err;
  }
}

/** A note or correction on a record. The record itself never changes; the note is linked to it. */
export async function annotateRecord(input: { schemeId: string; recordId: string; actorId: string; kind: "note" | "correction"; text: string }) {
  const text = input.text.trim();
  if (!text) throw new VaultError("Write the note first.");
  if (text.length > 2000) throw new VaultError("Keep the note under 2,000 characters.");
  const rec = await db.orm.public.VaultRecord.where((r) => and(r.id.eq(input.recordId), r.schemeId.eq(input.schemeId))).first();
  if (!rec) throw new VaultError("Record not found.");
  return appendVaultEvent({
    schemeId: input.schemeId,
    eventType: input.kind === "correction" ? "record.corrected" : "record.annotated",
    actorId: input.actorId,
    recordId: rec.id,
    details: { text },
  });
}
