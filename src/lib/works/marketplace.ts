/**
 * Marketplace quotes (works marketplace stage 3, 25 Oct 2026; plan:
 * https://claude.ai/artifact/VAj6SJ5PrsVry3HJ5RAYbF).
 *
 * When the committee decides to get quotes, an RFQ opens on the
 * marketplace. Approved contractors who list the trade and work in the
 * building's postcode see the committee's summary, the suburb and the
 * photos, and express interest. The committee (or the Adviser) invites some
 * (3 by default); invited contractors see the address and a contact, and
 * quote by the deadline. The committee approves one quote by vote (two
 * quotes are needed over $30,000), and a work order goes to that contractor.
 *
 * Every change of state is one UPDATE with its whole filter, and unique
 * indexes allow one interest, invitation and quote per contractor and one
 * open RFQ per request. Callers authorise first.
 */
import { and } from "@prisma/orm-postgres/orm-client";
import { endOfDayIn, PLATFORM_TIME_ZONE } from "@/lib/jurisdiction/time-zone";
import { schemeTimeZone, schemeTimeZones, timeZoneOf } from "@/lib/jurisdiction/scheme-time";
import type { Numeric, TimestampString, Varchar } from "@prisma/orm-postgres/target/codec-types";
import { db } from "@/prisma/db";
import { MARKETPLACE_DEFAULTS } from "@/config/works";
import { rulesForScheme } from "@/lib/jurisdiction/scheme-rules";
import { consumeUpload, verifyUpload } from "@/lib/storage/uploads";
import { signDownloads } from "@/lib/storage/server-storage";
import { schemeStoragePathProblem } from "@/lib/queries/document-url";
import { requestPhotos } from "./requests";
import { buildingQuoteRule } from "./quote-rule-repo";
import { quoteRuleSentence, quotesProblem } from "./quote-rule";

const ts = (v: string | Date) => (typeof v === "string" ? v : v.toISOString()) as unknown as TimestampString<3>;
const vc = <N extends number>(v: string) => v as unknown as Varchar<N>;
const money = (v: number) => v.toFixed(2) as unknown as Numeric<12, 2>;
const DAY = 86_400_000;

/** The last minute (11.59 pm) of a calendar day in the building's time zone. */
export function buildingEndOfDay(timeZone: string, date: string): Date | null {
  return endOfDayIn(timeZone, date);
}

export class MarketplaceError extends Error {}

function isUniqueViolation(err: unknown): boolean {
  const text = err instanceof Error ? `${err.message} ${JSON.stringify((err as { cause?: unknown }).cause ?? "")} ${String((err as { code?: unknown }).code ?? "")}` : String(err);
  return /23505|unique|duplicate key/i.test(text);
}

/** Marketplace RFQ states: open for interest, invited contractors quoting, quotes closed, a quote approved, or cancelled. */
export const RFQ_OPEN_STATUSES = ["INTEREST", "QUOTING", "CLOSED"] as const;
const ACTIVE_INVITE = ["PENDING", "ACCEPTED"];

export function rfqStatusLabel(rfq: { status: string; interestClosesAt?: unknown; quoteClosesAt?: unknown }, now = new Date()): string {
  switch (rfq.status) {
    case "INTEREST":
      return rfq.interestClosesAt && new Date(String(rfq.interestClosesAt)) > now ? "Open for interest" : "Interest closed: choose who to invite";
    case "QUOTING":
      return rfq.quoteClosesAt && new Date(String(rfq.quoteClosesAt)) > now ? "Invited contractors quoting" : "Quotes closed";
    case "CLOSED":
      return "Quotes closed";
    case "AWARDED":
      return "Quote approved";
    case "CANCELLED":
      return "Cancelled";
    default:
      return rfq.status;
  }
}

/** The committee's summary for contractors, kept on the QUOTES decision as JSON. */
export function encodeSummary(title: string, body: string): string {
  return JSON.stringify({ title: title.trim().slice(0, 300), body: body.trim().slice(0, 5000) });
}
export function decodeSummary(value: unknown): { title: string; body: string } | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const v = JSON.parse(value);
    return typeof v?.title === "string" && typeof v?.body === "string" ? { title: v.title, body: v.body } : null;
  } catch {
    return null;
  }
}

/** Postcodes from a form field: 4 digits each, separated by commas, spaces or new lines. */
export function parsePostcodes(text: unknown): { ok: true; value: string[] } | { ok: false; error: string } {
  const parts = String(text ?? "").split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean);
  const bad = parts.filter((p) => !/^\d{4}$/.test(p));
  if (bad.length) return { ok: false, error: `Postcodes are 4 digits. Check: ${bad.slice(0, 5).join(", ")}` };
  const value = [...new Set(parts)].sort();
  if (value.length > 300) return { ok: false, error: "List up to 300 postcodes." };
  return { ok: true, value };
}

type Business = { id: string; status: string; deletedAt?: unknown; tradeCategories?: unknown; servicePostcodes?: unknown; tradingName?: unknown; companyName?: unknown; suburb?: unknown };
const businessName = (b: Business | null | undefined) => String(b?.tradingName || b?.companyName || "Contractor");
const listsTrade = (b: Business, trade: string | null) => !!trade && ((b.tradeCategories as string[] | null) ?? []).some((t) => String(t).trim().toLowerCase() === trade.trim().toLowerCase());
const worksIn = (b: Business, postcode: string | null) => !!postcode && ((b.servicePostcodes as string[] | null) ?? []).includes(postcode);
const isApproved = (b: Business | null | undefined) => !!b && b.status === "APPROVED" && !b.deletedAt;

/** Whether a business may see and express interest in this RFQ. */
export function eligible(b: Business, rfq: { trade?: unknown; postcode?: unknown }): boolean {
  return isApproved(b) && listsTrade(b, rfq.trade ? String(rfq.trade) : null) && worksIn(b, rfq.postcode ? String(rfq.postcode) : null);
}

async function nextRfqNumber(schemeId: string): Promise<string> {
  const rows = await db.orm.public.WorksRfq.where((r) => r.schemeId.eq(schemeId)).limit(100000).all();
  const max = rows.reduce((m, r) => Math.max(m, Number(String(r.rfqNumber).match(/(\d+)$/)?.[1] ?? 0)), 0);
  return `RFQ-${String(max + 1).padStart(4, "0")}`;
}

/** The request's marketplace RFQ (the latest one). */
export async function rfqForRequest(schemeId: string, requestId: string) {
  const rows = await db.orm.public.WorksRfq
    .where((r) => and(r.schemeId.eq(schemeId), r.requestId.eq(requestId), r.marketplace.eq(true)))
    .orderBy((r) => r.createdAt.desc())
    .limit(10)
    .all();
  return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] ?? null;
}

