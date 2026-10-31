import { NextResponse, type NextRequest } from "next/server";
import { NO_STORE } from "@/lib/http/no-store";
import { bearerMatches } from "@/lib/auth/secret-compare";
import { notifyIssuedInvoices, runMonthlyInvoices } from "@/lib/billing/invoice-run";
import { sydneyMonth } from "@/lib/billing/invoice";
import { accrueComplianceRenewals } from "@/lib/billing/contractor-fees";
import { strataVerzeGstRegistered } from "@/lib/billing/strataverze-supplier";
import { removeExpiredUploads } from "@/lib/storage/uploads";
import { inactiveSchemeIds } from "@/lib/schemes/inactive";

/**
 * Monthly StrataVerze invoicing and yearly contractor compliance renewals,
 * called by Vercel Cron (see vercel.json). Also removes uploads that were
 * prepared but never used (S3), so one daily job covers both.
 *
 * Runs daily and invoices the current Sydney month for any scheme not yet
 * invoiced, so a missed or repeated cron call does no harm. Switched off
 * unless PLATFORM_INVOICING=on. Vercel sends CRON_SECRET as a bearer token.
 * A switched off scheme is not invoiced and its uploads are left; it is
 * listed under skippedSchemes (and, when invoicing, under skipped).
 */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  // Constant-time comparison (S7, SEC-027).
  if (!bearerMatches(request.headers.get("authorization"), secret)) {
    return new NextResponse("Unauthorized", { status: 401, headers: NO_STORE });
  }
  const skippedSchemes = await inactiveSchemeIds();
  // Uploads never used, once their signed link has expired (S3). A failure
  // here must not stop invoicing.
  try {
    const removed = await removeExpiredUploads();
    if (removed > 0) console.info(`[storage] removed ${removed} unused uploads`);
  } catch (err) {
    console.error("[storage] unused upload clean-up failed:", err instanceof Error ? err.name : "error");
  }

  // Yearly contractor compliance verification renewals (only while capture is on).
  const renewals = await accrueComplianceRenewals();

  // StrataVerze prices add GST, so nothing is invoiced until it is registered.
  if (process.env.PLATFORM_INVOICING === "on" && !strataVerzeGstRegistered()) {
    return NextResponse.json({ complianceRenewals: renewals.charged, invoicing: "StrataVerze is not registered for GST (STRATAVERZE_GST_REGISTERED)", skippedSchemes }, { headers: NO_STORE });
  }
  if (process.env.PLATFORM_INVOICING !== "on") {
    return NextResponse.json({ complianceRenewals: renewals.charged, invoicing: "PLATFORM_INVOICING is not on", skippedSchemes }, { headers: NO_STORE });
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
    skippedSchemes,
  }, { headers: NO_STORE });
}
