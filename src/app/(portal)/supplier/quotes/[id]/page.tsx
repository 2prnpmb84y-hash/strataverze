import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getQuoteRequestForSupplier } from "@/lib/queries/supplier";
import { isQuoteRequestOpen, supplierMaySeeQuoteRequest } from "@/lib/supplier/quote-visibility";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import { Card, CardHeader } from "@/components/ui/card";
import { SubmitQuoteForm } from "./submit-quote-form";
import { WithdrawQuoteButton } from "./withdraw-button";

const urgencyColours: Record<string, string> = {
  URGENT: "bg-danger/10 text-danger",
  STANDARD: "bg-gold-100 text-gold-500",
  FLEXIBLE: "bg-success/10 text-success",
};

const quoteStatusConfig: Record<string, { label: string; className: string }> = {
  SUBMITTED: { label: "Submitted", className: "bg-gold-100 text-gold-500" },
  ACCEPTED: { label: "Accepted", className: "bg-success/10 text-success" },
  DECLINED: { label: "Declined", className: "bg-danger/10 text-danger" },
  WITHDRAWN: { label: "Withdrawn", className: "bg-muted text-ink-muted" },
};

export default async function QuoteRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  // Only the caller's own quote and a count of the others (F3).
  const quoteRequest = await getQuoteRequestForSupplier(id, profile.id);
  if (!quoteRequest) notFound();

  // Verify supplier has an active membership on this scheme (F-04)
  const membership = await db.orm.public.SchemeMembership
    .where((m) =>
      and(
        m.profileId.eq(profile.id),
        m.schemeId.eq(quoteRequest.schemeId),
        m.role.eq("SUPPLIER"),
        m.isActive.eq(true),
      ),
    )
    .first();

  if (!membership) notFound();

  // The supplier's own quote, if they submitted one.
  const supplierQuote = quoteRequest.ownQuote;
  const alreadyQuoted = !!supplierQuote;

  // A request is visible while it is open, or afterwards to a supplier who quoted.
  if (!supplierMaySeeQuoteRequest(quoteRequest, alreadyQuoted)) notFound();
  const isOpen = isQuoteRequestOpen(quoteRequest);
  const otherCount = quoteRequest.otherQuoteCount;

  return (
    <div className="max-w-4xl">
      <Link
        href="/supplier/quotes"
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink transition-colors mb-6"
      >
        &larr; Back to Quote Requests
      </Link>

      <Card className="mb-6">
        <CardHeader
          title={quoteRequest.title}
          description={quoteRequest.scheme?.name}
        />

        {quoteRequest.description && (
          <p className="text-sm text-ink mb-4 whitespace-pre-wrap">
            {quoteRequest.description}
          </p>
        )}

        <div className="flex flex-wrap gap-3 text-sm">
          {quoteRequest.category && (
            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-ink-muted">
              {quoteRequest.category}
            </span>
          )}
          {quoteRequest.urgency && (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${urgencyColours[quoteRequest.urgency] ?? "bg-muted text-ink-muted"}`}
            >
              {quoteRequest.urgency}
            </span>
          )}
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              quoteRequest.status === "OPEN"
                ? "bg-success/10 text-success"
                : "bg-muted text-ink-muted"
            }`}
          >
            {quoteRequest.status}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-4 border-t border-line">
          {quoteRequest.budget && (
            <div>
              <p className="text-xs text-ink-muted">Budget</p>
              <p className="text-sm font-medium text-ink">
                {quoteRequest.budget}
              </p>
            </div>
          )}
          {quoteRequest.closesAt && (
            <div>
              <p className="text-xs text-ink-muted">Closing Date</p>
              <p className="text-sm font-medium text-ink">
                {new Date(String(quoteRequest.closesAt)).toLocaleDateString(
                  "en-AU",
                  { day: "numeric", month: "long", year: "numeric" },
                )}
              </p>
            </div>
          )}
          {quoteRequest.workOrder && (
            <div>
              <p className="text-xs text-ink-muted">Work Order</p>
              <p className="text-sm font-medium text-ink">
                {quoteRequest.workOrder.title}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* The supplier's own quote. Other suppliers' quotes are never shown, only counted. */}
      <Card className="mb-6">
        <CardHeader
          title="Your Quote"
          description={`${otherCount} other quote${otherCount === 1 ? "" : "s"} submitted`}
        />

        {supplierQuote ? (
          (() => {
            const status =
              quoteStatusConfig[supplierQuote.status] ?? quoteStatusConfig.SUBMITTED;
            return (
              <div className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">
                    ${Number(supplierQuote.amount).toLocaleString("en-AU", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                  {supplierQuote.description && (
                    <p className="text-xs text-ink-muted mt-0.5">
                      {supplierQuote.description}
                    </p>
                  )}
                  {supplierQuote.estimatedDays != null && (
                    <p className="text-xs text-ink-muted">
                      Est. {supplierQuote.estimatedDays} day
                      {supplierQuote.estimatedDays === 1 ? "" : "s"}
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
          })()
        ) : (
          <p className="text-sm text-ink-muted">
            You have not submitted a quote for this request yet.
          </p>
        )}
      </Card>

      {/* Submit quote form */}
      {isOpen && !alreadyQuoted && (
        <Card>
          <CardHeader
            title="Submit Your Quote"
            description="Provide your pricing and details below."
          />
          <SubmitQuoteForm quoteRequestId={id} />
        </Card>
      )}

      {alreadyQuoted && supplierQuote && (
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink-muted">
              You have already submitted a quote for this request.
            </p>
            {supplierQuote.status === "SUBMITTED" && (
              <WithdrawQuoteButton quoteId={supplierQuote.id} />
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
