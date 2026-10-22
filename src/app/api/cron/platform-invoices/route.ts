import { NextResponse, type NextRequest } from "next/server";
import { notifyIssuedInvoices, runMonthlyInvoices } from "@/lib/billing/invoice-run";
import { sydneyMonth } from "@/lib/billing/invoice";
import { accrueComplianceRenewals } from "@/lib/billing/contractor-fees";

/**
 * Monthly StrataVerze invoicing and yearly contractor compliance renewals,
 * called by Vercel Cron (see vercel.json).
 *
 * Runs daily and invoices the current Sydney month for any scheme not yet
 * invoiced, so a missed or repeated cron call does no harm. Switched off
 * unless PLATFORM_INVOICING=on. Vercel sends CRON_SECRET as a bearer token.
 */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  // Yearly contractor compliance verification renewals (only while capture is on).
  const renewals = await accrueComplianceRenewals();

  if (process.env.PLATFORM_INVOICING !== "on") {
    return NextResponse.json({ complianceRenewals: renewals.charged, invoicing: "PLATFORM_INVOICING is not on" });
  }

  const requested = request.nextUrl.searchParams.get("month");
  const current = sydneyMonth(new Date());
  // A month can be re-run or caught up, but never invoiced ahead of time.
  const month = requested && /^\d{4}-\d{2}$/.test(requested) && requested <= current ? requested : current;

  const results = await runMonthlyInvoices(month);
  await notifyIssuedInvoices(month, results);

  const count = (o: string) => results.filter((r) => r.outcome === o).length;
  return NextResponse.json({
    month,
    complianceRenewals: renewals.charged,
    issued: count("ISSUED"),
    alreadyInvoiced: count("ALREADY_INVOICED"),
    skipped: results.filter((r) => r.outcome === "SKIPPED"),
  });
}
