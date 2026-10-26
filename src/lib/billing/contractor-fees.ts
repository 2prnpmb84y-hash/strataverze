/**
 * StrataVerze charges to contractor businesses (server side): the contractor
 * plan and the annual compliance verification charge.
 *
 * The contractor confirms the compliance verification charge when accepting
 * the membership terms. That confirmation is kept as a ContractorDeclaration
 * (type COMPLIANCE_VERIFICATION_FEE, version "fee:<cents>") and is the
 * disclosure for the first charge at approval and for each yearly renewal,
 * provided the price has not changed since.
 */
import { db } from "@/prisma/db";
import { platformToday } from "@/lib/jurisdiction/time-zone";
import { and } from "@prisma/orm-postgres/orm-client";
import type { Numeric, TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { fromCents } from "./money";
import { billingCaptureEnabled, loadPriceBook } from "./capture";
import { feeIdempotencyKey, usageFee, type FeeQuote } from "./fee-engine";
import { resolvePrice } from "./price-book";

type Orm = typeof db.orm;

const numeric = (cents: number) => String(fromCents(cents)) as unknown as Numeric<12, 2>;
const ts = (iso: string) => iso as unknown as TimestampString<3>;
const isoTime = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? ""));
// StrataVerze's own billing day (not UTC).
const today = () => platformToday();

export const COMPLIANCE_FEE_DECLARATION = "COMPLIANCE_VERIFICATION_FEE";

/** Version string recording the amount (incl. GST, cents) the contractor confirmed. */
export const complianceFeeVersion = (cents: number) => `fee:${cents}`;

export function parseComplianceFeeVersion(version: string | null | undefined): number | null {
  const match = /^fee:(\d+)$/.exec(String(version ?? ""));
  return match ? Number(match[1]) : null;
}

/** The compliance verification charge today (from the price book), or null when switched off. */
export async function quoteComplianceFee(orm: Orm = db.orm): Promise<FeeQuote | null> {
  return usageFee({ code: "COMPLIANCE_VERIFICATION", priceBook: await loadPriceBook(orm), date: today() });
}

/** The contractor plan price in force today, in cents, and whether it includes GST. */
export async function contractorPlanPrice(orm: Orm = db.orm): Promise<{ cents: number; gstInclusive: boolean } | null> {
  const entry = resolvePrice(await loadPriceBook(orm), { code: "SUPPLIER_PLAN", date: today() });
  if (!entry || entry.amountCents == null) return null;
  return { cents: entry.amountCents, gstInclusive: entry.gstInclusive };
}

/** The contractor's confirmation of the compliance verification charge, if any. */
async function complianceDisclosure(orm: Orm, contractorBusinessId: string) {
  const decl = await orm.public.ContractorDeclaration
    .where((d) =>
      and(
        d.contractorBusinessId.eq(contractorBusinessId),
        d.declarationType.eq(COMPLIANCE_FEE_DECLARATION),
        d.accepted.eq(true),
      ),
    )
    .orderBy((d) => d.createdAt.desc())
    .first();
  const amountCents = parseComplianceFeeVersion(decl?.documentVersion);
  if (!decl || amountCents == null || !decl.acceptedById || !decl.acceptedAt) return null;
  return { shownToId: decl.acceptedById, shownAt: isoTime(decl.acceptedAt), amountCents };
}

export type ComplianceChargeOutcome = "CHARGED" | "ALREADY_CHARGED" | "OFF" | "NOT_CONFIRMED" | "PRICE_CHANGED";

/**
 * Record compliance verification charge number `year` (1 at approval) for a
 * contractor. Charged only when capture is on and the contractor confirmed
 * the current price. Pass the transaction's orm.
 */
