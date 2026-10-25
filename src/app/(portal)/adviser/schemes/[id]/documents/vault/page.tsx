import { connection } from "next/server";
import { redirect } from "next/navigation";
import { requirePageAccess } from "@/lib/auth/require-access";
import { recordSecurityEventLater } from "@/lib/audit/security-audit";
import { getSchemeById } from "@/lib/queries/schemes";
import { isVaultTrialBuilding } from "@/config/vault";
import { db } from "@/prisma/db";
import { getVault } from "@/lib/vault/capture";
import { vaultLibraryView, vaultTimeline } from "@/lib/vault/queries";
import { auDate, auDateTime } from "@/lib/vault/labels";
import { EVENT_TEXT } from "@/lib/vault/event-text";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { VaultBanner } from "@/components/vault/vault-banner";
import { VaultLabelChip } from "@/components/vault/vault-label";

export const instant = false;

const TYPE_TEXT: Record<string, string> = {
  LEVY_NOTICE: "Levy notices",
  REMITTANCE_ADVICE: "Remittance advices",
  COMMITTEE_PACK: "Committee reports",
  STATUTORY_PACK: "Statutory statements",
  MEETING_NOTICE: "Meeting notices",
  MINUTES: "Minutes",
  INSURANCE: "Insurance",
  PLAN_OR_BYLAW: "Plans and by-laws",
  FINANCIAL: "Financial",
  REPORT: "Reports and compliance",
  OTHER: "Other",
};

/**
 * The building vault (trial): its timeline, its checks, what is not in it
 * yet, and the evidence package. Inside the Document section.
 */
