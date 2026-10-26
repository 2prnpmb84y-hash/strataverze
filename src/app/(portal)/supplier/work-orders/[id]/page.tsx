import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { myContractorBusinessIds, orderForContractor } from "@/lib/works/urgent-orders";
import { Card, CardHeader } from "@/components/ui/card";
import { OrderAnswer } from "@/components/works/order-answer";
import { closeOutForContractor } from "@/lib/works/completion";
import { formatDateTimeIn, todayIn } from "@/lib/jurisdiction/time-zone";
import { ReportDoneForm, WorksInvoiceForm } from "@/components/works/contractor-close-out";

const money = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** A time in the job's building's time zone. */
const when = (tz: string, iso: string) => formatDateTimeIn(tz, iso);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One work order as its contractor sees it (works marketplace stage 2,
 * 25 Oct 2026): the building's address, the problem and photos, the most
 * it may cost, and who to contact. Only active contacts of the business
 * the order was sent to can open it.
 */
export default async function SupplierWorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const businessIds = await myContractorBusinessIds(profile.id);
  const order = await orderForContractor(id, businessIds);
  if (!order) notFound();
  // Finishing and invoicing the job (works stage 4).
  const closeOut = await closeOutForContractor(id, businessIds);
  const today = todayIn(order.timeZone);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/supplier/work-orders" className="text-sm text-ink-muted hover:text-ink">← Work orders</Link>
        <h1 className="text-2xl font-bold font-heading text-ink mt-2 mb-1">{order.title}</h1>
        <p className="text-sm text-ink-muted">
          Urgent work order {order.workOrderNumber} · sent {when(order.timeZone, order.issuedAt)} · {order.statusLabel}
        </p>
      </div>

      {order.status === "AWAITING_ACKNOWLEDGEMENT" && (
        <Card>
          <CardHeader title="Can you take this job?" description="The building is waiting for your answer." />
          <OrderAnswer workOrderId={order.id} />
        </Card>
      )}
      {closeOut && (
        <Card>
          <CardHeader title="Finishing the job" description="Report the work done, then send your invoice. The building checks both before paying." />
          <div className="space-y-5">
            {closeOut.completion && (
              <div className="text-sm space-y-1">
                <p className="font-medium text-ink">{closeOut.completion.statusLabel}</p>
                <p className="text-ink-muted whitespace-pre-wrap" style={{ overflowWrap: "anywhere" }}>{closeOut.completion.summary}</p>
                {closeOut.completion.reviewComments && <p className="text-ink">The building said: {closeOut.completion.reviewComments}</p>}
              </div>
            )}
            {closeOut.canReport && <ReportDoneForm workOrderId={order.id} schemeId={closeOut.schemeId} today={today} />}
            {closeOut.invoices.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-ink-muted uppercase tracking-wide">Your invoices</p>
                <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-white">
                  {closeOut.invoices.map((inv) => (
                    <li key={inv.id} className="px-4 py-3 text-sm space-y-1">
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="font-medium text-ink">Invoice {inv.invoiceNumber}</span>
                        <span className="tabular-nums text-ink">{money(inv.total)}</span>
                      </div>
                      <p className="text-ink-muted">{inv.statusLabel}{inv.paid > 0 ? `, ${money(inv.paid)} paid` : ""}.</p>
                      {inv.returnReason && <p className="text-ink">Why it was sent back: {inv.returnReason}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {closeOut.canInvoice && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-ink">Send your invoice</p>
                {!closeOut.hasBankDetails && (
                  <p className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    You have not given bank details yet, so the building cannot pay you. <Link href="/supplier/onboarding" className="underline">Add them</Link>. The building verifies new bank details before paying.
                  </p>
                )}
                <WorksInvoiceForm workOrderId={order.id} schemeId={closeOut.schemeId} today={today} amountLimit={closeOut.amountLimit} gstRegistered={closeOut.gstRegistered} />
              </div>
            )}
          </div>
        </Card>
      )}
      {order.ended && (
        <Card>
          <p className="text-sm text-ink">
            {order.status === "DECLINED" ? `You declined this job${order.declineReason ? `: ${order.declineReason}` : "."}` : `The building cancelled this order${order.declineReason ? `: ${order.declineReason}` : "."}`}
          </p>
          <p className="text-sm text-ink-muted mt-1">The job details are no longer shown.</p>
        </Card>
      )}

      {!order.ended && <Card>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <div>
            <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">Building</dt>
            <dd className="text-sm text-ink">
              {order.building?.name}
              {order.building?.plan ? ` (${order.building.plan})` : ""}
              <span className="block text-ink-muted">{order.building?.address}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">Where in the building</dt>
            <dd className="text-sm text-ink">{order.location ?? "Not given"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">Kind of work</dt>
            <dd className="text-sm text-ink">{order.trade ?? "Not given"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">Not to exceed</dt>
            <dd className="text-sm text-ink">{order.amountLimit != null ? `${money(order.amountLimit)}, unless the building agrees more first` : "Not set"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">Contact</dt>
            <dd className="text-sm text-ink">
              {order.contact ? (
                <>
                  {order.contact.name}
                  {order.contact.email && <span className="block select-all text-ink-muted">{order.contact.email}</span>}
                  {order.contact.phone && <span className="block select-all text-ink-muted">{order.contact.phone}</span>}
                </>
              ) : (
                "The building's committee"
              )}
            </dd>
          </div>
        </dl>
        <div className="mt-5">
          <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">The problem</p>
          <p className="text-sm text-ink whitespace-pre-wrap" style={{ overflowWrap: "anywhere" }}>{order.description}</p>
        </div>
        {order.photos.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-2">Photos</p>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {order.photos.map((p) => (
                <li key={p.id}>
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-[var(--radius-card)] border border-line bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage link */}
                    <img src={p.url} alt={p.fileName} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-ink-muted">Photo links last 15 minutes. Reload the page if one does not open.</p>
          </div>
        )}
      </Card>}
    </div>
  );
}
