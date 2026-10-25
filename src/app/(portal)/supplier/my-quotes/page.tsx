import { redirect } from "next/navigation";

/**
 * Quotes now live with their jobs (works marketplace stage 3, 25 Oct 2026):
 * "Invited to quote" on the quote requests page lists each one and its result.
 */
export default function SupplierMyQuotesPage() {
  redirect("/supplier/quotes");
}