/**
 * Open the marketplace RFQ for a request the committee decided to get
 * quotes for. Contractors see the committee's summary, not the owner's text.
 */
export async function openRfq(input: { schemeId: string; requestId: string; openedById: string; summary: { title: string; body: string }; now?: Date }) {
  const now = input.now ?? new Date();
  const request = await db.orm.public.WorksRequest.where((r) => and(r.id.eq(input.requestId), r.schemeId.eq(input.schemeId), r.deletedAt.isNull())).first();
  if (!request) throw new MarketplaceError("Request not found.");
  if (String(request.status) !== "PROCUREMENT" || request.isEmergency) throw new MarketplaceError("This request is not waiting for quotes.");
  if (!request.trade) throw new MarketplaceError("The request has no kind of work, so contractors cannot be matched. Return it to the owner to add it.");
  const scheme = await db.orm.public.Scheme.where((s) => s.id.eq(input.schemeId)).first();
  if (!scheme?.postcode) throw new MarketplaceError("The building has no postcode, so contractors cannot be matched.");
  const title = input.summary.title.trim() || String(request.title);
  const interestClosesAt = new Date(now.getTime() + MARKETPLACE_DEFAULTS.interestDays * DAY);
  for (let attempt = 0; attempt < 10; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 10 + Math.floor(Math.random() * 40)));
    const rfqNumber = await nextRfqNumber(input.schemeId);
    try {
      return await db.orm.public.WorksRfq.create({
        schemeId: input.schemeId,
        scopeId: null,
        requestId: input.requestId,
        marketplace: true,
        rfqNumber: vc<30>(rfqNumber),
        title: vc<300>(title),
        description: input.summary.body.trim() || null,
        trade: vc<60>(String(request.trade)),
        suburb: scheme.suburb ? vc<100>(String(scheme.suburb)) : null,
        postcode: vc<4>(String(scheme.postcode).slice(0, 4)),
        closingDate: ts(interestClosesAt),
        interestClosesAt: ts(interestClosesAt),
        inviteLimit: MARKETPLACE_DEFAULTS.inviteLimit,
        scopeVersionUsed: 0,
        status: "INTEREST",
        issuedAt: ts(now),
        issuedById: input.openedById,
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const open = await rfqForRequest(input.schemeId, input.requestId);
      if (open && (RFQ_OPEN_STATUSES as readonly string[]).includes(String(open.status))) throw new MarketplaceError("This request is already open for quotes.");
    }
  }
  throw new MarketplaceError("The request could not be numbered. Please try again.");
}

/** Approved businesses that may see an RFQ (trade and postcode match), for the opening email. */
export async function eligibleBusinesses(rfq: { trade?: unknown; postcode?: unknown }) {
  const approved = await db.orm.public.ContractorBusiness.where((c) => and(c.status.eq("APPROVED"), c.deletedAt.isNull())).limit(5000).all();
  return approved.filter((b) => eligible(b, rfq));
}

// ─── The contractor ────────────────────────────────────────────────────────

async function businessesOf(businessIds: string[]) {
  if (!businessIds.length) return [];
  return db.orm.public.ContractorBusiness.where((c) => and(c.id.in(businessIds), c.status.eq("APPROVED"), c.deletedAt.isNull())).limit(50).all();
}

/** Open marketplace jobs these businesses may see, and the ones they were invited to, newest first. */
export async function jobsForContractor(businessIds: string[], now = new Date()) {
  const mine = await businessesOf(businessIds);
  if (!mine.length) return { open: [], invited: [] };
  const ids = mine.map((b) => b.id);
  const openRows = await db.orm.public.WorksRfq.where((r) => and(r.marketplace.eq(true), r.status.eq("INTEREST"))).orderBy((r) => r.createdAt.desc()).limit(1000).all();
  const visible = openRows.filter((r) => r.interestClosesAt && new Date(String(r.interestClosesAt)) > now && mine.some((b) => eligible(b, r)));
  const interests = visible.length ? await db.orm.public.WorksRfqInterest.where((i) => and(i.rfqId.in(visible.map((r) => r.id)), i.contractorBusinessId.in(ids), i.withdrawnAt.isNull())).limit(1000).all() : [];
  const invitations = await db.orm.public.WorksRfqInvitation.where((i) => i.contractorBusinessId.in(ids)).limit(1000).all();
  const invitedRfqs = invitations.length ? await db.orm.public.WorksRfq.where((r) => and(r.id.in([...new Set(invitations.map((i) => i.rfqId))]), r.marketplace.eq(true))).limit(1000).all() : [];
  const quotes = invitedRfqs.length ? await db.orm.public.WorksQuotation.where((q) => and(q.rfqId.in(invitedRfqs.map((r) => r.id)), q.contractorBusinessId.in(ids))).limit(1000).all() : [];
  // Each job's deadlines are shown in its building's time zone.
  const zones = await schemeTimeZones([...visible, ...invitedRfqs].map((r) => r.schemeId));
  const row = (r: (typeof openRows)[number]) => ({
    id: r.id,
    timeZone: zones.get(r.schemeId) ?? PLATFORM_TIME_ZONE,
    rfqNumber: String(r.rfqNumber),
    title: String(r.title),
    trade: r.trade ? String(r.trade) : null,
    suburb: r.suburb ? String(r.suburb) : null,
    status: String(r.status),
    statusLabel: rfqStatusLabel(r, now),
    interestClosesAt: r.interestClosesAt ? String(r.interestClosesAt) : null,
    quoteClosesAt: r.quoteClosesAt ? String(r.quoteClosesAt) : null,
  });
  return {
    open: visible.map((r) => ({ ...row(r), interested: interests.some((i) => i.rfqId === r.id) })),
    invited: invitedRfqs
      .map((r) => {
        const inv = invitations.find((i) => i.rfqId === r.id)!;
        const q = quotes.find((x) => x.rfqId === r.id);
        return { ...row(r), invitationStatus: String(inv.status), quoteStatus: q ? String(q.status) : null, quoteTotal: q ? Number(q.totalAmount) : null };
      })
      .sort((a, b) => String(b.quoteClosesAt ?? "").localeCompare(String(a.quoteClosesAt ?? ""))),
  };
}

/**
 * One marketplace job as a contractor sees it. Before an invitation: the
 * committee's summary, the trade, the suburb and the photos. Once invited:
 * also the address, where in the building, and who to contact.
 */
