"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { bringInVaultAction, openVaultAction, runVaultCheckAction } from "@/lib/actions/vault";
import { auDateTime } from "@/lib/vault/labels";

export type VaultBannerData =
  | { opened: false }
  | {
      opened: true;
      openedAt: string;
      recordCount: number;
      lastCheck: { ok: boolean; checkedAt: string; eventsChecked: number; filesChecked: number } | null;
      pendingCount: number;
    };

/** The vault's summary at the top of a trial building's document library. */
export function VaultBanner({ schemeId, data }: { schemeId: string; data: VaultBannerData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const run = (action: () => Promise<{ ok?: boolean; error?: string; message?: string }>) =>
    startTransition(async () => {
      const r = await action();
      setMessage(r.error ? { ok: false, text: r.error } : { ok: true, text: r.message ?? "Done." });
      router.refresh();
    });

  return (
    <section aria-labelledby="vault-heading" className="mb-6 rounded-[var(--radius-card)] border border-mint bg-mint-soft/40 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="vault-heading" className="font-heading font-semibold text-ink">
            Building vault <span className="ml-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Trial</span>
          </h2>
          {!data.opened ? (
            <p className="mt-1 max-w-prose text-sm text-ink-muted">
              Keep a permanent, checkable copy of every document in this library and every notice, pack and set of minutes StrataVerze issues. Originals are fingerprinted and can never be replaced or deleted. Changes in the library are recorded against them.
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink-muted">
              {data.recordCount} record{data.recordCount === 1 ? "" : "s"} since {auDateTime(data.openedAt)}.{" "}
              {data.lastCheck
                ? data.lastCheck.ok
                  ? `Last check ${auDateTime(data.lastCheck.checkedAt)}: all ${data.lastCheck.eventsChecked} events and ${data.lastCheck.filesChecked} files unchanged.`
                  : `Last check ${auDateTime(data.lastCheck.checkedAt)} found a problem. Open the vault page for details.`
                : "Not checked yet."}
            </p>
          )}
          {data.opened && data.pendingCount > 0 && (
            <p className="mt-1 text-sm font-medium text-[#A16207]">
              {data.pendingCount} document{data.pendingCount === 1 ? " is" : "s are"} not yet in the vault.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">
          {!data.opened ? (
            <Button onClick={() => run(() => openVaultAction(schemeId))} disabled={pending}>
              {pending ? "Opening…" : "Open the vault"}
            </Button>
          ) : (
            <>
              {data.pendingCount > 0 && (
                <Button variant="secondary" onClick={() => run(() => bringInVaultAction(schemeId))} disabled={pending}>
                  Bring them in
                </Button>
              )}
              <Button variant="secondary" onClick={() => run(() => runVaultCheckAction(schemeId))} disabled={pending}>
                {pending ? "Working…" : "Check now"}
              </Button>
              <Link
                href={`/adviser/schemes/${schemeId}/documents/vault`}
                className="inline-flex h-10 items-center justify-center rounded-full bg-turquoise px-6 text-[13px] font-semibold uppercase tracking-[0.04em] text-white hover:bg-turquoise/90"
              >
                Timeline and export
              </Link>
            </>
          )}
        </div>
      </div>
      {message && (
        <p role="status" className={`mt-3 text-sm ${message.ok ? "text-[#1A7A63]" : "text-[#B33A3A]"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