export async function chargeComplianceVerification(
  orm: Orm,
  input: { contractorBusinessId: string; year: number; actorId: string | null },
): Promise<ComplianceChargeOutcome> {
  if (!billingCaptureEnabled()) return "OFF";
  const quote = await quoteComplianceFee(orm);
  if (!quote) return "OFF";

  const sourceType = "ComplianceVerificationYear";
  const sourceId = `${input.contractorBusinessId}_Y${input.year}`;
  const idempotencyKey = feeIdempotencyKey({ code: quote.code, variant: quote.variant, sourceType, sourceId });
  const existing = await orm.public.PlatformFeeEvent.where((e) => e.idempotencyKey.eq(idempotencyKey)).first();
  if (existing) return "ALREADY_CHARGED";

  const disclosure = await complianceDisclosure(orm, input.contractorBusinessId);
  if (!disclosure) return "NOT_CONFIRMED";
  if (disclosure.amountCents !== quote.totalCents) return "PRICE_CHANGED";

  await orm.public.PlatformFeeEvent.create({
    schemeId: null,
    contractorBusinessId: input.contractorBusinessId,
    code: quote.code,
    variant: quote.variant,
    description: input.year === 1 ? quote.description : `${quote.description} (year ${input.year})`,
    sourceType,
    sourceId,
    quantity: 1,
    amountExGst: numeric(quote.exGstCents),
    gstAmount: numeric(quote.gstCents),
    payerType: "SUPPLIER",
    payerProfileId: null,
    recoverableFromOwner: false,
    status: "ACCRUED",
    reversalOfId: null,
    disclosureShownToId: disclosure.shownToId,
    disclosureShownAt: ts(disclosure.shownAt),
    disclosedAmount: numeric(disclosure.amountCents),
    createdById: input.actorId,
    idempotencyKey,
  });
  return "CHARGED";
}

/**
 * Accrue the yearly compliance verification renewal for approved contractors
 * whose last charge is a year old. Safe to run daily.
 */
export async function accrueComplianceRenewals(now: Date = new Date()): Promise<{ charged: number }> {
  if (!billingCaptureEnabled()) return { charged: 0 };
  const events = await db.orm.public.PlatformFeeEvent
    .where((e) => and(e.code.eq("COMPLIANCE_VERIFICATION"), e.sourceType.eq("ComplianceVerificationYear")))
    .limit(20000)
    .all();

  // Latest year charged per contractor.
  const latest = new Map<string, { year: number; at: number }>();
  for (const e of events) {
    if (!e.contractorBusinessId) continue;
    const year = Number(/_Y(\d+)$/.exec(e.sourceId)?.[1] ?? 0);
    const at = new Date(isoTime(e.occurredAt)).getTime();
    const current = latest.get(e.contractorBusinessId);
    if (!current || year > current.year) latest.set(e.contractorBusinessId, { year, at });
  }

  let charged = 0;
  for (const [contractorBusinessId, last] of latest) {
    const due = new Date(last.at);
    due.setUTCFullYear(due.getUTCFullYear() + 1);
    if (now.getTime() < due.getTime()) continue;
    const business = await db.orm.public.ContractorBusiness.where((b) => b.id.eq(contractorBusinessId)).first();
    if (business?.status !== "APPROVED") continue;
    const outcome = await db.transaction((tx) =>
      chargeComplianceVerification(tx.orm, { contractorBusinessId, year: last.year + 1, actorId: null }),
    );
    if (outcome === "CHARGED") charged += 1;
  }
  return { charged };
}

/** A contractor business's StrataVerze charges, newest first. */
export async function getContractorFeeEvents(contractorBusinessId: string) {
  return db.orm.public.PlatformFeeEvent
    .where((e) => e.contractorBusinessId.eq(contractorBusinessId))
    .orderBy((e) => e.occurredAt.desc())
    .limit(200)
    .all();
}

/**
 * Whether a contractor still needs to confirm today's compliance verification
 * price: they accepted the membership terms but never confirmed this amount
 * (for example, they joined before the charge existed, or the price changed).
 */
export async function complianceConfirmationNeeded(contractorBusinessId: string): Promise<FeeQuote | null> {
  const [quote, membership] = await Promise.all([
    quoteComplianceFee(),
    db.orm.public.ContractorMembership.where((m) => m.contractorBusinessId.eq(contractorBusinessId)).first(),
  ]);
  if (!quote || !membership?.acceptedAt) return null;
  const disclosure = await complianceDisclosure(db.orm, contractorBusinessId);
  return disclosure && disclosure.amountCents === quote.totalCents ? null : quote;
}

/** Year 1 has not been charged yet for this contractor. */
export async function firstComplianceChargeMissing(orm: Orm, contractorBusinessId: string): Promise<boolean> {
  const existing = await orm.public.PlatformFeeEvent
    .where((e) => and(e.contractorBusinessId.eq(contractorBusinessId), e.code.eq("COMPLIANCE_VERIFICATION")))
    .first();
  return !existing;
}
