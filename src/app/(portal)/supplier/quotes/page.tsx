import Link from "next/link";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getOpenQuoteRequests } from "@/lib/queries/supplier";
import { Card, CardHeader } from "@/components/ui/card";
import { connection } from "next/server";

export default async function QuoteRequestsPage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const quoteRequests = await getOpenQuoteRequests(profile.id);

  const urgencyOrder: Record<string, number> = {
    URGENT: 0,
    STANDARD: 1,
    FLEXIBLE: 2,
  };

  const sorted = [...quoteRequests].sort(
    (a, b) => (urgencyOrder[a.urgency] ?? 1) - (urgencyOrder[b.urgency] ?? 1),
  );

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold font-heading text-foreground mb-1">
        Quote Requests
      </h1>
      <p className="text-sm text-muted-foreground mb-8">
        Browse open quote requests from owners corporations.
      </p>

      {sorted.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            There are no open quote requests at the moment. Check back soon.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {sorted.map((qr) => {
            const urgencyColour =
              qr.urgency === "URGENT"
                ? "bg-danger/10 text-danger"
                : qr.urgency === "FLEXIBLE"
                  ? "bg-success/10 text-success"
                  : "bg-gold-100 text-gold-500";

            return (
              <Card key={qr.id}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/supplier/quotes/${qr.id}`}
                      className="text-sm font-semibold text-foreground hover:text-supplier transition-colors"
                    >
                      {qr.title}
                    </Link>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {qr.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {qr.category}
                      </span>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${urgencyColour}`}>
                        {qr.urgency}
                      </span>
                      {qr.budget && (
                        <span className="text-xs text-muted-foreground">
                          Budget: {qr.budget}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {qr.quotes?.length ?? 0} quote
                        {(qr.quotes?.length ?? 0) === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-muted-foreground">
                      {qr.scheme?.name}
                    </p>
                    {qr.closesAt && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Closes{" "}
                        {new Date(String(qr.closesAt)).toLocaleDateString(
                          "en-AU",
                          { day: "numeric", month: "short" },
                        )}
                      </p>
                    )}
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
