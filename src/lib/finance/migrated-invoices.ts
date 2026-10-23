/**
 * Invoices brought across in a cutover, as basis entries (server). Their
 * payable is in the opening trial balance, so they have no approval entry in
 * the ledger. Cash basis reports need their expense lines to recognise the
 * expense when they are paid (see RecognitionInput.extraInvoices).
 */
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { BasisEntry } from "./accounting-basis";

const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);

export async function migratedInvoiceEntries(schemeId: string): Promise<BasisEntry[]> {
  const invoices = await db.orm.public.SupplierInvoice
    .where((i) => and(i.schemeId.eq(schemeId), i.migrationBatchId.isNotNull()))
    .include("accountCode")
    .limit(20000)
    .all();
  return invoices
    .filter((i) => i.accountCode)
    .map((i) => {
      const total = cents(i.totalAmount);
      const gst = cents(i.gstAmount);
      const a = i.accountCode!;
      return {
        id: `migrated-invoice:${i.id}`,
        date: String(i.invoiceDate).slice(0, 10),
        sourceType: "INVOICE",
        sourceId: i.id,
        lines: [
          { accountId: a.id, accountCode: String(a.code), accountName: String(a.name), accountType: String(a.accountType), accountSubType: a.accountSubType ?? null, fundId: i.fundId, debitCents: total - gst, creditCents: 0 },
          { accountId: "accounts-payable", accountCode: "", accountName: "Accounts payable", accountType: "LIABILITY", accountSubType: "ACCOUNTS_PAYABLE", fundId: i.fundId, debitCents: 0, creditCents: total },
        ],
      };
    });
}
