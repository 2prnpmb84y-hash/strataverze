import Link from "next/link";
import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { myContractorBusinessIds, ordersForContractor } from "@/lib/works/urgent-orders";
import { Card, CardHeader } from "@/components/ui/card";

const money = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function chip(status: string) {
  if (status === "AWAITING_ACKNOWLEDGEMENT") return "bg-amber-100 text-amber-800";
  if (status === "DECLINED" || status === "CANCELLED") return "bg-muted text-ink-muted";
  return "bg-mint-soft text-turquoise";
}

function OrderList({ rows }: { rows: Awaited<ReturnType<typeof ordersForContractor>> }) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((o) => (
        <li key={o.id}>
          <Link href={`/supplier/work-orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] bg-muted px-4 py-3 hover:bg-muted/70 transition-colors">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink truncate">
                {o.workOrderNumber}: {o.title}
              </p>
              <p className="text-xs text-ink-muted">
                {o.building}
                {o.amountLimit != null ? ` · Not to exceed ${money(o.amountLimit)}` : ""}
              </p>
            </div>
            <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${chip(o.status)}`}>{o.statusLabel}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Work orders sent to the contractor's business (works marketplace stage 2,
 * 25 Oct 2026): urgent orders to accept or decline, then the jobs accepted.
 */
export default async function SupplierWorkOrdersPage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const orders = await ordersForContractor(await myContractorBusinessIds(profile.id));
  const toAnswer = orders.filter((o) => o.status === "AWAITING_ACKNOWLEDGEMENT");
  const rest = orders.filter((o) => o.status !== "AWAITING_ACKNOWLEDGEMENT");

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-ink mb-1">Work Orders</h1>
        <p className="text-sm text-ink-muted">Work orders buildings have sent your business.</p>
      </div>
      {orders.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-muted">No work orders yet. When a building chooses your business for urgent works, the order appears here and you are emailed.</p>
        </Card>
      ) : (
        <>
          {toAnswer.length > 0 && (
            <Card>
              <CardHeader title="Waiting for your answer" description="Accept or decline as soon as you can. The building is waiting." />
              <OrderList rows={toAnswer} />
            </Card>
          )}
          {rest.length > 0 && (
            <Card>
              <CardHeader title="All work orders" />
              <OrderList rows={rest} />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
