import Link from "next/link";
import { formatDateTimeIn } from "@/lib/jurisdiction/time-zone";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { myContractorBusinessIds } from "@/lib/works/urgent-orders";
import { jobForContractor } from "@/lib/works/marketplace";
import { Card, CardHeader } from "@/components/ui/card";
import { DeclineInvitation, InterestButton, QuoteForm, WithdrawQuote } from "@/components/works/job-actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A deadline in the job's building's time zone. */
const when = (tz: string, iso: string | null) => (iso ? formatDateTimeIn(tz, iso, { weekday: "short" }) : "Not set");
const money = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * One marketplace job (works stage 3, 25 Oct 2026). Before an invitation the
 * contractor sees the committee's summary, the trade, the suburb and the
 * photos. Once invited, also the address and who to contact, and they quote.
 */
export default async function SupplierJobPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const job = await jobForContractor(id, await myContractorBusinessIds(profile.id));
  if (!job) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/supplier/quotes" className="text-sm text-ink-muted hover:text-ink">← Quote requests</Link>
        <h1 className="text-2xl font-bold font-heading text-ink mt-2 mb-1">{job.title}</h1>
        <p className="text-sm text-ink-muted">{[job.trade, job.suburb].filter(Boolean).join(" · ")} · {job.rfqNumber} · {job.statusLabel}</p>
      </div>

      {!job.invitationStatus && (
        <Card>
          <CardHeader title="Would you like to quote?" description={`Interest closes ${when(job.timeZone, job.interestClosesAt)}. The committee then chooses who to invite.`} />
          {job.interestOpen ? <InterestButton rfqId={job.id} interested={job.interested} /> : <p className="text-sm text-ink-muted">Interest has closed.</p>}
        </Card>
      )}

      {job.invitationStatus === "DECLINED" && (
        <Card>
          <p className="text-sm text-ink">You declined this invitation.</p>
        </Card>
      )}

      {job.invited && (
        <Card>
          <CardHeader title={job.quote?.status === "SUBMITTED" ? "Your quote" : "Your invitation to quote"} description={`Quotes close ${when(job.timeZone, job.quoteClosesAt)}.`} />
          {job.quote?.status === "ACCEPTED" && <p className="text-sm text-emerald-700 mb-3">Your quote was approved. The work order is under Work Orders.</p>}
          {job.quote?.status === "DECLINED" && <p className="text-sm text-ink mb-3">The building chose another quote. Thank you for quoting.</p>}
          {job.quote?.status === "SUBMITTED" && (
            <p className="text-sm text-ink mb-3">
              Quoted {money(job.quote.total)} including GST{job.quote.documentName ? `, with ${job.quote.documentName}` : ""}.
            </p>
          )}
          {job.quoteOpen ? (
            <div className="space-y-4">
              <QuoteForm rfqId={job.id} schemeId={job.schemeId} current={job.quote && job.quote.status !== "WITHDRAWN" ? job.quote : null} />
              {job.quote?.status === "SUBMITTED" ? <WithdrawQuote rfqId={job.id} /> : job.invitationStatus === "PENDING" && <DeclineInvitation rfqId={job.id} />}
            </div>
          ) : (
            !job.quote && <p className="text-sm text-ink-muted">Quotes have closed.</p>
          )}
        </Card>
      )}

      <Card>
        {job.invited && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 mb-5">
            <div>
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">Building</dt>
              <dd className="text-sm text-ink">
                {job.building?.name}
                <span className="block text-ink-muted">{job.building?.address}</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">Where in the building</dt>
              <dd className="text-sm text-ink">{job.location ?? "Not given"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">Contact</dt>
              <dd className="text-sm text-ink">
                {job.contact ? (
                  <>
                    {job.contact.name}
                    {job.contact.email && <span className="block select-all text-ink-muted">{job.contact.email}</span>}
                    {job.contact.phone && <span className="block select-all text-ink-muted">{job.contact.phone}</span>}
                  </>
                ) : (
                  "The building's committee"
                )}
              </dd>
            </div>
          </dl>
        )}
        <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">The job</p>
        <p className="text-sm text-ink whitespace-pre-wrap" style={{ overflowWrap: "anywhere" }}>{job.summary}</p>
        {!job.invited && <p className="mt-2 text-xs text-ink-muted">The address and a contact are shown once the committee invites you to quote.</p>}
        {job.photos.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-2">Photos</p>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {job.photos.map((p) => (
                <li key={p.id}>
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-[var(--radius-card)] border border-line bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage link */}
                    <img src={p.url} alt="Photo of the job" className="aspect-[4/3] w-full object-cover" loading="lazy" />
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-ink-muted">Photo links last 15 minutes. Reload the page if one does not open.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
