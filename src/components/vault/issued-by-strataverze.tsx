"use client";

import { useState } from "react";
import type { LabelTone } from "@/lib/vault/labels";
import { auDateTime } from "@/lib/vault/labels";
import { VaultLabelChip } from "./vault-label";
import { VaultRecordPanel } from "./vault-record-panel";

export type IssuedRecord = {
  id: string;
  title: string;
  recordType: string;
  createdAt: string;
  label: { tone: LabelTone; text: string; detail: string } | null;
};

const TYPE_TEXT: Record<string, string> = {
  LEVY_NOTICE: "Levy notice",
  REMITTANCE_ADVICE: "Remittance advice",
  COMMITTEE_PACK: "Committee report",
  STATUTORY_PACK: "Statutory statements",
  MINUTES: "Minutes",
  MEETING_NOTICE: "Meeting notice",
};

/** The documents StrataVerze itself issued for this building, as kept in the vault. */
/** `timeZone` is the building's, for the capture times. */
export function IssuedByStrataVerze({ schemeId, records, timeZone }: { schemeId: string; records: IssuedRecord[]; timeZone: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [type, setType] = useState("");
  const types = [...new Set(records.map((r) => r.recordType))];
  const shown = type ? records.filter((r) => r.recordType === type) : records;
  return (
    <section aria-labelledby="issued-heading" className="mt-8">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="issued-heading" className="font-heading font-semibold text-ink">Issued by StrataVerze</h2>
          <p className="text-sm text-ink-muted">Captured into the vault the moment StrataVerze created them. Read-only.</p>
        </div>
        {types.length > 1 && (
          <label className="text-sm text-ink">
            <span className="sr-only">Show</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className="h-9 rounded-lg border border-line bg-white px-2 text-sm">
              <option value="">All kinds</option>
              {types.map((t) => (
                <option key={t} value={t}>{TYPE_TEXT[t] ?? t}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-line p-6 text-center text-sm text-ink-muted">
          Nothing yet. Levy notices, remittance advices, committee and statutory packs, meeting notices and confirmed minutes appear here once StrataVerze issues them.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                aria-expanded={openId === r.id}
                onClick={() => setOpenId(openId === r.id ? null : r.id)}
                className="flex w-full flex-col gap-1 rounded-[var(--radius-card)] bg-muted px-4 py-3 text-left transition-colors hover:bg-muted/70 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{r.title}</span>
                  <span className="block text-xs text-ink-muted">{TYPE_TEXT[r.recordType] ?? r.recordType} · captured {auDateTime(r.createdAt, timeZone)}</span>
                </span>
                {r.label && <VaultLabelChip tone={r.label.tone} text={r.label.text} detail={r.label.detail} />}
              </button>
              {openId === r.id && <VaultRecordPanel schemeId={schemeId} recordId={r.id} allowNewVersion={false} timeZone={timeZone} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