export async function jobForContractor(rfqId: string, businessIds: string[], now = new Date()) {
  const mine = await businessesOf(businessIds);
  if (!mine.length) return null;
  const rfq = await db.orm.public.WorksRfq.where((r) => and(r.id.eq(rfqId), r.marketplace.eq(true))).first();
  if (!rfq || !rfq.requestId) return null;
  const invitation = await db.orm.public.WorksRfqInvitation.where((i) => and(i.rfqId.eq(rfq.id), i.contractorBusinessId.in(mine.map((b) => b.id)))).first();
  const invited = !!invitation && ACTIVE_INVITE.includes(String(invitation.status));
  const eligibleBusiness = mine.find((b) => eligible(b, rfq)) ?? null;
  const interestOpen = rfq.status === "INTEREST" && !!rfq.interestClosesAt && new Date(String(rfq.interestClosesAt)) > now;
  // Not invited and no longer open to interest: they see nothing more.
  if (!invitation && !(interestOpen && eligibleBusiness)) return null;
  const businessId = invitation?.contractorBusinessId ?? eligibleBusiness!.id;
  const interest = await db.orm.public.WorksRfqInterest.where((i) => and(i.rfqId.eq(rfq.id), i.contractorBusinessId.eq(businessId), i.withdrawnAt.isNull())).first();
  const quote = await db.orm.public.WorksQuotation.where((q) => and(q.rfqId.eq(rfq.id), q.contractorBusinessId.eq(businessId))).first();
  // Invited contractors see the address and a contact while quotes are open
  // or being compared; after a quote is approved, only the chosen one does.
  const showFull = invited && (["QUOTING", "CLOSED"].includes(String(rfq.status)) || quote?.status === "ACCEPTED");
  const [scheme, request, inviter] = await Promise.all([
    db.orm.public.Scheme.where((s) => s.id.eq(rfq.schemeId)).first(),
    db.orm.public.WorksRequest.where((r) => and(r.id.eq(rfq.requestId!), r.schemeId.eq(rfq.schemeId))).first(),
    showFull && invitation ? db.orm.public.Profile.where((p) => p.id.eq(invitation.invitedById)).first() : null,
  ]);
  // File names can carry an owner's name, so contractors get only the pictures.
  const photos = (invitation && !invited) || (invited && !showFull) ? [] : (await requestPhotos(rfq.schemeId, rfq.requestId)).map((p) => ({ id: p.id, url: p.url, fileName: "Photo" }));
  const quoteOpen = invited && rfq.status === "QUOTING" && !!rfq.quoteClosesAt && new Date(String(rfq.quoteClosesAt)) > now;
  return {
    id: rfq.id,
    schemeId: rfq.schemeId,
    /** The building's time zone: deadlines are days there. */
    timeZone: scheme ? timeZoneOf(scheme) : PLATFORM_TIME_ZONE,
    businessId,
    rfqNumber: String(rfq.rfqNumber),
    title: String(rfq.title),
    summary: String(rfq.description ?? ""),
    trade: rfq.trade ? String(rfq.trade) : null,
    suburb: rfq.suburb ? String(rfq.suburb) : null,
    status: String(rfq.status),
    statusLabel: rfqStatusLabel(rfq, now),
    interestClosesAt: rfq.interestClosesAt ? String(rfq.interestClosesAt) : null,
    quoteClosesAt: rfq.quoteClosesAt ? String(rfq.quoteClosesAt) : null,
    interestOpen,
    interested: !!interest,
    invitationStatus: invitation ? String(invitation.status) : null,
    invited,
    quoteOpen,
    building: showFull && scheme ? { name: String(scheme.name), address: [scheme.address, scheme.suburb, scheme.postcode].filter(Boolean).map(String).join(", ") } : null,
    location: showFull && request?.location ? String(request.location) : null,
    contact: showFull && inviter ? { name: [inviter.firstName, inviter.lastName].filter(Boolean).join(" ") || "The committee", email: inviter.email ? String(inviter.email) : null, phone: inviter.phone ? String(inviter.phone) : null } : null,
    photos,
    quote: quote
      ? {
          id: quote.id,
          status: String(quote.status),
          total: Number(quote.totalAmount),
          gst: Number(quote.gstAmount),
          validUntil: quote.validUntil ? String(quote.validUntil).slice(0, 10) : null,
          durationDays: quote.estimatedDuration != null ? Number(quote.estimatedDuration) : null,
          inclusions: quote.inclusions ? String(quote.inclusions) : "",
          exclusions: quote.exclusions ? String(quote.exclusions) : "",
          conditions: quote.conditions ? String(quote.conditions) : "",
          documentName: quote.documentName ? String(quote.documentName) : null,
        }
      : null,
  };
}