export default async function VaultPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { id } = await params;
  const access = await requirePageAccess(id, "vault.read");
  if (!access) return null;
  const scheme = await getSchemeById(id);
  if (!scheme || !isVaultTrialBuilding(scheme.planNumber) || !(await getVault(id))) redirect(`/adviser/schemes/${id}/documents`);

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const filter = {
    recordType: one(sp.type) || undefined,
    eventType: one(sp.event) || undefined,
    from: /^\d{4}-\d{2}-\d{2}$/.test(one(sp.from)) ? one(sp.from) : undefined,
    to: /^\d{4}-\d{2}-\d{2}$/.test(one(sp.to)) ? one(sp.to) : undefined,
  };
  const exportError = one(sp.exportError).slice(0, 300);

  const [view, timeline, checks] = await Promise.all([
    vaultLibraryView(id),
    vaultTimeline(id, filter),
    db.orm.public.VaultCheck.where((c) => c.schemeId.eq(id)).all(),
  ]);
  if (!view.vault) redirect(`/adviser/schemes/${id}/documents`);
  await recordSecurityEventLater({ action: "view.vault", outcome: "allowed", actorProfileId: access.profile.id, actorRole: "ADVISER", schemeId: id, resourceType: "Vault" });

  const records = [...Object.values(view.byDocumentId), ...view.issuedByStrataVerze]
    .filter((r, i, all) => all.findIndex((x) => x.id === r.id) === i)
    .sort((a, b) => a.title.localeCompare(b.title));
  const recentChecks = checks.sort((a, b) => String(b.checkedAt).localeCompare(String(a.checkedAt))).slice(0, 5);
  const base = `/adviser/schemes/${id}/documents/vault`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Building vault"
        description={`${String(scheme.name)}'s permanent record: every capture, version, note and export, in order. Trial.`}
        backHref={`/adviser/schemes/${id}/documents`}
        backLabel="Documents"
      />

      <VaultBanner
        schemeId={id}
        data={{ opened: true, openedAt: view.vault.openedAt, recordCount: view.recordCount, lastCheck: view.lastCheck, pendingCount: view.pending.length }}
      />

      <Card>
        <CardHeader title="Evidence package" description="A zip anyone can check without StrataVerze: the originals, their history, a manifest of fingerprints and a short check script. Recorded in the vault when you download it." />
        {exportError && (
          <p role="alert" className="mb-3 rounded-lg bg-[#FDECEC] px-3 py-2 text-sm text-[#B33A3A]">
            {exportError}
          </p>
        )}
        <form method="post" action="/api/vault/export" className="space-y-4">
          <input type="hidden" name="schemeId" value={id} />
          <fieldset>
            <legend className="text-sm font-medium text-ink">Records to include</legend>
            <label className="mt-2 flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="all" /> All {view.recordCount} records
            </label>
            <details className="mt-2">
              <summary className="cursor-pointer text-sm text-turquoise">Or choose records</summary>
              <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-line p-3">
                {records.map((r) => (
                  <li key={r.id}>
                    <label className="flex items-start gap-2 text-sm text-ink">
                      <input type="checkbox" name="recordId" value={r.id} className="mt-1" />
                      <span className="min-w-0">
                        {r.title}
                        <span className="block text-xs text-ink-muted">{TYPE_TEXT[r.recordType] ?? r.recordType} · {r.versionCount} version{r.versionCount === 1 ? "" : "s"}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </details>
          </fieldset>
          <div>
            <label htmlFor="reason" className="text-sm font-medium text-ink">Why is it needed?</label>
            <p className="text-xs text-ink-muted">Recorded with the export, for example &ldquo;Tribunal application about the roof defect&rdquo;.</p>
            <textarea id="reason" name="reason" required maxLength={500} rows={2} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button type="submit" className="inline-flex h-10 items-center justify-center rounded-full bg-turquoise px-6 text-[13px] font-semibold uppercase tracking-[0.04em] text-white hover:bg-turquoise/90">
              Download evidence package
            </button>
            <span className="text-xs text-ink-muted">You may be asked for your authenticator code first.</span>
          </div>
        </form>
      </Card>

      {view.pending.length > 0 && (
        <Card>
          <CardHeader title="Not yet in the vault" description="These should be in the vault but are not: added before it was opened, or a capture that failed. Use Bring them in above." />
          <ul className="space-y-1 text-sm text-ink">
            {view.pending.slice(0, 50).map((p) => (
              <li key={p.sourceRef}>{p.title}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="Checks" description="Each check recomputes every event's fingerprint and link, and re-fingerprints every stored original." />
        {recentChecks.length === 0 ? (
          <p className="text-sm text-ink-muted">No checks yet. Use Check now above.</p>
        ) : (
          <ul className="space-y-2">
            {recentChecks.map((c) => (
              <li key={c.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                <VaultLabelChip tone={c.ok ? "good" : "bad"} text={c.ok ? "All unchanged" : "Problem found"} />
                <span className="text-sm text-ink">
                  {auDateTime(String(c.checkedAt))} · {c.eventsChecked} events, {c.filesChecked} files
                  {c.headHash ? <span className="block break-all font-mono text-[11px] text-ink-muted">Last event {String(c.headSeq)}: {c.headHash}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Timeline" description="Newest first. Each entry shows when StrataVerze recorded it. A date a document itself carries is shown as reported, never as checked." />
        <form method="get" action={base} className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-5">
          <label className="text-xs text-ink-muted">
            Kind of record
            <select name="type" defaultValue={filter.recordType ?? ""} className="mt-1 h-9 w-full rounded-lg border border-line bg-white px-2 text-sm text-ink">
              <option value="">All</option>
              {Object.entries(TYPE_TEXT).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-ink-muted">
            What happened
            <select name="event" defaultValue={filter.eventType ?? ""} className="mt-1 h-9 w-full rounded-lg border border-line bg-white px-2 text-sm text-ink">
              <option value="">Anything</option>
              {Object.entries(EVENT_TEXT).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-ink-muted">
            From
            <input type="date" name="from" defaultValue={filter.from ?? ""} className="mt-1 h-9 w-full rounded-lg border border-line px-2 text-sm text-ink" />
          </label>
          <label className="text-xs text-ink-muted">
            To
            <input type="date" name="to" defaultValue={filter.to ?? ""} className="mt-1 h-9 w-full rounded-lg border border-line px-2 text-sm text-ink" />
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="h-9 rounded-full border-[1.5px] border-turquoise px-4 text-[13px] font-semibold uppercase text-turquoise">Show</button>
            <a href={base} className="text-sm text-ink-muted">Clear</a>
          </div>
        </form>
        {timeline.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing matches.</p>
        ) : (
          <ol className="divide-y divide-line">
            {timeline.slice(0, 300).map((e) => (
              <li key={e.seq} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4">
                <div className="text-xs text-ink-muted sm:w-44 sm:shrink-0">
                  <span className="block font-medium text-ink">{auDateTime(e.occurredAt)}</span>
                  Recorded by StrataVerze · event {e.seq}
                </div>
                <div className="min-w-0 text-sm text-ink">
                  <span className="font-medium">{e.text}</span>
                  {e.recordTitle && <span>: {e.recordTitle}</span>}
                  <span className="block text-xs text-ink-muted">
                    By {e.actor}
                    {e.source === "STRATAVERZE" ? " · issued by StrataVerze" : ""}
                    {e.reportedDate ? ` · document dated ${auDate(e.reportedDate)}, as reported` : ""}
                  </span>
                  {typeof e.details.text === "string" && <span className="block whitespace-pre-wrap text-ink-muted">&ldquo;{e.details.text}&rdquo;</span>}
                  {typeof e.details.reason === "string" && <span className="block text-ink-muted">Reason: {e.details.reason}</span>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
