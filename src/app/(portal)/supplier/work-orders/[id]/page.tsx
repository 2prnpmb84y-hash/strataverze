import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { myContractorBusinessIds, orderForContractor } from "@/lib/works/urgent-orders";
import { Card, CardHeader } from "@/components/ui/card";
import { OrderAnswer } from "@/components/works/order-answer";

const money = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (iso: string) => new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });
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
  const order = await orderForContractor(id, await myContractorBusinessIds(profile.id));
  if (!order) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/supplier/work-orders" className="text-sm text-ink-muted hover:text-ink">← Work orders</Link>
        <h1 className="text-2xl font-bold font-heading text-ink mt-2 mb-1">{order.title}</h1>
        <p className="text-sm text-ink-muted">
          Urgent work order {order.workOrderNumber} · sent {when(order.issuedAt)} · {order.statusLabel}
        </p>
      </div>

      {order.status === "AWAITING_ACKNOWLEDGEMENT" && (
        <Card>
          <CardHeader title="Can you take this job?" description="The building is waiting for your answer." />
          <OrderAnswer workOrderId={order.id} />
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