/** Express interest (or withdraw it) while the RFQ is open for interest. */
export async function setInterest(input: { rfqId: string; businessIds: string[]; profileId: string; interested: boolean; now?: Date }) {
  const now = input.now ?? new Date();
  const mine = await businessesOf(input.businessIds);
  const rfq = await db.orm.public.WorksRfq.where((r) => and(r.id.eq(input.rfqId), r.marketplace.eq(true))).first();
  if (!rfq) throw new MarketplaceError("Job not found.");
  const business = mine.find((b) => eligible(b, rfq));
  if (!business) throw new MarketplaceError("Job not found.");
  if (rfq.status !== "INTEREST" || !rfq.interestClosesAt || new Date(String(rfq.interestClosesAt)) <= now) throw new MarketplaceError("This job is no longer taking interest.");
  const existing = await db.orm.public.WorksRfqInterest.where((i) => and(i.rfqId.eq(rfq.id), i.contractorBusinessId.eq(business.id))).first();
  if (input.interested) {
    if (existing) {
      await db.orm.public.WorksRfqInterest.where((i) => i.id.eq(existing.id)).updateAndCount({ withdrawnAt: null });
    } else {
      try {
        await db.orm.public.WorksRfqInterest.create({ rfqId: rfq.id, contractorBusinessId: business.id, createdById: input.profileId });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
  } else if (existing) {
    await db.orm.public.WorksRfqInterest.where((i) => and(i.id.eq(existing.id), i.withdrawnAt.isNull())).updateAndCount({ withdrawnAt: ts(now) });
  }
  return { schemeId: rfq.schemeId, rfqNumber: String(rfq.rfqNumber), businessId: business.id };
}

/** Decline an invitation to quote. */
export async function declineInvitation(input: { rfqId: string; businessIds: string[]; reason: string | null }) {
  const mine = await businessesOf(input.businessIds);
  if (!mine.length) throw new MarketplaceError("Job not found.");
  const n = await db.orm.public.WorksRfqInvitation
    .where((i) => and(i.rfqId.eq(input.rfqId), i.contractorBusinessId.in(mine.map((b) => b.id)), i.status.eq("PENDING")))
    .updateAndCount({ status: "DECLINED", respondedAt: ts(new Date()), declineReason: input.reason?.trim() || null });
  if (n !== 1) throw new MarketplaceError("This invitation has already been answered.");
  const rfq = await db.orm.public.WorksRfq.where((r) => r.id.eq(input.rfqId)).first();
  return { schemeId: String(rfq?.schemeId), requestId: rfq?.requestId ?? null };
}

export interface QuoteInput {
  total: number;
  gst: number;
  validUntil: string | null;
  durationDays: number | null;
  inclusions: string;
  exclusions: string;
  conditions: string;
  uploadId: string | null;
}

const AMOUNT = /^\d{1,9}(\.\d{1,2})?$/;
/** Check the quote form (pure). Amounts in dollars, GST included in the total. */
export function checkQuote(raw: Record<string, unknown>): { ok: true; value: QuoteInput } | { ok: false; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const num = (k: string) => String(raw[k] ?? "").replace(/[$,\s]/g, "");
  const totalText = num("total");
  const gstText = num("gst") || "0";
  if (!AMOUNT.test(totalText) || Number(totalText) <= 0) fieldErrors.total = "Enter the total, including GST, in dollars.";
  if (!AMOUNT.test(gstText)) fieldErrors.gst = "Enter the GST in dollars, or 0.";
  const total = Number(totalText);
  const gst = Number(gstText);
  if (!fieldErrors.total && !fieldErrors.gst && gst > total) fieldErrors.gst = "GST cannot be more than the total.";
  const validUntil = String(raw.validUntil ?? "").trim() || null;
  if (validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) fieldErrors.validUntil = "Choose the date the quote is valid until.";
  const durationText = String(raw.durationDays ?? "").trim();
  if (durationText && !/^\d{1,4}$/.test(durationText)) fieldErrors.durationDays = "Enter the number of days, for example 3.";
  const text = (k: string, max: number) => String(raw[k] ?? "").trim().slice(0, max);
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  return {
    ok: true,
    value: {
      total,
      gst,
      validUntil,
      durationDays: durationText ? Number(durationText) : null,
      inclusions: text("inclusions", 5000),
      exclusions: text("exclusions", 5000),
      conditions: text("conditions", 5000),
      uploadId: String(raw.uploadId ?? "").trim() || null,
    },
  };
}

/** Whether a vote on approving a quote is open for this RFQ's request: quotes are then fixed. */
async function approvalVoteOpen(rfq: { requestId: string | null }) {
  if (!rfq.requestId) return false;
  return !!(await db.orm.public.WorksDecision.where((d) => and(d.requestId.eq(rfq.requestId!), d.kind.eq("QUOTE"), d.status.eq("OPEN"))).first());
}

/** An invited contractor submits (or changes) their quote before the deadline. */
export async function submitQuote(input: { rfqId: string; businessIds: string[]; profileId: string; quote: QuoteInput; now?: Date }) {
  const now = input.now ?? new Date();
  const mine = await businessesOf(input.businessIds);
  const rfq = await db.orm.public.WorksRfq.where((r) => and(r.id.eq(input.rfqId), r.marketplace.eq(true))).first();
  if (!rfq || !mine.length) throw new MarketplaceError("Job not found.");
  const invitation = await db.orm.public.WorksRfqInvitation.where((i) => and(i.rfqId.eq(rfq.id), i.contractorBusinessId.in(mine.map((b) => b.id)))).first();
  if (!invitation || !ACTIVE_INVITE.includes(String(invitation.status))) throw new MarketplaceError("Your business was not invited to quote on this job.");
  if (rfq.status !== "QUOTING" || !rfq.quoteClosesAt || new Date(String(rfq.quoteClosesAt)) <= now) throw new MarketplaceError("Quotes for this job have closed.");
  if (await approvalVoteOpen(rfq)) throw new MarketplaceError("The committee is voting on the quotes now, so quotes cannot be changed.");
  const businessId = invitation.contractorBusinessId;
  const upload = input.quote.uploadId ? await verifyUpload({ uploadId: input.quote.uploadId, schemeId: rfq.schemeId, purpose: "works_quote", profileId: input.profileId }) : null;
  const q = input.quote;
  const fields = {
    subtotal: money(q.total - q.gst),
    gstAmount: money(q.gst),
    totalAmount: money(q.total),
    validUntil: q.validUntil ? ts(`${q.validUntil}T00:00:00.000Z`) : null,
    estimatedDuration: q.durationDays,
    inclusions: q.inclusions || null,
    exclusions: q.exclusions || null,
    conditions: q.conditions || null,
    status: "SUBMITTED",
    submittedAt: ts(now),
  };
  const existing = await db.orm.public.WorksQuotation.where((x) => and(x.rfqId.eq(rfq.id), x.contractorBusinessId.eq(businessId))).first();
  let quotationId: string;
  if (existing) {
    if (!["SUBMITTED", "WITHDRAWN", "DRAFT"].includes(String(existing.status))) throw new MarketplaceError("This quote can no longer be changed.");
    const n = await db.orm.public.WorksQuotation
      .where((x) => and(x.id.eq(existing.id), x.status.in(["SUBMITTED", "WITHDRAWN", "DRAFT"])))
      .updateAndCount({ ...fields, currentVersion: Number(existing.currentVersion) + 1 });
    if (n !== 1) throw new MarketplaceError("This quote can no longer be changed.");
    quotationId = existing.id;
  } else {
    try {
      const created = await db.orm.public.WorksQuotation.create({ rfqId: rfq.id, contractorBusinessId: businessId, quotationNumber: vc<30>(`${String(rfq.rfqNumber)}-Q`), currentVersion: 1, ...fields });
      quotationId = created.id;
    } catch (err) {
      if (isUniqueViolation(err)) throw new MarketplaceError("Your quote has just been saved. Reload the page.");
      throw err;
    }
  }
  await db.orm.public.WorksRfqInvitation.where((i) => and(i.id.eq(invitation.id), i.status.eq("PENDING"))).updateAndCount({ status: "ACCEPTED", respondedAt: ts(now) });
  if (upload) {
    await consumeUpload(
      upload.uploadId,
      () => db.orm.public.WorksQuotation.where((x) => x.id.eq(quotationId)).updateAndCount({ documentPath: upload.path, documentName: vc<500>(upload.fileName.slice(0, 500)) }),
      () => `WorksQuotation:${quotationId}`,
    );
  }
  return { schemeId: rfq.schemeId, requestId: rfq.requestId, rfqNumber: String(rfq.rfqNumber), quotationId, businessId };
}

/** Withdraw a quote before the deadline. */
export async function withdrawQuote(input: { rfqId: string; businessIds: string[]; now?: Date }) {
  const now = input.now ?? new Date();
  const mine = await businessesOf(input.businessIds);
  const rfq = await db.orm.public.WorksRfq.where((r) => and(r.id.eq(input.rfqId), r.marketplace.eq(true))).first();
  if (!rfq || !mine.length) throw new MarketplaceError("Job not found.");
  if (rfq.status !== "QUOTING" || !rfq.quoteClosesAt || new Date(String(rfq.quoteClosesAt)) <= now) throw new MarketplaceError("Quotes for this job have closed, so it cannot be withdrawn here. Contact the building.");
  if (await approvalVoteOpen(rfq)) throw new MarketplaceError("The committee is voting on the quotes now. Contact the building to withdraw.");
  const n = await db.orm.public.WorksQuotation
    .where((x) => and(x.rfqId.eq(rfq.id), x.contractorBusinessId.in(mine.map((b) => b.id)), x.status.eq("SUBMITTED")))
    .updateAndCount({ status: "WITHDRAWN" });
  if (n !== 1) throw new MarketplaceError("There is no quote to withdraw.");
  return { schemeId: rfq.schemeId };
}

// ─── The committee ─────────────────────────────────────────────────────────

/** Everything the committee sees about a request's marketplace RFQ. */
export async function rfqForCommittee(schemeId: string, requestId: string, now = new Date()) {
  const rfq = await rfqForRequest(schemeId, requestId);
  if (!rfq) return null;
  const [interests, invitations, quotes] = await Promise.all([
    db.orm.public.WorksRfqInterest.where((i) => and(i.rfqId.eq(rfq.id), i.withdrawnAt.isNull())).limit(500).all(),
    db.orm.public.WorksRfqInvitation.where((i) => i.rfqId.eq(rfq.id)).limit(100).all(),
    db.orm.public.WorksQuotation.where((q) => q.rfqId.eq(rfq.id)).limit(100).all(),
  ]);
  const ids = [...new Set([...interests.map((i) => i.contractorBusinessId), ...invitations.map((i) => i.contractorBusinessId), ...quotes.map((q) => q.contractorBusinessId)])];
  const businesses = ids.length ? await db.orm.public.ContractorBusiness.where((c) => c.id.in(ids)).limit(500).all() : [];
  const biz = (id: string) => businesses.find((b) => b.id === id);
  const docPaths = quotes.filter((q) => q.documentPath && !schemeStoragePathProblem(schemeId, String(q.documentPath)));
  // (Links are signed here; sealed quotes do not return them.)
  const links = docPaths.length ? await signDownloads(docPaths.map((q) => String(q.documentPath)), 15 * 60) : [];
  const activeInvites = invitations.filter((i) => ACTIVE_INVITE.includes(String(i.status)));
  const submitted = quotes.filter((q) => q.status === "SUBMITTED" || q.status === "ACCEPTED");
  const quoteDeadlinePassed = !!rfq.quoteClosesAt && new Date(String(rfq.quoteClosesAt)) <= now;
  const allAnswered = activeInvites.length > 0 && activeInvites.every((i) => quotes.some((q) => q.contractorBusinessId === i.contractorBusinessId && (q.status === "SUBMITTED" || q.status === "ACCEPTED")));
  const liveOrder = rfq.requestId ? await db.orm.public.WorksWorkOrder.where((o) => and(o.requestId.eq(rfq.requestId!), o.status.notIn(["DECLINED", "CANCELLED"]))).first() : null;
  const acceptedQuote = quotes.find((q) => q.status === "ACCEPTED") ?? null;
  const { rules } = await rulesForScheme(schemeId);
  const quoteRule = await buildingQuoteRule(schemeId, rules);
  const ready = (rfq.status === "QUOTING" || rfq.status === "CLOSED") && (quoteDeadlinePassed || allAnswered || rfq.status === "CLOSED");
  // Quotes stay sealed until they can be compared, so no price can leak to
  // a contractor still able to change theirs.
  const sealed = !ready && rfq.status !== "AWARDED";
  return {
    id: rfq.id,
    rfqNumber: String(rfq.rfqNumber),
    title: String(rfq.title),
    summary: String(rfq.description ?? ""),
    status: String(rfq.status),
    statusLabel: rfqStatusLabel(rfq, now),
    trade: rfq.trade ? String(rfq.trade) : null,
    postcode: rfq.postcode ? String(rfq.postcode) : null,
    interestClosesAt: rfq.interestClosesAt ? String(rfq.interestClosesAt) : null,
    quoteClosesAt: rfq.quoteClosesAt ? String(rfq.quoteClosesAt) : null,
    /** The building's time zone: deadlines are days there. */
    timeZone: await schemeTimeZone(schemeId),
    inviteLimit: Number(rfq.inviteLimit),
    inviteRoom: Math.max(0, Number(rfq.inviteLimit) - activeInvites.length),
    canInvite: rfq.status === "INTEREST" || rfq.status === "QUOTING",
    canChangeDeadlines: (RFQ_OPEN_STATUSES as readonly string[]).includes(String(rfq.status)),
    interested: interests.map((i) => {
      const b = biz(i.contractorBusinessId);
      return { businessId: i.contractorBusinessId, name: businessName(b), suburb: b?.suburb ? String(b.suburb) : null, approved: isApproved(b), invited: invitations.some((x) => x.contractorBusinessId === i.contractorBusinessId), at: String(i.createdAt) };
    }),
    invitations: invitations.map((i) => ({ businessId: i.contractorBusinessId, name: businessName(biz(i.contractorBusinessId)), status: String(i.status), declineReason: i.declineReason ? String(i.declineReason) : null })),
    quotes: submitted
      .map((q) => (sealed ? { ...q, totalAmount: "0", gstAmount: "0", inclusions: null, exclusions: null, conditions: null, estimatedDuration: null, validUntil: null, documentPath: null, documentName: null } : q))
      .map((q) => {
        const di = docPaths.findIndex((d) => d.id === q.id);
        return {
          id: q.id,
          businessId: q.contractorBusinessId,
          name: businessName(biz(q.contractorBusinessId)),
          status: String(q.status),
          total: Number(q.totalAmount),
          gst: Number(q.gstAmount),
          validUntil: q.validUntil ? String(q.validUntil).slice(0, 10) : null,
          durationDays: q.estimatedDuration != null ? Number(q.estimatedDuration) : null,
          inclusions: q.inclusions ? String(q.inclusions) : "",
          exclusions: q.exclusions ? String(q.exclusions) : "",
          conditions: q.conditions ? String(q.conditions) : "",
          documentName: q.documentName ? String(q.documentName) : null,
          documentUrl: !sealed && di >= 0 ? links[di] ?? null : null,
          submittedAt: q.submittedAt ? String(q.submittedAt) : null,
        };
      })
      .sort((a, b) => a.total - b.total),
    /** Quotes can be compared and one approved once the deadline passes, or every invited contractor has quoted. */
    readyToApprove: ready,
    sealed,
    /** A quote was approved but its work order never went out: send it. */
    needsOrder: rfq.status === "AWARDED" && !!acceptedQuote && !liveOrder ? acceptedQuote.id : null,
    canCancel: (RFQ_OPEN_STATUSES as readonly string[]).includes(String(rfq.status)),
    twoQuoteThreshold: quoteRule.threshold,
    minimumQuotes: quoteRule.minimumQuotes,
    /** The building's citation for the rule ("SSMA s 102"). */
    twoQuoteCitation: quoteRule.citation,
    /** The rule in a sentence, or that the building's number of lots is missing (stage 2, step 9). */
    twoQuoteSentence: quoteRuleSentence(quoteRule),
  };
}

/** Invite contractors to quote (any committee member or the Adviser). Interested contractors, or any approved one directly. */
export async function invite(input: { schemeId: string; rfqId: string; businessIds: string[]; invitedById: string; inviteLimit?: number | null; quoteClosesAt?: string | null; now?: Date }) {
  const now = input.now ?? new Date();
  const rfq = await db.orm.public.WorksRfq.where((r) => and(r.id.eq(input.rfqId), r.schemeId.eq(input.schemeId), r.marketplace.eq(true))).first();
  if (!rfq) throw new MarketplaceError("Not found.");
  if (rfq.status !== "INTEREST" && rfq.status !== "QUOTING") throw new MarketplaceError("Invitations have closed for this request.");
  const wanted = [...new Set(input.businessIds.filter(Boolean))];
  if (!wanted.length) throw new MarketplaceError("Choose at least one contractor to invite.");
  const limit = input.inviteLimit ?? Number(rfq.inviteLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MARKETPLACE_DEFAULTS.maxInviteLimit) throw new MarketplaceError(`Invite between 1 and ${MARKETPLACE_DEFAULTS.maxInviteLimit} contractors.`);
  const businesses = await db.orm.public.ContractorBusiness.where((c) => c.id.in(wanted)).limit(50).all();
  if (businesses.length !== wanted.length || businesses.some((b) => !isApproved(b))) throw new MarketplaceError("Choose contractors approved on StrataVerze.");
  let closes: Date;
  if (input.quoteClosesAt) {
    const end = buildingEndOfDay(await schemeTimeZone(input.schemeId), input.quoteClosesAt);
    if (!end || end <= now) throw new MarketplaceError("Choose a quote deadline in the future.");
    closes = end;
  } else {
    closes = rfq.quoteClosesAt && new Date(String(rfq.quoteClosesAt)) > now ? new Date(String(rfq.quoteClosesAt)) : new Date(now.getTime() + MARKETPLACE_DEFAULTS.quoteDays * DAY);
  }
  const invited = await db.transaction(async (tx) => {
    // First, with its whole filter: move the RFQ to quoting. This takes its
    // row lock, so two people inviting at once are counted one after the
    // other and the number chosen cannot be passed.
    const moved = await tx.orm.public.WorksRfq
      .where((r) => and(r.id.eq(rfq.id), r.status.in(["INTEREST", "QUOTING"])))
      .updateAndCount({ status: "QUOTING", quoteClosesAt: ts(closes), closingDate: ts(closes), inviteLimit: limit, quotesClosedNotifiedAt: null });
    if (moved !== 1) throw new MarketplaceError("Invitations have closed for this request.");
    const existing = await tx.orm.public.WorksRfqInvitation.where((i) => i.rfqId.eq(rfq.id)).limit(100).all();
    const fresh = wanted.filter((id) => !existing.some((e) => e.contractorBusinessId === id));
    const active = existing.filter((e) => ACTIVE_INVITE.includes(String(e.status))).length;
    if (active + fresh.length > limit) throw new MarketplaceError(`That would invite ${active + fresh.length}, more than the ${limit} you chose. Raise the number to invite, or choose fewer.`);
    for (const id of fresh) await tx.orm.public.WorksRfqInvitation.create({ rfqId: rfq.id, contractorBusinessId: id, invitedById: input.invitedById, status: "PENDING" });
    return fresh;
  });
  return { invited, quoteClosesAt: closes.toISOString(), rfqNumber: String(rfq.rfqNumber), requestId: rfq.requestId };
}

/** Change the deadlines (committee or Adviser). Dates are calendar days in the building's time zone; each runs to 11.59 pm. */
export async function setDeadlines(input: { schemeId: string; rfqId: string; interestClosesAt?: string | null; quoteClosesAt?: string | null; now?: Date }) {
  const now = input.now ?? new Date();
  const rfq = await db.orm.public.WorksRfq.where((r) => and(r.id.eq(input.rfqId), r.schemeId.eq(input.schemeId), r.marketplace.eq(true))).first();
  if (!rfq) throw new MarketplaceError("Not found.");
  const tz = await schemeTimeZone(input.schemeId);
  const day = (v: string) => {
    const d = buildingEndOfDay(tz, v);
    if (!d || d <= now) throw new MarketplaceError("Choose a date in the future.");
    return d;
  };
  const data: Record<string, unknown> = {};
  if (input.interestClosesAt) {
    if (rfq.status !== "INTEREST") throw new MarketplaceError("Interest has closed: contractors have been invited.");
    const d = day(input.interestClosesAt);
    Object.assign(data, { interestClosesAt: ts(d), closingDate: ts(d), noInterestNotifiedAt: null });
  }
  if (input.quoteClosesAt) {
    if (rfq.status !== "QUOTING" && rfq.status !== "CLOSED") throw new MarketplaceError("Invite contractors first; the quote deadline is set then.");
    const d = day(input.quoteClosesAt);
    // Reopening closed quotes lets invited contractors quote again.
    Object.assign(data, { quoteClosesAt: ts(d), closingDate: ts(d), quotesClosedNotifiedAt: null, status: "QUOTING" });
  }
  if (!Object.keys(data).length) throw new MarketplaceError("Choose a new date.");
  const n = await db.orm.public.WorksRfq.where((r) => and(r.id.eq(rfq.id), r.status.in(["INTEREST", "QUOTING", "CLOSED"]))).updateAndCount(data);
  if (n !== 1) throw new MarketplaceError("This request has moved on. Reload the page.");
  return { rfqNumber: String(rfq.rfqNumber) };
}

/** Approved contractors who list the trade, for inviting directly when too few are interested. */
export async function contractorsForDirectInvite(trade: string | null) {
  const approved = await db.orm.public.ContractorBusiness.where((c) => and(c.status.eq("APPROVED"), c.deletedAt.isNull())).limit(5000).all();
  return approved
    .map((b) => ({ id: b.id, name: businessName(b), suburb: b.suburb ? String(b.suburb) : null, listsTrade: listsTrade(b, trade) }))
    .sort((a, b) => Number(b.listsTrade) - Number(a.listsTrade) || a.name.localeCompare(b.name));
}

/** The approval checks for a quote, shared by the proposal and its settlement. */
export async function quoteApprovalProblem(quotationId: string, now = new Date()): Promise<{ problem: string | null; quote: { id: string; rfqId: string; total: number; businessId: string } | null; requestId: string | null; schemeId: string | null }> {
  const quote = await db.orm.public.WorksQuotation.where((q) => q.id.eq(quotationId)).first();
  if (!quote) return { problem: "Quote not found.", quote: null, requestId: null, schemeId: null };
  const rfq = await db.orm.public.WorksRfq.where((r) => and(r.id.eq(quote.rfqId), r.marketplace.eq(true))).first();
  if (!rfq || !rfq.requestId) return { problem: "Quote not found.", quote: null, requestId: null, schemeId: null };
  const base = { quote: { id: quote.id, rfqId: rfq.id, total: Number(quote.totalAmount), businessId: quote.contractorBusinessId }, requestId: rfq.requestId, schemeId: rfq.schemeId };
  if (quote.status !== "SUBMITTED") return { problem: "This quote is no longer open to approve.", ...base };
  if (!["QUOTING", "CLOSED", "AWARDED"].includes(String(rfq.status))) return { problem: "Quotes for this request are not ready to approve.", ...base };
  const live = await db.orm.public.WorksWorkOrder.where((o) => and(o.requestId.eq(rfq.requestId!), o.status.notIn(["DECLINED", "CANCELLED"]))).first();
  if (live) return { problem: "A work order is already out for this request.", ...base };
  const quotes = await db.orm.public.WorksQuotation.where((q) => and(q.rfqId.eq(rfq.id), q.status.in(["SUBMITTED", "ACCEPTED"]))).limit(100).all();
  const invitations = await db.orm.public.WorksRfqInvitation.where((i) => i.rfqId.eq(rfq.id)).limit(100).all();
  const active = invitations.filter((i) => ACTIVE_INVITE.includes(String(i.status)));
  const deadlinePassed = !!rfq.quoteClosesAt && new Date(String(rfq.quoteClosesAt)) <= now;
  const allIn = active.length > 0 && active.every((i) => quotes.some((q) => q.contractorBusinessId === i.contractorBusinessId));
  if (rfq.status === "QUOTING" && !deadlinePassed && !allIn) return { problem: "Wait until the quote deadline, or until every invited contractor has quoted, so each has a fair chance.", ...base };
  // Quotes obtained count, including one approved before whose contractor
  // then declined the work order; a withdrawn quote does not.
  const obtained = await db.orm.public.WorksQuotation.where((q) => and(q.rfqId.eq(rfq.id), q.status.in(["SUBMITTED", "ACCEPTED", "DECLINED"]))).limit(100).all();
  // The building's spending rules (throws for a state with no rule pack).
  const { rules } = await rulesForScheme(rfq.schemeId);
  const problem = quotesProblem(await buildingQuoteRule(rfq.schemeId, rules), Number(quote.totalAmount), obtained.length);
  if (problem) return { problem, ...base };
  return { problem: null, ...base };
}

/** A work order for an approved quote: to its contractor, for the quoted total. */
export async function issueQuoteOrder(input: { schemeId: string; requestId: string; quotationId: string; issuedById: string }) {
  const quote = await db.orm.public.WorksQuotation.where((q) => and(q.id.eq(input.quotationId), q.status.eq("ACCEPTED"))).first();
  if (!quote) throw new MarketplaceError("The approved quote was not found.");
  const [rfq, request] = await Promise.all([
    db.orm.public.WorksRfq.where((r) => r.id.eq(quote.rfqId)).first(),
    db.orm.public.WorksRequest.where((r) => and(r.id.eq(input.requestId), r.schemeId.eq(input.schemeId))).first(),
  ]);
  if (!rfq || !request) throw new MarketplaceError("Request not found.");
  const location = request.location ? `\n\nWhere: ${String(request.location)}` : "";
  for (let attempt = 0; attempt < 10; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 10 + Math.floor(Math.random() * 40)));
    const rows = await db.orm.public.WorksWorkOrder.where((o) => o.schemeId.eq(input.schemeId)).limit(100000).all();
    const max = rows.reduce((m, r) => Math.max(m, Number(String(r.workOrderNumber).match(/(\d+)$/)?.[1] ?? 0)), 0);
    const workOrderNumber = `WO-${String(max + 1).padStart(4, "0")}`;
    try {
      const order = await db.orm.public.WorksWorkOrder.create({
        schemeId: input.schemeId,
        requestId: input.requestId,
        contractId: null,
        contractorBusinessId: quote.contractorBusinessId,
        workOrderNumber: vc<30>(workOrderNumber),
        title: vc<300>(String(rfq.title)),
        description: `${String(rfq.description ?? "")}${location}\n\nQuote ${String(rfq.rfqNumber)}: $${Number(quote.totalAmount).toLocaleString("en-AU", { minimumFractionDigits: 2 })} including GST.`,
        status: "AWAITING_ACKNOWLEDGEMENT",
        amountLimit: quote.totalAmount as unknown as Numeric<12, 2>,
        issuedById: input.issuedById,
      });
      return { workOrderId: order.id, workOrderNumber, contractorBusinessId: quote.contractorBusinessId, amountLimit: Number(quote.totalAmount) };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const live = await db.orm.public.WorksWorkOrder.where((o) => and(o.requestId.eq(input.requestId), o.status.notIn(["DECLINED", "CANCELLED"]))).first();
      if (live) throw new MarketplaceError("A work order is already out for this request.");
    }
  }
  throw new MarketplaceError("The work order could not be numbered. Please try again.");
}

