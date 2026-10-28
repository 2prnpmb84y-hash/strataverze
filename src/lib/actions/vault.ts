"use server";

import { revalidatePath } from "next/cache";
import { AuthorisationError } from "@/lib/auth/require-membership";
import { requireSchemeAccess } from "@/lib/auth/require-access";
import { assertInScheme } from "@/lib/auth/scheme-scope";
import { recordSecurityEvent } from "@/lib/audit/security-audit";
import { isVaultTrialBuilding } from "@/config/vault";
import { getSchemeById } from "@/lib/queries/schemes";
import { getDocumentById, updateDocument } from "@/lib/queries/documents";
import { consumeUpload, uploadErrorMessage, verifyUpload } from "@/lib/storage/uploads";
import { downloadObject, signDownload } from "@/lib/storage/server-storage";
import { annotateRecord, captureFile, getVault, openVault, VaultError } from "@/lib/vault/capture";
import { sha256Hex } from "@/lib/vault/chain";
import { runVaultCheck } from "@/lib/vault/check";
import { bringInPending } from "@/lib/vault/reconcile";
import { vaultRecordDetail, vaultRecordForDocument } from "@/lib/vault/queries";
import { logLibraryChange } from "@/lib/vault/sources";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";

/**
 * Building vault actions (trial). Adviser only, on a trial building, and
 * always scoped to the one building in the URL.
 */

export type VaultActionResult = { ok?: boolean; error?: string; message?: string };

const libraryPath = (schemeId: string) => `/adviser/schemes/${schemeId}/documents`;

function fail(err: unknown): VaultActionResult {
  if (err instanceof AuthorisationError || err instanceof VaultError) return { error: err.message };
  console.error("[vault] action failed:", err instanceof Error ? err.message : "error");
  return { error: "Something went wrong. Nothing was changed. Please try again." };
}

async function requireTrialVault(schemeId: string, capability: "vault.read" | "vault.manage") {
  const access = await requireSchemeAccess(schemeId, capability);
  const vault = await getVault(schemeId);
  if (!vault) throw new VaultError("This building's vault has not been opened.");
  return { ...access, vault };
}

/** Open the vault for a trial building and bring in what is already in the library. */
export async function openVaultAction(schemeId: string): Promise<VaultActionResult> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "vault.manage");
    const scheme = await getSchemeById(schemeId);
    if (!scheme || !isVaultTrialBuilding(scheme)) throw new VaultError("The vault trial is not available for this building.");
    await openVault(schemeId, profile.id);
    const result = await bringInPending(schemeId, profile.id);
    revalidatePath(libraryPath(schemeId), "layout");
    return { ok: true, message: `Vault opened. ${result.captured} document${result.captured === 1 ? "" : "s"} brought in${result.failed ? `, ${result.failed} could not be (they are listed as not yet in the vault)` : ""}.` };
  } catch (err) {
    return fail(err);
  }
}

/** Bring in documents that should be in the vault but are not yet. */
export async function bringInVaultAction(schemeId: string): Promise<VaultActionResult> {
  try {
    const { profile } = await requireTrialVault(schemeId, "vault.manage");
    const result = await bringInPending(schemeId, profile.id);
    revalidatePath(libraryPath(schemeId), "layout");
    return { ok: true, message: `${result.captured} brought in${result.failed ? `, ${result.failed} still could not be` : ""}${result.remaining ? `, ${result.remaining} more to go` : ""}.` };
  } catch (err) {
    return fail(err);
  }
}

/** Re-check every event and every stored file. */
export async function runVaultCheckAction(schemeId: string): Promise<VaultActionResult> {
  try {
    const { profile } = await requireTrialVault(schemeId, "vault.manage");
    const result = await runVaultCheck(schemeId, profile.id);
    revalidatePath(libraryPath(schemeId), "layout");
    if (!result.ok) {
      await recordSecurityEvent({ action: "vault.check_failed", outcome: "failed", actorProfileId: profile.id, schemeId, resourceType: "Vault", reason: result.problems[0]?.slice(0, 300) ?? "check failed" });
      return { error: `The check found ${result.problems.length} problem${result.problems.length === 1 ? "" : "s"}: ${result.problems.slice(0, 3).join(" ")}` };
    }
    return { ok: true, message: `All ${result.eventsChecked} events and ${result.filesChecked} files check out.` };
  } catch (err) {
    return fail(err);
  }
}

