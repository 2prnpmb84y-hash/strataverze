import Link from "next/link";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getQuotesBySupplier } from "@/lib/queries/supplier";
import { Card, CardHeader } from "@/components/ui/card";

const statusConfig: Record<string, { label: string; className: string }> = {
  SUBMITTED: { label: "Pending", className: "bg-gold-100 text-gold-500" },
  ACCEPTED: { label: "Accepted", className: "bg-success/10 text-success" },
  DECLINED: { label: "Declined", className: "bg-danger/10 text-danger" },
  WITHDRAWN: { label: "Withdrawn", className: "bg-muted text-muted-foreground" },
};

export default async function MyQuotesPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const quotes = await getQuotesBySupplier(profile.id);

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold font-heading text-foreground mb-1">
        My Quotes
      </h1>
      <p className="text-sm text-muted-foreground mb-8">
        Track the status of quotes you have submitted.
      </p>

      {quotes.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            You have not submitted any quotes yet. Browse{" "}
            <Link
              href="/supplier/quotes"
              className="text-supplier hover:underline"
            >
              open quote requests
            </Link>{" "}
            to get started.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {quotes.map((q) => {
            const status = statusConfig[q.status] ?? statusConfig.SUBMITTED;

            return (
              <Card key={q.id}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {q.quoteRequest?.title ?? "Quote Request"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {q.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <span className="text-sm font-medium text-foreground">
                        ${Number(q.amount).toLocaleString("en-AU", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                      {q.estimatedDays != null && (
                        <span className="text-xs text-muted-foreground">
                          · {q.estimatedDays} day
                          {q.estimatedDays === 1 ? "" : "s"}
                        </span>
                      )}
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
                        {status.label}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-muted-foreground">
                      {q.quoteRequest?.scheme?.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Submitted{" "}
                      {new Date(String(q.createdAt)).toLocaleDateString(
                        "en-AU",
                        { day: "numeric", month: "short" },
                      )}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
