import type { NextRequest } from "next/server";
import { db } from "@/prisma/db";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { generateRemittancePdf } from "@/lib/pdf/generate";
import { canReadSchemeFinance } from "@/lib/finance/finance-access";
import { forbidden } from "@/lib/finance/access-denied";
import { notFound, pdfResponse, signIn, UUID } from "@/lib/pdf/response";

/** The remittance advice for a paid (or part paid) supplier invoice. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) return signIn();
  const { invoiceId } = await params;
  if (!UUID.test(invoiceId)) return notFound();
  const invoice = await db.orm.public.SupplierInvoice.where((i) => i.id.eq(invoiceId)).first();
  if (!invoice) return notFound();
  if (!(await canReadSchemeFinance(profile, invoice.schemeId))) {
    return forbidden({ schemeId: invoice.schemeId, actorId: profile.id, entityType: "SupplierInvoice", entityId: invoice.id, what: "Remittance advice PDF" });
  }
  const pdf = await generateRemittancePdf(invoiceId, profile.id);
  return pdf ? pdfResponse(pdf) : notFound();
}