// ─── The daily sweep ───────────────────────────────────────────────────────

/**
 * Close deadlines that have passed and say so once (called daily by the
 * cron): interest closed (with how many are interested, or none), and
 * quotes closed. Each RFQ is claimed with one conditional update, so two
 * runs at once report it once. Returns what to email.
 */
export async function sweepDeadlines(now = new Date()) {
  const interestDue = await db.orm.public.WorksRfq
    .where((r) => and(r.marketplace.eq(true), r.status.eq("INTEREST"), r.interestClosesAt.lte(ts(now)), r.noInterestNotifiedAt.isNull()))
    .limit(500)
    .all();
  const interestClosed: Array<{ schemeId: string; requestId: string | null; rfqNumber: string; interested: number }> = [];
  for (const r of interestDue) {
    const n = await db.orm.public.WorksRfq.where((x) => and(x.id.eq(r.id), x.status.eq("INTEREST"), x.noInterestNotifiedAt.isNull())).updateAndCount({ noInterestNotifiedAt: ts(now) });
    if (n !== 1) continue;
    const interested = await db.orm.public.WorksRfqInterest.where((i) => and(i.rfqId.eq(r.id), i.withdrawnAt.isNull())).limit(500).all();
    interestClosed.push({ schemeId: r.schemeId, requestId: r.requestId, rfqNumber: String(r.rfqNumber), interested: interested.length });
  }
  const quotesDue = await db.orm.public.WorksRfq
    .where((r) => and(r.marketplace.eq(true), r.status.eq("QUOTING"), r.quoteClosesAt.lte(ts(now)), r.quotesClosedNotifiedAt.isNull()))
    .limit(500)
    .all();
  const quotesClosed: Array<{ schemeId: string; requestId: string | null; rfqNumber: string; quotes: number }> = [];
  for (const r of quotesDue) {
    const n = await db.orm.public.WorksRfq
      .where((x) => and(x.id.eq(r.id), x.status.eq("QUOTING"), x.quotesClosedNotifiedAt.isNull(), x.quoteClosesAt.lte(ts(now))))
      .updateAndCount({ status: "CLOSED", closedAt: ts(now), quotesClosedNotifiedAt: ts(now) });
    if (n !== 1) continue;
    const quotes = await db.orm.public.WorksQuotation.where((q) => and(q.rfqId.eq(r.id), q.status.eq("SUBMITTED"))).limit(100).all();
    quotesClosed.push({ schemeId: r.schemeId, requestId: r.requestId, rfqNumber: String(r.rfqNumber), quotes: quotes.length });
  }
  return { interestClosed, quotesClosed };
}

