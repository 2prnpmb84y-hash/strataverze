import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { getVault } from "./capture";
import { failedVersionsOf, latestCheck } from "./check";
import { vaultLabels, type VaultLabel } from "./labels";
import { pendingSources } from "./sources";
import { describeEvent } from "./event-text";

export { describeEvent };

/**
 * Reading a building's vault for the adviser's library and vault pages
 * (server side). Callers must authorise first. Every read is scoped to the
 * one building.
 */

const iso = (v: unknown) => new Date(String(v)).toISOString();
const day = (v: unknown) => (v == null ? null : String(v).slice(0, 10));

export interface VaultVersionView {
  id: string;
  versionNo: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  contentHash: string;
  capturedAt: string;
  labels: VaultLabel[];
  receipts: Array<{ id: string; source: string; sourceRef: string | null; originalFileName: string; receivedAt: string; receivedBy: string | null }>;
}

export interface VaultRecordSummary {
  id: string;
  title: string;
  recordType: string;
  source: string;
  sourceRef: string | null;
  reportedDate: string | null;
  createdAt: string;
  latest: VaultVersionView | null;
  versionCount: number;
}

type Check = Awaited<ReturnType<typeof latestCheck>>;

function checkInfo(check: Check) {
  return check ? { ok: check.ok, checkedAt: iso(check.checkedAt), failedVersionIds: failedVersionsOf(check) } : null;
}

async function loadAll(schemeId: string) {
  const [records, versions, receipts, check] = await Promise.all([
    db.orm.public.VaultRecord.where((r) => r.schemeId.eq(schemeId)).all(),
    db.orm.public.VaultVersion.where((v) => v.schemeId.eq(schemeId)).all(),
    db.orm.public.VaultReceipt.where((r) => r.schemeId.eq(schemeId)).all(),
    latestCheck(schemeId),
  ]);
  return { records, versions, receipts, check };
}

