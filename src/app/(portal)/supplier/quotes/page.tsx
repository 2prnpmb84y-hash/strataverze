import Link from "next/link";
import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { myContractorBusinessIds } from "@/lib/works/urgent-orders";
import { jobsForContractor } from "@/lib/works/marketplace";
import { Card, CardHeader } from "@/components/ui/card";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" }) : "");

/**
 * Jobs to quote (works marketplace stage 3, 25 Oct 2026): jobs open to the
 * business's trades and postcodes, and the ones it was invited to quote.
 */
export default async function SupplierQuotesPage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const { open, invited } = await jobsForContractor(await myContractorBusinessIds(profile.id));
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-ink mb-1">Quote Requests</h1>
        <p className="text-sm text-ink-muted">
          Jobs from buildings in your trades and postcodes. Keep your <Link href="/supplier/service-area" className="underline">trades and service area</Link> up to date to see the right jobs.
        </p>
      </div>

      <Card>
        <CardHeader title="Invited to quote" />
        {invited.length === 0 ? (
          <p className="text-sm text-ink-muted">No invitations yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {invited.map((j) => (
              <li key={j.id}>
                <Link href={`/supplier/quotes/${j.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] bg-muted px-4 py-3 hover:bg-muted/70 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{j.title}</p>
                    <p className="text-xs text-ink-muted">{[j.trade, j.suburb].filter(Boolean).join(" · ")}{j.quoteClosesAt ? ` · quotes close ${when(j.quoteClosesAt)}` : ""}</p>
                  </div>
                  <span className="text-xs text-ink-muted">{j.invitationStatus === "DECLINED" ? "You declined" : j.quoteStatus === "SUBMITTED" ? "Quoted" : j.quoteStatus === "ACCEPTED" ? "Your quote was approved" : j.quoteStatus === "DECLINED" ? "Not selected" : j.statusLabel}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Open jobs" description="Say you are interested, and the committee may invite you to quote." />
        {open.length === 0 ? (
          <p className="text-sm text-ink-muted">No open jobs in your trades and postcodes right now. You are emailed when one opens.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {open.map((j) => (
              <li key={j.id}>
                <Link href={`/supplier/quotes/${j.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] bg-muted px-4 py-3 hover:bg-muted/70 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{j.title}</p>
                    <p className="text-xs text-ink-muted">{[j.trade, j.suburb].filter(Boolean).join(" · ")} · interest closes {when(j.interestClosesAt)}</p>
                  </div>
                  <span className="text-xs text-ink-muted">{j.interested ? "You are interested" : "Open"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