/** The vault panel for a library document, or for a vault record. */
export async function getVaultRecordAction(schemeId: string, ref: { documentId?: string; recordId?: string }) {
  try {
    await requireTrialVault(schemeId, "vault.read");
    const found = ref.recordId ? { recordId: ref.recordId, own: true } : ref.documentId ? await vaultRecordForDocument(schemeId, ref.documentId) : null;
    if (!found) return { record: null, sharedCopy: false };
    return { record: await vaultRecordDetail(schemeId, found.recordId), sharedCopy: !found.own };
  } catch (err) {
    return { record: null, ...fail(err) };
  }
}

/** A short-lived link to one stored original. */
export async function getVaultVersionUrlAction(schemeId: string, versionId: string): Promise<{ url?: string; error?: string }> {
  try {
    const { profile } = await requireTrialVault(schemeId, "vault.read");
    const version = await db.orm.public.VaultVersion.where((v) => and(v.id.eq(versionId), v.schemeId.eq(schemeId))).first();
    if (!version) throw new VaultError("Version not found.");
    await recordSecurityEvent({ action: "vault.download", outcome: "allowed", actorProfileId: profile.id, schemeId, resourceType: "VaultVersion", resourceId: version.id });
    return { url: await signDownload(version.storagePath, 600) };
  } catch (err) {
    return fail(err);
  }
}

/** A note, or a correction, linked to a record. The record itself never changes. */
export async function annotateVaultRecordAction(schemeId: string, recordId: string, kind: "note" | "correction", text: string): Promise<VaultActionResult> {
  try {
    const { profile } = await requireTrialVault(schemeId, "vault.manage");
    await annotateRecord({ schemeId, recordId, actorId: profile.id, kind: kind === "correction" ? "correction" : "note", text: String(text ?? "") });
    revalidatePath(libraryPath(schemeId), "layout");
    return { ok: true, message: kind === "correction" ? "Correction added. The original is unchanged." : "Note added." };
  } catch (err) {
    return fail(err);
  }
}

/**
 * A new version of a library document: the library shows the new file,
 * and the vault keeps every earlier one, linked. A file the vault already
 * holds for this record (going back to an earlier version) is recorded as
 * received again and the library switches to it. A file kept for another
 * record is refused, so two records never share a version.
 */
export async function addVaultVersionAction(schemeId: string, documentId: string, uploadId: string): Promise<VaultActionResult> {
  try {
    const { profile } = await requireTrialVault(schemeId, "vault.manage");
    const doc = await getDocumentById(documentId);
    assertInScheme(doc, schemeId, "Document");
    const found = await vaultRecordForDocument(schemeId, documentId);
    if (!found) throw new VaultError("This document is not in the vault yet. Bring it in first.");
    if (!found.own) throw new VaultError("This document is a second copy of a file kept for another document. Add the new version there.");
    let upload;
    try {
      upload = await verifyUpload({ uploadId: String(uploadId ?? ""), schemeId, purpose: "library", profileId: profile.id });
    } catch (err) {
      const message = uploadErrorMessage(err);
      if (message) return { error: message };
      throw err;
    }
    const bytes = await downloadObject(upload.path);
    if (!bytes) throw new VaultError("The file could not be read. Please try again.");
    const sha = sha256Hex(bytes);
    const same = await db.orm.public.VaultVersion.where((v) => and(v.schemeId.eq(schemeId), v.contentHash.eq(sha))).first();
    if (same && same.recordId !== found.recordId) {
      throw new VaultError("That file is already in the vault for another document, so it cannot be a version of this one.");
    }
    // Claimed first; the library is switched only once the vault has the file.
    const captured = await consumeUpload(
      upload.uploadId,
      () =>
        captureFile({
          schemeId,
          actorId: profile.id,
          bytes,
          fileName: upload.fileName,
          mimeType: upload.mimeType,
          source: "UPLOAD",
          recordId: found.recordId,
          details: { documentId, newFileFor: "library document" },
        }),
      (c) => `VaultVersion:${c.versionId ?? c.recordId}`,
    );
    await updateDocument(schemeId, documentId, { fileUrl: upload.path, fileName: upload.fileName, fileSize: upload.size, mimeType: upload.mimeType });
    if (captured.kind === "duplicate") {
      await logLibraryChange(schemeId, documentId, profile.id, "new_file", { fileName: upload.fileName, sha256: sha, earlierVersion: true });
    }
    revalidatePath(libraryPath(schemeId), "layout");
    if (captured.kind === "duplicate") return { ok: true, message: "That is a version the vault already holds. The library now shows it again, and the vault recorded it as received again." };
    return { ok: true, message: "New version added. The earlier version stays in the vault." };
  } catch (err) {
    return fail(err);
  }
}