/**
 * Once the chosen contractor accepts the work order, the other quotes are
 * declined (not before: if the chosen one declines, the committee can approve
 * another). Returns the businesses not selected, to thank them.
 */
export async function closeOutQuotes(requestId: string): Promise<{ schemeId: string; title: string; businessIds: string[] } | null> {
  const rfq = await db.orm.public.WorksRfq.where((r) => and(r.requestId.eq(requestId), r.marketplace.eq(true), r.status.eq("AWARDED"))).first();
  if (!rfq) return null;
  const others = await db.orm.public.WorksQuotation.where((q) => and(q.rfqId.eq(rfq.id), q.status.eq("SUBMITTED"))).limit(100).all();
  if (!others.length) return null;
  await db.orm.public.WorksQuotation.where((q) => and(q.rfqId.eq(rfq.id), q.status.eq("SUBMITTED"))).updateAndCount({ status: "DECLINED" });
  return { schemeId: rfq.schemeId, title: String(rfq.title), businessIds: others.map((q) => q.contractorBusinessId) };
}

/**
 * The approved quote's work order was declined or cancelled: the quotes go
 * back to the committee (RFQ closed, that quote declined, request getting
 * quotes again), so it can approve another, invite more or extend.
 */
export async function reopenAfterOrderEnded(requestId: string): Promise<boolean> {
  const rfq = await db.orm.public.WorksRfq.where((r) => and(r.requestId.eq(requestId), r.marketplace.eq(true), r.status.eq("AWARDED"))).first();
  if (!rfq) return false;
  const live = await db.orm.public.WorksWorkOrder.where((o) => and(o.requestId.eq(requestId), o.status.notIn(["DECLINED", "CANCELLED"]))).first();
  if (live) return false;
  return db.transaction(async (tx) => {
    const n = await tx.orm.public.WorksRfq.where((r) => and(r.id.eq(rfq.id), r.status.eq("AWARDED"))).updateAndCount({ status: "CLOSED" });
    if (n !== 1) return false;
    await tx.orm.public.WorksQuotation.where((q) => and(q.rfqId.eq(rfq.id), q.status.eq("ACCEPTED"))).updateAndCount({ status: "DECLINED" });
    await tx.orm.public.WorksRequest.where((r) => and(r.id.eq(requestId), r.status.eq("APPROVAL"))).updateAndCount({ status: "PROCUREMENT" });
    return true;
  });
}

