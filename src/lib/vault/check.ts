import { db } from "@/prisma/db";
import { downloadObject } from "@/lib/storage/server-storage";
import { checkChain, sha256Hex, type ChainEvent } from "./chain";

/**
 * Checking a building's vault (server side): recompute every event's hash
 * and link, confirm the head the last check saw is still there, and
 * re-fingerprint every stored original. The result is kept (vault_checks)
 * and shown in the library.
 */

const iso = (v: unknown) => new Date(String(v)).toISOString();

export function toChainEvent(e: {
  schemeId: string; seq: unknown; occurredAt: unknown; eventType: string; recordId: string | null; versionId: string | null;
  contentHash: string | null; actorProfileId: string | null; details: string; prevHash: string; rowHash: string;
}): ChainEvent {
  return {
    schemeId: e.schemeId,
    seq: Number(e.seq),
    occurredAt: iso(e.occurredAt),
    eventType: e.eventType,
    recordId: e.recordId ?? null,
    versionId: e.versionId ?? null,
    contentHash: e.contentHash ?? null,
    actorProfileId: e.actorProfileId ?? null,
    details: e.details,
    prevHash: e.prevHash,
    rowHash: e.rowHash,
  };
}

export async function loadChain(schemeId: string): Promise<ChainEvent[]> {
  const rows = await db.orm.public.VaultEvent.where((e) => e.schemeId.eq(schemeId)).all();
  return rows.map(toChainEvent).sort((a, b) => a.seq - b.seq);
}

export async function latestCheck(schemeId: string) {
  const rows = await db.orm.public.VaultCheck.where((c) => c.schemeId.eq(schemeId)).all();
  return rows.sort((a, b) => String(b.checkedAt).localeCompare(String(a.checkedAt)))[0] ?? null;
}

export interface VaultCheckResult {
  ok: boolean;
  eventsChecked: number;
  filesChecked: number;
  failedVersionIds: string[];
  problems: string[];
  checkedAt: string;
}

export async function runVaultCheck(schemeId: string, actorId: string | null): Promise<VaultCheckResult> {
  const [events, previous, versions] = await Promise.all([
    loadChain(schemeId),
    latestCheck(schemeId),
    db.orm.public.VaultVersion.where((v) => v.schemeId.eq(schemeId)).all(),
  ]);
  const expectedHead = previous?.headSeq != null && previous.headHash ? { seq: Number(previous.headSeq), hash: previous.headHash } : null;
  const chain = checkChain(events, expectedHead);

  const failedVersionIds: string[] = [];
  const problems = [...chain.problems];
  for (const v of versions) {
    const bytes = await downloadObject(v.storagePath);
    if (!bytes) {
      failedVersionIds.push(v.id);
      problems.push(`The stored file for "${v.fileName}" (version ${v.versionNo}) is missing.`);
    } else if (sha256Hex(bytes) !== v.contentHash) {
      failedVersionIds.push(v.id);
      problems.push(`The stored file for "${v.fileName}" (version ${v.versionNo}) no longer matches its fingerprint.`);
    }
  }
  const ok = problems.length === 0;
  const problem = ok ? null : JSON.stringify({ failedVersionIds, problems: problems.slice(0, 10) }).slice(0, 2000);
  const row = await db.orm.public.VaultCheck.create({
    schemeId,
    checkedBy: actorId,
    ok,
    eventsChecked: chain.eventsChecked,
    filesChecked: versions.length,
    headSeq: chain.headSeq == null ? null : (BigInt(chain.headSeq) as never),
    headHash: chain.headHash,
    problem,
  });
  return { ok, eventsChecked: chain.eventsChecked, filesChecked: versions.length, failedVersionIds, problems, checkedAt: String(row.checkedAt) };
}

/** The versions a check found wrong, from its stored problem text. */
export function failedVersionsOf(check: { ok: boolean; problem: string | null } | null): Set<string> {
  if (!check || check.ok || !check.problem) return new Set();
  try {
    const parsed = JSON.parse(check.problem) as { failedVersionIds?: unknown };
    return new Set(Array.isArray(parsed.failedVersionIds) ? parsed.failedVersionIds.map(String) : []);
  } catch {
    return new Set();
  }
}
