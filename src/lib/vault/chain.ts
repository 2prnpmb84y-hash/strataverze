import { createHash } from "node:crypto";

/**
 * The building vault's fingerprints and hash chain (pure).
 *
 * The database numbers, stamps and chains each vault event (see
 * prisma/migrations/20261029_vault_trial.sql). This file holds the same
 * formula in TypeScript, so StrataVerze can check a chain, and so the
 * stand-alone check script in each evidence package (verify-script.ts)
 * can be shown to agree with it.
 *
 * Event hash: SHA-256 (lower-case hex) of these fields joined by "\n", as
 * UTF-8, with "" for a missing value:
 *   prevHash, schemeId, seq, occurredAt (YYYY-MM-DDTHH:MM:SS.mmmZ),
 *   eventType, recordId, versionId, contentHash, actorProfileId, details
 * The first event's prevHash is 64 zeros.
 */

export const GENESIS_HASH = "0".repeat(64);

export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** JSON with keys sorted at every level and no spaces, so the same data always gives the same text. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export interface ChainEvent {
  schemeId: string;
  seq: number;
  /** ISO time to the millisecond, UTC ("2026-10-24T15:51:42.175Z"). */
  occurredAt: string;
  eventType: string;
  recordId: string | null;
  versionId: string | null;
  contentHash: string | null;
  actorProfileId: string | null;
  details: string;
  prevHash: string;
  rowHash: string;
}

/** The time as the database prints it in the hash: UTC, milliseconds, "Z". */
export function hashTime(value: string | Date): string {
  return new Date(value).toISOString();
}

export function eventHash(e: Omit<ChainEvent, "rowHash">): string {
  return sha256Hex(
    [
      e.prevHash,
      e.schemeId,
      String(e.seq),
      hashTime(e.occurredAt),
      e.eventType,
      e.recordId ?? "",
      e.versionId ?? "",
      e.contentHash ?? "",
      e.actorProfileId ?? "",
      e.details,
    ].join("\n"),
  );
}

export interface ChainCheck {
  ok: boolean;
  eventsChecked: number;
  headSeq: number | null;
  headHash: string | null;
  /** Plain-language problems, first one first. */
  problems: string[];
  /** The first event that does not check out, if any. */
  firstBadSeq: number | null;
}

/**
 * Check one building's events, in any order: numbered 1, 2, 3 with no gaps,
 * each linked to the one before, each hash recomputed. `expectedHead` is the
 * head recorded by an earlier check: that event must still be there with the
 * same hash, or events have been removed from the end or rewritten.
 */
export function checkChain(events: readonly ChainEvent[], expectedHead?: { seq: number; hash: string } | null): ChainCheck {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const problems: string[] = [];
  let firstBadSeq: number | null = null;
  const bad = (seq: number, message: string) => {
    problems.push(message);
    if (firstBadSeq === null) firstBadSeq = seq;
  };
  let prev = GENESIS_HASH;
  sorted.forEach((e, i) => {
    const expectedSeq = i + 1;
    if (e.seq !== expectedSeq) bad(e.seq, `Event ${expectedSeq} is missing (found event ${e.seq} in its place).`);
    if (e.prevHash !== prev) bad(e.seq, `Event ${e.seq} does not link to the event before it.`);
    const { rowHash, ...rest } = e;
    if (eventHash(rest) !== rowHash) bad(e.seq, `Event ${e.seq} has been changed since it was recorded.`);
    prev = e.rowHash;
  });
  const head = sorted.at(-1) ?? null;
  if (expectedHead) {
    const was = sorted.find((e) => e.seq === expectedHead.seq);
    if (!was) bad(expectedHead.seq, `Event ${expectedHead.seq}, the last one seen by the previous check, is missing.`);
    else if (was.rowHash !== expectedHead.hash) bad(expectedHead.seq, `Event ${expectedHead.seq} is not the one the previous check saw.`);
  }
  return {
    ok: problems.length === 0,
    eventsChecked: sorted.length,
    headSeq: head ? head.seq : null,
    headHash: head ? head.rowHash : null,
    problems,
    firstBadSeq,
  };
}
