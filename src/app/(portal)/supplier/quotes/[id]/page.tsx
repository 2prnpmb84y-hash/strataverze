import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getQuoteRequestById, hasSupplierQuoted } from "@/lib/queries/supplier";
import { Card, CardHeader } from "@/components/ui/card";
import { SubmitQuoteForm } from "./submit-quote-form";

const urgencyColours: Record<string, string> = {
  URGENT: "bg-danger/10 text-danger",
  STANDARD: "bg-gold-100 text-gold-500",
  FLEXIBLE: "bg-success/10 text-success",
};

const quoteStatusConfig: Record<string, { label: string; className: string }> = {
  SUBMITTED: { label: "Submitted", className: "bg-gold-100 text-gold-500" },
  ACCEPTED: { label: "Accepted", className: "bg-success/10 text-success" },
  DECLINED: { label: "Declined", className: "bg-danger/10 text-danger" },
  WITHDRAWN: { label: "Withdrawn", className: "bg-muted text-muted-foreground" },
};

export default async function QuoteRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const quoteRequest = await getQuoteRequestById(id);
  if (!quoteRequest) notFound();

  const alreadyQuoted = await hasSupplierQuoted(id, profile.id);

  return (
    <div className="max-w-4xl">
      <Link
        href="/supplier/quotes"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        &larr; Back to Quote Requests
      </Link>

      <Card className="mb-6">
        <CardHeader
          title={quoteRequest.title}
          description={quoteRequest.scheme?.name}
        />

        {quoteRequest.description && (
          <p className="text-sm text-foreground mb-4 whitespace-pre-wrap">
            {quoteRequest.description}
          </p>
        )}

        <div className="flex flex-wrap gap-3 text-sm">
          {quoteRequest.category && (
            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {quoteRequest.category}
            </span>
          )}
          {quoteRequest.urgency && (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${urgencyColours[quoteRequest.urgency] ?? "bg-muted text-muted-foreground"}`}
            >
              {quoteRequest.urgency}
            </span>
          )}
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              quoteRequest.status === "OPEN"
                ? "bg-success/10 text-success"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {quoteRequest.status}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-4 border-t border-border">
          {quoteRequest.budget && (
            <div>
              <p className="text-xs text-muted-foreground">Budget</p>
              <p className="text-sm font-medium text-foreground">
                {quoteRequest.budget}
              </p>
            </div>
          )}
          {quoteRequest.closesAt && (
            <div>
              <p className="text-xs text-muted-foreground">Closing Date</p>
              <p className="text-sm font-medium text-foreground">
                {new Date(String(quoteRequest.closesAt)).toLocaleDateString(
                  "en-AU",
                  { day: "numeric", month: "long", year: "numeric" },
                )}
              </p>
            </div>
          )}
          {quoteRequest.workOrder && (
            <div>
              <p className="text-xs text-muted-foreground">Work Order</p>
              <p className="text-sm font-medium text-foreground">
                {quoteRequest.workOrder.title}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Existing quotes */}
      <Card className="mb-6">
        <CardHeader
          title="Quotes"
          description={`${quoteRequest.quotes?.length ?? 0} quote${(quoteRequest.quotes?.length ?? 0) === 1 ? "" : "s"} submitted`}
        />

        {quoteRequest.quotes && quoteRequest.quotes.length > 0 ? (
          <div className="flex flex-col gap-2">
            {quoteRequest.quotes.map((quote) => {
              const status =
                quoteStatusConfig[quote.status] ?? quoteStatusConfig.SUBMITTED;

              return (
                <div
                  key={quote.id}
                  className="flex items-center justify-between rounded-lg bg-muted px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      ${Number(quote.amount).toLocaleString("en-AU", {
                        minimumFractionDigits: 2,
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {quote.supplier?.firstName} {quote.supplier?.lastName}
                      {quote.description && ` — ${quote.description}`}
                    </p>
                    {quote.estimatedDays != null && (
                      <p className="text-xs text-muted-foreground">
                        Est. {quote.estimatedDays} day
                        {quote.estimatedDays === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}
                  >
                    {status.label}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No quotes have been submitted yet. Be the first to respond.
          </p>
        )}
      </Card>

      {/* Submit quote form */}
      {quoteRequest.status === "OPEN" && !alreadyQuoted && (
        <Card>
          <CardHeader
            title="Submit Your Quote"
            description="Provide your pricing and details below."
          />
          <SubmitQuoteForm quoteRequestId={id} />
        </Card>
      )}

      {alreadyQuoted && (
        <Card>
          <p className="text-sm text-muted-foreground">
            You have already submitted a quote for this request.
          </p>
        </Card>
      )}
    </div>
  );
}