/**
 * Cancel a marketplace RFQ that is still open (committee or Adviser): it
 * leaves the marketplace and the request goes back to the committee to
 * decide again. Returns the contractors to tell.
 */
export async function cancelRfq(input: { schemeId: string; rfqId: string; reason: string | null }) {
  const rfq = await db.orm.public.WorksRfq.where((r) => and(r.id.eq(input.rfqId), r.schemeId.eq(input.schemeId), r.marketplace.eq(true))).first();
  if (!rfq || !rfq.requestId) throw new MarketplaceError("Not found.");
  if (await approvalVoteOpen(rfq)) throw new MarketplaceError("A vote on a quote is open. Withdraw it first.");
  const done = await db.transaction(async (tx) => {
    const n = await tx.orm.public.WorksRfq
      .where((r) => and(r.id.eq(rfq.id), r.status.in([...RFQ_OPEN_STATUSES])))
      .updateAndCount({ status: "CANCELLED", cancelledReason: input.reason?.trim() || null, closedAt: ts(new Date()) });
    if (n !== 1) return false;
    await tx.orm.public.WorksQuotation.where((q) => and(q.rfqId.eq(rfq.id), q.status.eq("SUBMITTED"))).updateAndCount({ status: "DECLINED" });
    await tx.orm.public.WorksRequest.where((r) => and(r.id.eq(rfq.requestId!), r.status.eq("PROCUREMENT"))).updateAndCount({ status: "SUBMITTED" });
    return true;
  });
  if (!done) throw new MarketplaceError("This request has moved on. Reload the page.");
  const [interests, invitations] = await Promise.all([
    db.orm.public.WorksRfqInterest.where((i) => and(i.rfqId.eq(rfq.id), i.withdrawnAt.isNull())).limit(500).all(),
    db.orm.public.WorksRfqInvitation.where((i) => i.rfqId.eq(rfq.id)).limit(100).all(),
  ]);
  return { requestId: rfq.requestId, rfqNumber: String(rfq.rfqNumber), title: String(rfq.title), businessIds: [...new Set([...interests.map((i) => i.contractorBusinessId), ...invitations.map((i) => i.contractorBusinessId)])] };
}

