import { NextResponse, type NextRequest } from "next/server";
import { NO_STORE } from "@/lib/http/no-store";
import { recordSecurityEventLater } from "@/lib/audit/security-audit";
import { db } from "@/prisma/db";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getPlatformInvoiceWithLines } from "@/lib/queries/platform-billing";
import { canViewSchemeBilling } from "@/lib/billing/access";
import { renderInvoicePdf } from "@/lib/billing/invoice-pdf";

/**
 * The PDF of a StrataVerze invoice. Only people who may see the scheme's
 * StrataVerze billing (owners, committee, advisers, accountants of that
 * scheme, or a platform admin) can download it.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) return new NextResponse("Sign in to view this invoice.", { status: 401, headers: NO_STORE });

  const { invoiceId } = await params;
  const invoice = await getPlatformInvoiceWithLines(invoiceId);
  if (!invoice) return new NextResponse("Not found", { status: 404, headers: NO_STORE });

  const memberships = await db.orm.public.SchemeMembership
    .where((m) => m.profileId.eq(profile.id))
    .limit(1000)
    .all();
  if (!canViewSchemeBilling(memberships, invoice.schemeId, profile.isPlatformAdmin)) {
    await recordSecurityEventLater({
      action: "access.denied",
      outcome: "denied",
      actorProfileId: profile.id,
      schemeId: invoice.schemeId,
      resourceType: "PlatformInvoice",
      resourceId: invoiceId,
      reason: "cannot see this building's billing",
    });
    // Same response as a missing invoice, so ids cannot be probed.
    return new NextResponse("Not found", { status: 404, headers: NO_STORE });
  }

  await recordSecurityEventLater({
    action: "export.pdf",
    outcome: "allowed",
    actorProfileId: profile.id,
    schemeId: invoice.schemeId,
    resourceType: "PlatformInvoice",
    resourceId: invoiceId,
    metadata: { kind: "platform_invoice" },
  });
  const bytes = await renderInvoicePdf(invoice);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="StrataVerze-${invoice.invoiceNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