function summarise(all: Awaited<ReturnType<typeof loadAll>>): VaultRecordSummary[] {
  const info = checkInfo(all.check);
  return all.records
    .map((r) => {
      const versions = all.versions.filter((v) => v.recordId === r.id).sort((a, b) => b.versionNo - a.versionNo);
      const latest = versions[0];
      return {
        id: r.id,
        title: r.title,
        recordType: r.recordType,
        source: r.source,
        sourceRef: r.sourceRef ?? null,
        reportedDate: day(r.reportedDate),
        createdAt: iso(r.createdAt),
        versionCount: versions.length,
        latest: latest ? versionView(r, latest, all.receipts, info) : null,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function versionView(
  r: { source: string; reportedDate: unknown; reportedBy: string | null },
  v: { id: string; versionNo: number; fileName: string; mimeType: string; sizeBytes: unknown; contentHash: string; capturedAt: unknown },
  receipts: Array<{ id: string; versionId: string; source: string; sourceRef: string | null; originalFileName: string; receivedAt: unknown; receivedBy: string | null }>,
  info: ReturnType<typeof checkInfo>,
): VaultVersionView {
  return {
    id: v.id,
    versionNo: v.versionNo,
    fileName: v.fileName,
    mimeType: v.mimeType,
    sizeBytes: Number(v.sizeBytes),
    contentHash: v.contentHash,
    capturedAt: iso(v.capturedAt),
    labels: vaultLabels({ source: r.source, reportedDate: day(r.reportedDate), reportedBy: r.reportedBy ?? null, versionId: v.id, capturedAt: iso(v.capturedAt), lastCheck: info }),
    receipts: receipts
      .filter((x) => x.versionId === v.id)
      .map((x) => ({ id: x.id, source: x.source, sourceRef: x.sourceRef ?? null, originalFileName: x.originalFileName, receivedAt: iso(x.receivedAt), receivedBy: x.receivedBy ?? null }))
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)),
  };
}

/** What the library page shows for a trial building. */
export async function vaultLibraryView(schemeId: string) {
  const vault = await getVault(schemeId);
  if (!vault) return { vault: null } as const;
  const [all, pending] = await Promise.all([loadAll(schemeId), pendingSources(schemeId)]);
  const records = summarise(all);
  const byDocumentId: Record<string, VaultRecordSummary> = {};
  /** Library documents that are a second copy of another document's file. */
  const copyOf: Record<string, string> = {};
  for (const r of records) {
    // A record's own source, or a later receipt (the same file added to the library again).
    if (r.sourceRef?.startsWith("Document:")) byDocumentId[r.sourceRef.slice(9)] = r;
  }
  for (const rc of all.receipts) {
    if (!rc.sourceRef?.startsWith("Document:")) continue;
    const v = all.versions.find((x) => x.id === rc.versionId);
    const rec = v && records.find((x) => x.id === v.recordId);
    if (rec && !byDocumentId[rc.sourceRef.slice(9)]) copyOf[rc.sourceRef.slice(9)] = rec.title;
  }
  return {
    vault: { id: vault.id, openedAt: iso(vault.openedAt) },
    lastCheck: all.check ? { ok: all.check.ok, checkedAt: iso(all.check.checkedAt), eventsChecked: all.check.eventsChecked, filesChecked: all.check.filesChecked } : null,
    recordCount: records.length,
    byDocumentId,
    copyOf,
    issuedByStrataVerze: records.filter((r) => r.source === "STRATAVERZE"),
    pending: pending.map((p) => ({ sourceRef: p.sourceRef, title: p.title, kind: p.kind })),
  } as const;
}

/** One record with all its versions and its own history. */
export async function vaultRecordDetail(schemeId: string, recordId: string) {
  const record = await db.orm.public.VaultRecord.where((r) => and(r.id.eq(recordId), r.schemeId.eq(schemeId))).first();
  if (!record) return null;
  const [versions, receipts, events, check] = await Promise.all([
    db.orm.public.VaultVersion.where((v) => and(v.recordId.eq(record.id), v.schemeId.eq(schemeId))).all(),
    db.orm.public.VaultReceipt.where((r) => r.schemeId.eq(schemeId)).all(),
    db.orm.public.VaultEvent.where((e) => and(e.recordId.eq(record.id), e.schemeId.eq(schemeId))).all(),
    latestCheck(schemeId),
  ]);
  const info = checkInfo(check);
  return {
    id: record.id,
    title: record.title,
    recordType: record.recordType,
    source: record.source,
    sourceRef: record.sourceRef ?? null,
    reportedDate: day(record.reportedDate),
    reportedBy: record.reportedBy ?? null,
    createdAt: iso(record.createdAt),
    versions: versions.sort((a, b) => b.versionNo - a.versionNo).map((v) => versionView(record, v, receipts, info)),
    history: events
      .map((e) => ({ seq: Number(e.seq), occurredAt: iso(e.occurredAt), eventType: e.eventType, actorProfileId: e.actorProfileId ?? null, details: safeParse(e.details), versionId: e.versionId ?? null }))
      .sort((a, b) => a.seq - b.seq),
  };
}

/**
 * The vault record for a library document. `own` is false when the
 * document is a second copy of a file already kept for another document:
 * the file is kept once, under the first document's record.
 */
export async function vaultRecordForDocument(schemeId: string, documentId: string): Promise<{ recordId: string; own: boolean } | null> {
  const ref = `Document:${documentId}`;
  const rec = await db.orm.public.VaultRecord.where((r) => and(r.schemeId.eq(schemeId), r.sourceRef.eq(ref))).first();
  if (rec) return { recordId: rec.id, own: true };
  const receipt = await db.orm.public.VaultReceipt.where((r) => and(r.schemeId.eq(schemeId), r.sourceRef.eq(ref))).first();
  if (!receipt) return null;
  const v = await db.orm.public.VaultVersion.where((x) => and(x.id.eq(receipt.versionId), x.schemeId.eq(schemeId))).first();
  return v ? { recordId: v.recordId, own: false } : null;
}

export function safeParse(text: string): Record<string, unknown> {
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The building's timeline, newest first, with names for the people and records. */
export async function vaultTimeline(schemeId: string, filter: { recordType?: string; eventType?: string; from?: string; to?: string } = {}) {
  const [events, records] = await Promise.all([
    db.orm.public.VaultEvent.where((e) => e.schemeId.eq(schemeId)).all(),
    db.orm.public.VaultRecord.where((r) => r.schemeId.eq(schemeId)).all(),
  ]);
  const recordById = new Map(records.map((r) => [r.id, r]));
  const actorIds = [...new Set(events.map((e) => e.actorProfileId).filter((x): x is string => !!x))];
  const profiles = actorIds.length ? await db.orm.public.Profile.where((p) => p.id.in(actorIds)).all() : [];
  const nameOf = new Map(profiles.map((p) => [p.id, [p.firstName, p.lastName].filter(Boolean).join(" ") || p.email || "A member"]));
  return events
    .map((e) => {
      const rec = e.recordId ? recordById.get(e.recordId) : undefined;
      return {
        seq: Number(e.seq),
        occurredAt: iso(e.occurredAt),
        eventType: e.eventType,
        text: describeEvent(e.eventType),
        recordId: e.recordId ?? null,
        recordTitle: rec?.title ?? null,
        recordType: rec?.recordType ?? null,
        reportedDate: rec ? day(rec.reportedDate) : null,
        source: rec?.source ?? null,
        actor: e.actorProfileId ? nameOf.get(e.actorProfileId) ?? "A member" : "StrataVerze",
        details: safeParse(e.details),
        rowHash: e.rowHash,
      };
    })
    .filter((e) => (!filter.recordType || e.recordType === filter.recordType) && (!filter.eventType || e.eventType === filter.eventType))
    .filter((e) => (!filter.from || e.occurredAt.slice(0, 10) >= filter.from) && (!filter.to || e.occurredAt.slice(0, 10) <= filter.to))
    .sort((a, b) => b.seq - a.seq);
}
