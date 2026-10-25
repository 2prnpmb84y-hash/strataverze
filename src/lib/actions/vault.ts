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
import { runVaultCheck } from "@/lib/vault/check";
import { bringInPending } from "@/lib/vault/reconcile";
import { vaultRecordDetail, vaultRecordIdForDocument } from "@/lib/vault/queries";
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
    if (!scheme || !isVaultTrialBuilding(scheme.planNumber)) throw new VaultError("The vault trial is not available for this building.");
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
    const recordId = ref.recordId ?? (ref.documentId ? await vaultRecordIdForDocument(schemeId, ref.documentId) : null);
    if (!recordId) return { record: null };
    return { record: await vaultRecordDetail(schemeId, recordId) };
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
 * and the vault keeps every earlier one, linked.
 */
export async function addVaultVersionAction(schemeId: string, documentId: string, uploadId: string): Promise<VaultActionResult> {
  try {
    const { profile } = await requireTrialVault(schemeId, "vault.manage");
    const doc = await getDocumentById(documentId);
    assertInScheme(doc, schemeId, "Document");
    const recordId = await vaultRecordIdForDocument(schemeId, documentId);
    if (!recordId) throw new VaultError("This document is not in the vault yet. Bring it in first.");
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
    const result = await consumeUpload(
      upload.uploadId,
      async () => {
        const captured = await captureFile({
          schemeId,
          actorId: profile.id,
          bytes,
          fileName: upload.fileName,
          mimeType: upload.mimeType,
          source: "UPLOAD",
          recordId,
          details: { documentId, newFileFor: "library document" },
        });
        if (captured.kind === "new_version") {
          await updateDocument(schemeId, documentId, { fileUrl: upload.path, fileName: upload.fileName, fileSize: upload.size, mimeType: upload.mimeType });
        }
        return captured;
      },
      (c) => `VaultVersion:${c.versionId ?? c.recordId}`,
    );
    revalidatePath(libraryPath(schemeId), "layout");
    if (result.kind === "duplicate") return { ok: true, message: "That file is already in the vault, so it was recorded as received again. The library is unchanged." };
    return { ok: true, message: "New version added. The earlier version stays in the vault." };
  } catch (err) {
    return fail(err);
  }
}
