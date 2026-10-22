"use server";

import { feeErrorMessage } from "@/lib/billing/disclosure";
import { captureUsageFee } from "@/lib/billing/capture";
import { isExecutedContractStatus } from "@/lib/billing/hook-codes";
import { revalidatePath } from "next/cache";
import {
  requireSchemeMembership,
  requireAuth,
  AuthorisationError,
} from "@/lib/auth/require-membership";
import { logActivity, type ActivityAction } from "@/lib/queries/activity-log";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type {
  Numeric,
  TimestampString,
  Varchar,
} from "@prisma/orm-postgres/target/codec-types";

// ─── Helpers ────────────────────────────────────────────────────

function toNumeric(value: number | string): Numeric<12, 2> {
  return String(value) as unknown as Numeric<12, 2>;
}

function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

function toVarchar<N extends number>(value: string): Varchar<N> {
  return value as unknown as Varchar<N>;
}

export type ActionResult = { success?: true; error: string | null };
type SuccessResult = { success: true; error: null };
const OK: SuccessResult = { success: true, error: null };

/**
 * Generate a sequential reference number with a given prefix.
 * Counts existing rows in the scheme and increments.
 */
async function generateNumber(
  prefix: string,
  schemeId: string,
  model: "WorksRequest" | "WorksRfq" | "WorksContract" | "WorksWorkOrder",
): Promise<string> {
  let count = 0;
  switch (model) {
    case "WorksRequest":
      count = Number(await db.orm.public.WorksRequest
        .where((r) => r.schemeId.eq(schemeId))
        .count());
      break;
    case "WorksRfq":
      count = Number(await db.orm.public.WorksRfq
        .where((r) => r.schemeId.eq(schemeId))
        .count());
      break;
    case "WorksContract":
      count = Number(await db.orm.public.WorksContract
        .where((r) => r.schemeId.eq(schemeId))
        .count());
      break;
    case "WorksWorkOrder":
      count = Number(await db.orm.public.WorksWorkOrder
        .where((r) => r.schemeId.eq(schemeId))
        .count());
      break;
  }
  const next = count + 1;
  return `${prefix}-${String(next).padStart(4, "0")}`;
}

/** Re-throw Next.js redirect errors so they propagate correctly. */
function isRedirectError(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

// ─── Works Requests ─────────────────────────────────────────────

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

/**
 * Create a new Works request with an initial version snapshot.
 */
export async function createWorksRequest(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const schemeId = formData.get("schemeId") as string;
  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const location = (formData.get("location") as string)?.trim() || null;
  const priority = (formData.get("priority") as string) || "MEDIUM";
  const isEmergency = formData.get("isEmergency") === "true";
  const estimatedCostRaw = (formData.get("estimatedCost") as string)?.trim();
  const categoryId = (formData.get("categoryId") as string) || null;

  if (!schemeId) return { error: "Scheme is required." };
  if (!title) return { error: "Title is required." };
  if (!description) return { error: "Description is required." };
  if (!PRIORITIES.includes(priority))
    return { error: "Select a valid priority." };
  if (estimatedCostRaw && isNaN(Number(estimatedCostRaw)))
    return { error: "Estimated cost must be a valid number." };

  try {
    const { profile } = await requireSchemeMembership(schemeId, [
      "ADVISER",
      "COMMITTEE",
      "OWNER",
    ]);

    const requestNumber = await generateNumber("WR", schemeId, "WorksRequest");

    const request = await db.transaction(async (tx) => {
      const req = await tx.orm.public.WorksRequest.create({
        schemeId,
        requestNumber: toVarchar<30>(requestNumber),
        raisedById: profile.id,
        categoryId,
        title: toVarchar<300>(title),
        description,
        location: location ? toVarchar<500>(location) : null,
        priority,
        isEmergency,
        estimatedCost: estimatedCostRaw
          ? toNumeric(Number(estimatedCostRaw))
          : null,
        status: "DRAFT",
        currentVersion: 1,
      });

      // Create version 1 snapshot
      await tx.orm.public.WorksRequestVersion.create({
        requestId: req.id,
        versionNumber: 1,
        title: toVarchar<300>(title),
        description,
        location: location ? toVarchar<500>(location) : null,
        priority,
        estimatedCost: estimatedCostRaw
          ? toNumeric(Number(estimatedCostRaw))
          : null,
        changeReason: "Initial request",
        createdById: profile.id,
      });

      return req;
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "WORK_ORDER_CREATED",
      entityType: "WorkOrder",
      entityId: request.id,
      metadata: { title, requestNumber, priority, module: "works" },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    if (isRedirectError(err)) throw err;
    return { error: "Failed to create works request. Please try again." };
  }
}

/**
 * Update a works request, creating a new version snapshot.
 */
export async function updateWorksRequest(
  formData: FormData,
): Promise<ActionResult> {
  const requestId = formData.get("requestId") as string;
  const schemeId = formData.get("schemeId") as string;
  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const location = (formData.get("location") as string)?.trim() || null;
  const priority = (formData.get("priority") as string) || "MEDIUM";
  const estimatedCostRaw = (formData.get("estimatedCost") as string)?.trim();
  const changeReason =
    (formData.get("changeReason") as string)?.trim() || null;

  if (!requestId || !schemeId) return { error: "Request and scheme required." };
  if (!title) return { error: "Title is required." };
  if (!description) return { error: "Description is required." };

  try {
    const { profile } = await requireSchemeMembership(schemeId, [
      "ADVISER",
      "COMMITTEE",
    ]);

    await db.transaction(async (tx) => {
      // Get current version number
      const existing = await tx.orm.public.WorksRequest
        .where((r) => r.id.eq(requestId))
        .first();
      if (!existing) throw new Error("Request not found.");
      const nextVersion = existing.currentVersion + 1;

      // Update the request
      await tx.orm.public.WorksRequest.where((r) => r.id.eq(requestId)).update({
        title: toVarchar<300>(title),
        description,
        location: location ? toVarchar<500>(location) : null,
        priority,
        estimatedCost: estimatedCostRaw
          ? toNumeric(Number(estimatedCostRaw))
          : null,
        currentVersion: nextVersion,
      });

      // Create new version snapshot
      await tx.orm.public.WorksRequestVersion.create({
        requestId,
        versionNumber: nextVersion,
        title: toVarchar<300>(title),
        description,
        location: location ? toVarchar<500>(location) : null,
        priority,
        estimatedCost: estimatedCostRaw
          ? toNumeric(Number(estimatedCostRaw))
          : null,
        changeReason,
        createdById: profile.id,
      });
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    if (isRedirectError(err)) throw err;
    return { error: "Failed to update works request." };
  }
}

/**
 * Submit a works request (move from DRAFT to SUBMITTED).
 */
export async function submitWorksRequest(
  requestId: string,
  schemeId: string,
): Promise<ActionResult> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, [
      "ADVISER",
      "COMMITTEE",
      "OWNER",
    ]);

    const request = await db.orm.public.WorksRequest
      .where((r) => and(r.id.eq(requestId), r.schemeId.eq(schemeId)))
      .first();

    if (!request) return { error: "Request not found." };
    if (request.status !== "DRAFT")
      return { error: "Only draft requests can be submitted." };

    await db.orm.public.WorksRequest.where((r) => r.id.eq(requestId)).update({
      status: "SUBMITTED",
      submittedAt: toTimestamp(new Date().toISOString()),
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "WORK_ORDER_STATUS_UPDATED",
      entityType: "WorkOrder",
      entityId: requestId,
      metadata: { status: "SUBMITTED", module: "works" },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to submit request." };
  }
}

/**
 * Review a works request (APPROVED, RETURNED, or REJECTED).
 */
export async function reviewWorksRequest(
  formData: FormData,
): Promise<ActionResult> {
  const requestId = formData.get("requestId") as string;
  const schemeId = formData.get("schemeId") as string;
  const outcome = formData.get("outcome") as string;
  const procurementRoute =
    (formData.get("procurementRoute") as string) || null;
  const comments = (formData.get("comments") as string)?.trim() || null;
  const returnReason =
    (formData.get("returnReason") as string)?.trim() || null;

  if (!requestId || !schemeId) return { error: "Request and scheme required." };
  const validOutcomes = [
    "APPROVED",
    "RETURNED",
    "REJECTED",
    "EMERGENCY_APPROVED",
  ];
  if (!validOutcomes.includes(outcome))
    return { error: "Invalid review outcome." };

  try {
    const { profile } = await requireSchemeMembership(schemeId, [
      "ADVISER",
      "COMMITTEE",
    ]);

    await db.transaction(async (tx) => {
      // Create the review record
      await tx.orm.public.WorksRequestReview.create({
        requestId,
        reviewerId: profile.id,
        outcome,
        procurementRoute,
        comments,
        returnReason,
      });

      // Update request status based on outcome
      const statusMap: Record<string, string> = {
        APPROVED: "SCOPE_PREPARATION",
        RETURNED: "DRAFT",
        REJECTED: "CLOSED",
        EMERGENCY_APPROVED: "PROCUREMENT",
      };
      const newStatus = statusMap[outcome] ?? "UNDER_REVIEW";

      await tx.orm.public.WorksRequest
        .where((r) => r.id.eq(requestId))
        .update({
          status: newStatus,
          closedAt:
            outcome === "REJECTED"
              ? toTimestamp(new Date().toISOString())
              : null,
        });
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "WORK_ORDER_STATUS_UPDATED",
      entityType: "WorkOrder",
      entityId: requestId,
      metadata: { outcome, procurementRoute, module: "works" },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to review request." };
  }
}

/**
 * Assign a works request to a profile (strata manager, building manager, etc.).
 */
export async function assignWorksRequest(
  formData: FormData,
): Promise<ActionResult> {
  const requestId = formData.get("requestId") as string;
  const schemeId = formData.get("schemeId") as string;
  const assignedToId = formData.get("assignedToId") as string;

  if (!requestId || !schemeId || !assignedToId)
    return { error: "Request, scheme, and assignee are required." };

  try {
    const { profile } = await requireSchemeMembership(schemeId, [
      "ADVISER",
    ]);

    await db.orm.public.WorksRequest.where((r) => r.id.eq(requestId)).update({
      assignedToId,
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "WORK_ORDER_STATUS_UPDATED",
      entityType: "WorkOrder",
      entityId: requestId,
      metadata: { assignedToId, module: "works" },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to assign request." };
  }
}

// ─── Contractors ────────────────────────────────────────────────

/**
 * Register a new contractor business.
 */
export async function createContractorBusiness(
  formData: FormData,
): Promise<ActionResult> {
  const companyName = (formData.get("companyName") as string)?.trim();
  const tradingName =
    (formData.get("tradingName") as string)?.trim() || null;
  const abn = (formData.get("abn") as string)?.trim() || null;
  const acn = (formData.get("acn") as string)?.trim() || null;
  const registeredAddress =
    (formData.get("registeredAddress") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  const email = (formData.get("email") as string)?.trim() || null;
  const website = (formData.get("website") as string)?.trim() || null;
  const tradeCategoriesRaw =
    (formData.get("tradeCategories") as string)?.trim() || "";
  const gstRegistered = formData.get("gstRegistered") === "true";
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!companyName) return { error: "Company name is required." };

  try {
    await requireAuth();

    const tradeCategories = tradeCategoriesRaw
      ? tradeCategoriesRaw.split(",").map((c) => c.trim())
      : [];

    await db.orm.public.ContractorBusiness.create({
      companyName: toVarchar<300>(companyName),
      tradingName: tradingName ? toVarchar<300>(tradingName) : null,
      abn: abn ? toVarchar<11>(abn) : null,
      acn: acn ? toVarchar<9>(acn) : null,
      registeredAddress,
      phone: phone ? toVarchar<20>(phone) : null,
      email: email ? toVarchar<320>(email) : null,
      website: website ? toVarchar<500>(website) : null,
      tradeCategories,
      gstRegistered,
      notes,
      status: "PENDING",
    });

    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to register contractor." };
  }
}

/**
 * Update an existing contractor business.
 */
export async function updateContractorBusiness(
  formData: FormData,
): Promise<ActionResult> {
  const contractorId = formData.get("contractorId") as string;
  const companyName = (formData.get("companyName") as string)?.trim();
  const tradingName =
    (formData.get("tradingName") as string)?.trim() || null;
  const abn = (formData.get("abn") as string)?.trim() || null;
  const acn = (formData.get("acn") as string)?.trim() || null;
  const registeredAddress =
    (formData.get("registeredAddress") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  const email = (formData.get("email") as string)?.trim() || null;
  const website = (formData.get("website") as string)?.trim() || null;
  const tradeCategoriesRaw =
    (formData.get("tradeCategories") as string)?.trim() || "";
  const gstRegistered = formData.get("gstRegistered") === "true";
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!contractorId) return { error: "Contractor ID is required." };
  if (!companyName) return { error: "Company name is required." };

  try {
    await requireAuth();

    const tradeCategories = tradeCategoriesRaw
      ? tradeCategoriesRaw.split(",").map((c) => c.trim())
      : [];

    await db.orm.public.ContractorBusiness
      .where((c) => c.id.eq(contractorId))
      .update({
        companyName: toVarchar<300>(companyName),
        tradingName: tradingName ? toVarchar<300>(tradingName) : null,
        abn: abn ? toVarchar<11>(abn) : null,
        acn: acn ? toVarchar<9>(acn) : null,
        registeredAddress,
        phone: phone ? toVarchar<20>(phone) : null,
        email: email ? toVarchar<320>(email) : null,
        website: website ? toVarchar<500>(website) : null,
        tradeCategories,
        gstRegistered,
        notes,
      });

    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update contractor." };
  }
}

// ─── RFQ ────────────────────────────────────────────────────────

/**
 * Create a Request for Quotation from a scope.
 */
export async function createWorksRfq(
  formData: FormData,
): Promise<ActionResult> {
  const scopeId = formData.get("scopeId") as string;
  const schemeId = formData.get("schemeId") as string;
  const title = (formData.get("title") as string)?.trim();
  const description =
    (formData.get("description") as string)?.trim() || null;
  const closingDate = formData.get("closingDate") as string;

  if (!scopeId || !schemeId) return { error: "Scope and scheme are required." };
  if (!title) return { error: "Title is required." };
  if (!closingDate) return { error: "Closing date is required." };

  try {
    const { profile } = await requireSchemeMembership(schemeId, [
      "ADVISER",
    ]);

    // Get the current scope version
    const scope = await db.orm.public.WorksScope
      .where((s) => s.id.eq(scopeId))
      .first();
    if (!scope) return { error: "Scope not found." };

    const rfqNumber = await generateNumber("RFQ", schemeId, "WorksRfq");

    await db.orm.public.WorksRfq.create({
      scopeId,
      schemeId,
      rfqNumber: toVarchar<30>(rfqNumber),
      title: toVarchar<300>(title),
      description,
      closingDate: toTimestamp(closingDate),
      scopeVersionUsed: scope.currentVersion,
      status: "DRAFT",
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "WORK_ORDER_CREATED",
      entityType: "WorkOrder",
      metadata: { rfqNumber, title, module: "works_rfq" },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to create RFQ." };
  }
}

/**
 * Issue an RFQ (move from DRAFT to ISSUED).
 */
export async function issueWorksRfq(
  rfqId: string,
  schemeId: string,
): Promise<ActionResult> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, [
      "ADVISER",
    ]);

    const rfq = await db.orm.public.WorksRfq
      .where((r) => and(r.id.eq(rfqId), r.schemeId.eq(schemeId)))
      .first();

    if (!rfq) return { error: "RFQ not found." };
    if (rfq.status !== "DRAFT")
      return { error: "Only draft RFQs can be issued." };

    await db.orm.public.WorksRfq.where((r) => r.id.eq(rfqId)).update({
      status: "ISSUED",
      issuedAt: toTimestamp(new Date().toISOString()),
      issuedById: profile.id,
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "WORK_ORDER_STATUS_UPDATED",
      entityType: "WorkOrder",
      entityId: rfqId,
      metadata: { status: "ISSUED", module: "works_rfq" },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to issue RFQ." };
  }
}

// ─── Quotations ─────────────────────────────────────────────────

/**
 * Submit a quotation for an RFQ.
 */
export async function submitWorksQuotation(
  formData: FormData,
): Promise<ActionResult> {
  const rfqId = formData.get("rfqId") as string;
  const contractorBusinessId = formData.get("contractorBusinessId") as string;
  const subtotalRaw = (formData.get("subtotal") as string)?.trim();
  const gstAmountRaw = (formData.get("gstAmount") as string)?.trim() || "0";
  const totalAmountRaw = (formData.get("totalAmount") as string)?.trim();
  const validUntil = (formData.get("validUntil") as string) || null;
  const estimatedDurationRaw =
    (formData.get("estimatedDuration") as string)?.trim() || null;
  const methodology =
    (formData.get("methodology") as string)?.trim() || null;
  const inclusions =
    (formData.get("inclusions") as string)?.trim() || null;
  const exclusions =
    (formData.get("exclusions") as string)?.trim() || null;
  const conditions =
    (formData.get("conditions") as string)?.trim() || null;

  if (!rfqId || !contractorBusinessId)
    return { error: "RFQ and contractor are required." };
  if (!subtotalRaw || !totalAmountRaw)
    return { error: "Subtotal and total amount are required." };

  try {
    await requireAuth();

    const rfq = await db.orm.public.WorksRfq
      .where((r) => r.id.eq(rfqId))
      .first();
    if (!rfq) return { error: "RFQ not found." };

    // Generate quotation number
    const existingCount = await db.orm.public.WorksQuotation
      .where((q) => q.rfqId.eq(rfqId))
      .count();
    const quotationNumber = `Q-${rfq.rfqNumber}-${String(Number(existingCount ?? 0) + 1).padStart(2, "0")}`;

    await db.transaction(async (tx) => {
      const quotation = await tx.orm.public.WorksQuotation.create({
        rfqId,
        contractorBusinessId,
        quotationNumber: toVarchar<30>(quotationNumber),
        subtotal: toNumeric(Number(subtotalRaw)),
        gstAmount: toNumeric(Number(gstAmountRaw)),
        totalAmount: toNumeric(Number(totalAmountRaw)),
        validUntil: validUntil ? toTimestamp(validUntil) : null,
        estimatedDuration: estimatedDurationRaw
          ? Number(estimatedDurationRaw)
          : null,
        methodology,
        inclusions,
        exclusions,
        conditions,
        status: "SUBMITTED",
        submittedAt: toTimestamp(new Date().toISOString()),
        currentVersion: 1,
      });

      // Create version 1 snapshot
      await tx.orm.public.WorksQuotationVersion.create({
        quotationId: quotation.id,
        versionNumber: 1,
        subtotal: toNumeric(Number(subtotalRaw)),
        gstAmount: toNumeric(Number(gstAmountRaw)),
        totalAmount: toNumeric(Number(totalAmountRaw)),
        methodology,
        inclusions,
        exclusions,
        conditions,
        changeReason: "Initial submission",
      });
    });

    await logActivity({
      schemeId: rfq.schemeId,
      actorId: (await requireAuth()).id,
      action: "QUOTE_SUBMITTED",
      entityType: "Quote",
      metadata: { rfqId, quotationNumber, module: "works" },
    });

    revalidatePath(`/adviser/schemes/${rfq.schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to submit quotation." };
  }
}

// ─── Contracts ──────────────────────────────────────────────────

/**
 * Create a contract from an approved quotation.
 */
export async function createWorksContract(
  formData: FormData,
): Promise<ActionResult> {
  const requestId = formData.get("requestId") as string;
  const schemeId = formData.get("schemeId") as string;
  const quotationId = (formData.get("quotationId") as string) || null;
  const contractorBusinessId = formData.get(
    "contractorBusinessId",
  ) as string;
  const title = (formData.get("title") as string)?.trim();
  const description =
    (formData.get("description") as string)?.trim() || null;
  const contractValueRaw = (formData.get("contractValue") as string)?.trim();
  const gstAmountRaw =
    (formData.get("gstAmount") as string)?.trim() || "0";
  const totalValueRaw = (formData.get("totalValue") as string)?.trim();
  const startDate = (formData.get("startDate") as string) || null;
  const endDate = (formData.get("endDate") as string) || null;
  const retentionPercentageRaw =
    (formData.get("retentionPercentage") as string)?.trim() || null;

  if (!requestId || !schemeId || !contractorBusinessId)
    return { error: "Request, scheme, and contractor are required." };
  if (!title) return { error: "Title is required." };
  if (!contractValueRaw || !totalValueRaw)
    return { error: "Contract value and total are required." };

  try {
    const { profile } = await requireSchemeMembership(schemeId, [
      "ADVISER",
    ]);

    const contractNumber = await generateNumber(
      "CON",
      schemeId,
      "WorksContract",
    );

    await db.orm.public.WorksContract.create({
      requestId,
      schemeId,
      quotationId,
      contractorBusinessId,
      contractNumber: toVarchar<30>(contractNumber),
      title: toVarchar<300>(title),
      description,
      contractValue: toNumeric(Number(contractValueRaw)),
      gstAmount: toNumeric(Number(gstAmountRaw)),
      totalValue: toNumeric(Number(totalValueRaw)),
      startDate: startDate ? toTimestamp(startDate) : null,
      endDate: endDate ? toTimestamp(endDate) : null,
      retentionPercentage: retentionPercentageRaw
        ? (toNumeric(Number(retentionPercentageRaw)) as unknown as Numeric<5, 2>)
        : null,
      status: "DRAFT",
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "WORK_ORDER_CREATED",
      entityType: "WorkOrder",
      metadata: { contractNumber, title, module: "works_contract" },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to create contract." };
  }
}

// ─── Work Orders ────────────────────────────────────────────────

/**
 * Create a work order under a contract.
 */
export async function createWorksWorkOrder(
  formData: FormData,
): Promise<ActionResult> {
  const contractId = formData.get("contractId") as string;
  const schemeId = formData.get("schemeId") as string;
  const contractorBusinessId = formData.get(
    "contractorBusinessId",
  ) as string;
  const title = (formData.get("title") as string)?.trim();
  const description =
    (formData.get("description") as string)?.trim() || null;
  const scheduledStart =
    (formData.get("scheduledStart") as string) || null;
  const scheduledEnd = (formData.get("scheduledEnd") as string) || null;

  if (!contractId || !schemeId || !contractorBusinessId)
    return { error: "Contract, scheme, and contractor are required." };
  if (!title) return { error: "Title is required." };

  try {
    const { profile } = await requireSchemeMembership(schemeId, [
      "ADVISER",
      "COMMITTEE",
    ]);

    const workOrderNumber = await generateNumber(
      "WO",
      schemeId,
      "WorksWorkOrder",
    );

    await db.orm.public.WorksWorkOrder.create({
      contractId,
      schemeId,
      contractorBusinessId,
      workOrderNumber: toVarchar<30>(workOrderNumber),
      title: toVarchar<300>(title),
      description,
      scheduledStart: scheduledStart ? toTimestamp(scheduledStart) : null,
      scheduledEnd: scheduledEnd ? toTimestamp(scheduledEnd) : null,
      status: "DRAFT",
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "WORK_ORDER_CREATED",
      entityType: "WorkOrder",
      metadata: { workOrderNumber, title, module: "works_work_order" },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to create work order." };
  }
}

// ─── Invoices ───────────────────────────────────────────────────

/**
 * Submit an invoice against a contract or work order.
 */
export async function submitWorksInvoice(
  formData: FormData,
): Promise<ActionResult> {
  const schemeId = formData.get("schemeId") as string;
  const contractId = (formData.get("contractId") as string) || null;
  const requestId = (formData.get("requestId") as string) || null;
  const milestoneId = (formData.get("milestoneId") as string) || null;
  const contractorBusinessId = formData.get(
    "contractorBusinessId",
  ) as string;
  const invoiceNumber = (formData.get("invoiceNumber") as string)?.trim();
  const invoiceDate = formData.get("invoiceDate") as string;
  const dueDate = formData.get("dueDate") as string;
  const claimedAmountRaw = (formData.get("claimedAmount") as string)?.trim();
  const gstAmountRaw =
    (formData.get("gstAmount") as string)?.trim() || "0";
  const documentUrl =
    (formData.get("documentUrl") as string)?.trim() || null;

  if (!schemeId || !contractorBusinessId)
    return { error: "Scheme and contractor are required." };
  if (!invoiceNumber) return { error: "Invoice number is required." };
  if (!invoiceDate || !dueDate)
    return { error: "Invoice date and due date are required." };
  if (!claimedAmountRaw)
    return { error: "Claimed amount is required." };

  try {
    const { profile } = await requireSchemeMembership(schemeId, [
      "ADVISER",
      "ACCOUNTANT",
      "SUPPLIER",
    ]);

    await db.orm.public.WorksInvoice.create({
      requestId,
      contractId,
      milestoneId,
      schemeId,
      contractorBusinessId,
      submittedById: profile.id,
      invoiceNumber: toVarchar<50>(invoiceNumber),
      invoiceDate: toTimestamp(invoiceDate),
      dateReceived: toTimestamp(new Date().toISOString().split("T")[0]),
      dueDate: toTimestamp(dueDate),
      claimedAmount: toNumeric(Number(claimedAmountRaw)),
      gstAmount: toNumeric(Number(gstAmountRaw)),
      paidAmount: toNumeric(0),
      variationReferences: [],
      status: "SUBMITTED",
      documentUrl,
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "INVOICE_SUBMITTED",
      entityType: "Invoice",
      metadata: { invoiceNumber, module: "works" },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to submit invoice." };
  }
}

/**
 * Update an existing works invoice.
 */
export async function updateWorksInvoice(
  formData: FormData,
): Promise<ActionResult> {
  const invoiceId = formData.get("invoiceId") as string;
  const schemeId = formData.get("schemeId") as string;
  const contractId = (formData.get("contractId") as string) || null;
  const contractorBusinessId = formData.get(
    "contractorBusinessId",
  ) as string;
  const invoiceNumber = (formData.get("invoiceNumber") as string)?.trim();
  const invoiceDate = formData.get("invoiceDate") as string;
  const dueDate = formData.get("dueDate") as string;
  const claimedAmountRaw = (formData.get("claimedAmount") as string)?.trim();
  const gstAmountRaw =
    (formData.get("gstAmount") as string)?.trim() || "0";

  if (!invoiceId || !schemeId)
    return { error: "Invoice and scheme are required." };
  if (!contractorBusinessId)
    return { error: "Contractor is required." };
  if (!invoiceNumber) return { error: "Invoice number is required." };
  if (!invoiceDate || !dueDate)
    return { error: "Invoice date and due date are required." };
  if (!claimedAmountRaw)
    return { error: "Claimed amount is required." };

  try {
    const { profile } = await requireSchemeMembership(schemeId, [
      "ADVISER",
    ]);

    await db.orm.public.WorksInvoice
      .where((i) => i.id.eq(invoiceId))
      .update({
        contractId,
        contractorBusinessId,
        invoiceNumber: toVarchar<50>(invoiceNumber),
        invoiceDate: toTimestamp(invoiceDate),
        dueDate: toTimestamp(dueDate),
        claimedAmount: toNumeric(Number(claimedAmountRaw)),
        gstAmount: toNumeric(Number(gstAmountRaw)),
      });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "WORK_ORDER_STATUS_UPDATED",
      entityType: "Invoice",
      metadata: { invoiceId, invoiceNumber, module: "works_invoice" },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update invoice." };
  }
}

/**
 * Assess an invoice (set the assessed amount).
 */
export async function assessWorksInvoice(
  formData: FormData,
): Promise<ActionResult> {
  const invoiceId = formData.get("invoiceId") as string;
  const schemeId = formData.get("schemeId") as string;
  const assessedAmountRaw = (
    formData.get("assessedAmount") as string
  )?.trim();
  const assessmentNotes =
    (formData.get("assessmentNotes") as string)?.trim() || null;
  const differenceReasons =
    (formData.get("differenceReasons") as string)?.trim() || null;

  if (!invoiceId || !schemeId)
    return { error: "Invoice and scheme are required." };
  if (!assessedAmountRaw)
    return { error: "Assessed amount is required." };

  try {
    const { profile } = await requireSchemeMembership(schemeId, [
      "ADVISER",
      "ACCOUNTANT",
    ]);

    await db.transaction(async (tx) => {
      // Update invoice
      await tx.orm.public.WorksInvoice
        .where((i) => i.id.eq(invoiceId))
        .update({
          assessedAmount: toNumeric(Number(assessedAmountRaw)),
          assessedById: profile.id,
          assessedAt: toTimestamp(new Date().toISOString()),
          assessmentNotes,
          differenceReasons,
          status: "APPROVED",
        });

      // Create payment assessment record
      const invoice = await tx.orm.public.WorksInvoice
        .where((i) => i.id.eq(invoiceId))
        .first();

      if (invoice) {
        await tx.orm.public.WorksPaymentAssessment.create({
          invoiceId,
          assessorId: profile.id,
          assessedAmount: toNumeric(Number(assessedAmountRaw)),
          previousClaims: toNumeric(0),
          previousPayments: toNumeric(0),
          thisClaimAmount: toNumeric(Number(assessedAmountRaw)),
          comments: assessmentNotes,
        });
      }
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "SUPPLIER_INVOICE_APPROVED",
      entityType: "SupplierInvoice",
      entityId: invoiceId,
      metadata: {
        assessedAmount: Number(assessedAmountRaw),
        module: "works",
      },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to assess invoice." };
  }
}

// ─── Payments ───────────────────────────────────────────────────

/**
 * Create a payment instruction (authorise payment for an invoice).
 */
export async function authoriseWorksPayment(
  formData: FormData,
): Promise<ActionResult> {
  const invoiceId = formData.get("invoiceId") as string;
  const schemeId = formData.get("schemeId") as string;
  const approvedAmountRaw = (
    formData.get("approvedAmount") as string
  )?.trim();
  const beneficiary = (formData.get("beneficiary") as string)?.trim();
  const bankDetailVersionId =
    (formData.get("bankDetailVersionId") as string) || null;

  if (!invoiceId || !schemeId)
    return { error: "Invoice and scheme are required." };
  if (!approvedAmountRaw)
    return { error: "Approved amount is required." };
  if (!beneficiary) return { error: "Beneficiary is required." };

  try {
    const { profile } = await requireSchemeMembership(schemeId, [
      "ADVISER",
      "ADVISER",
    ]);

    await db.transaction(async (tx) => {
      await tx.orm.public.WorksPaymentInstruction.create({
        invoiceId,
        authorisedById: profile.id,
        approvedAmount: toNumeric(Number(approvedAmountRaw)),
        beneficiary: toVarchar<300>(beneficiary),
        bankDetailVersionId,
        status: "PENDING",
      });

      // Update invoice status
      await tx.orm.public.WorksInvoice
        .where((i) => i.id.eq(invoiceId))
        .update({
          approvedAmount: toNumeric(Number(approvedAmountRaw)),
          status: "PAYMENT_INSTRUCTED",
        });
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "SUPPLIER_INVOICE_PAYMENT",
      entityType: "SupplierInvoice",
      entityId: invoiceId,
      metadata: {
        approvedAmount: Number(approvedAmountRaw),
        beneficiary,
        module: "works",
      },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to authorise payment." };
  }
}

/**
 * Record a payment against a payment instruction.
 */
export async function recordWorksPayment(
  formData: FormData,
): Promise<ActionResult> {
  const paymentInstructionId = formData.get(
    "paymentInstructionId",
  ) as string;
  const schemeId = formData.get("schemeId") as string;
  const externalReference =
    (formData.get("externalReference") as string)?.trim() || null;
  const paymentMethod = (formData.get("paymentMethod") as string) || "EFT";
  const amountRaw = (formData.get("amount") as string)?.trim();
  const paymentDate = formData.get("paymentDate") as string;
  const remittanceInfo =
    (formData.get("remittanceInfo") as string)?.trim() || null;

  if (!paymentInstructionId || !schemeId)
    return { error: "Payment instruction and scheme are required." };
  if (!amountRaw) return { error: "Amount is required." };
  if (!paymentDate) return { error: "Payment date is required." };

  const validMethods = ["EFT", "CHEQUE", "BPAY", "DIRECT_DEBIT"];
  if (!validMethods.includes(paymentMethod))
    return { error: "Invalid payment method." };

  try {
    const { profile } = await requireSchemeMembership(schemeId, [
      "ADVISER",
      "ACCOUNTANT",
    ]);

    await db.transaction(async (tx) => {
      await tx.orm.public.WorksPaymentRecord.create({
        paymentInstructionId,
        externalReference: externalReference ? toVarchar<200>(externalReference) : null,
        paymentMethod,
        amount: toNumeric(Number(amountRaw)),
        paymentDate: toTimestamp(paymentDate),
        recordedById: profile.id,
        remittanceInfo,
        reconciliationStatus: "UNRECONCILED",
      });

      // Fetch the instruction to find its invoice
      const instruction = await tx.orm.public.WorksPaymentInstruction
        .where((pi) => pi.id.eq(paymentInstructionId))
        .first();

      if (instruction) {
        // Update the invoice's paid amount
        const invoice = await tx.orm.public.WorksInvoice
          .where((i) => i.id.eq(instruction.invoiceId))
          .first();

        if (invoice) {
          const newPaidAmount =
            Number(invoice.paidAmount) + Number(amountRaw);
          const newStatus =
            newPaidAmount >= Number(invoice.approvedAmount ?? invoice.claimedAmount)
              ? "PAID"
              : "PAYMENT_INSTRUCTED";

          await tx.orm.public.WorksInvoice
            .where((i) => i.id.eq(instruction.invoiceId))
            .update({
              paidAmount: toNumeric(newPaidAmount),
              status: newStatus,
            });
        }
      }
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "SUPPLIER_INVOICE_PAYMENT",
      entityType: "SupplierInvoice",
      metadata: {
        paymentInstructionId,
        amount: Number(amountRaw),
        paymentMethod,
        module: "works",
      },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to record payment." };
  }
}

// ─── Compliance Requirements ────────────────────────────────────

/**
 * Create a new compliance requirement for a scheme or organisation.
 */
export async function createComplianceRequirement(
  formData: FormData,
): Promise<ActionResult> {
  const schemeId = formData.get("schemeId") as string;
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const layer = formData.get("layer") as string;
  const documentType = formData.get("documentType") as string;
  const isMandatory = formData.get("isMandatory") === "on";
  const validityPeriodRaw = (formData.get("validityPeriod") as string)?.trim();
  const tradeCategoriesRaw = (formData.get("tradeCategories") as string)?.trim() || "";
  const isActive = formData.get("isActive") !== "off";

  if (!schemeId) return { error: "Scheme is required." };
  if (!name) return { error: "Name is required." };
  if (!layer) return { error: "Layer is required." };
  if (!documentType) return { error: "Document type is required." };

  const tradeCategories = tradeCategoriesRaw
    ? tradeCategoriesRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    await db.orm.public.WorksComplianceRequirement.create({
      schemeId,
      name: toVarchar<300>(name),
      description,
      layer,
      documentType,
      isMandatory,
      validityPeriod: validityPeriodRaw ? parseInt(validityPeriodRaw, 10) : null,
      tradeCategories,
      isActive,
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "COMPLIANCE_REQUIREMENT_CREATED",
      entityType: "ComplianceRequirement",
      metadata: { name, layer, documentType, module: "works" },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to create compliance requirement." };
  }
}

/**
 * Update an existing compliance requirement.
 */
export async function updateComplianceRequirement(
  formData: FormData,
): Promise<ActionResult> {
  const requirementId = formData.get("requirementId") as string;
  const schemeId = formData.get("schemeId") as string;
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const layer = formData.get("layer") as string;
  const documentType = formData.get("documentType") as string;
  const isMandatory = formData.get("isMandatory") === "on";
  const validityPeriodRaw = (formData.get("validityPeriod") as string)?.trim();
  const tradeCategoriesRaw = (formData.get("tradeCategories") as string)?.trim() || "";
  const isActive = formData.get("isActive") !== "off";

  if (!requirementId) return { error: "Requirement ID is required." };
  if (!schemeId) return { error: "Scheme is required." };
  if (!name) return { error: "Name is required." };

  const tradeCategories = tradeCategoriesRaw
    ? tradeCategoriesRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    await db.orm.public.WorksComplianceRequirement
      .where((r) => r.id.eq(requirementId))
      .update({
        name: toVarchar<300>(name),
        description,
        layer,
        documentType,
        isMandatory,
        validityPeriod: validityPeriodRaw ? parseInt(validityPeriodRaw, 10) : null,
        tradeCategories,
        isActive,
      });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "COMPLIANCE_REQUIREMENT_UPDATED",
      entityType: "ComplianceRequirement",
      metadata: { requirementId, name, module: "works" },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update compliance requirement." };
  }
}

/**
 * Deactivate a compliance requirement (soft delete by setting isActive = false).
 */
export async function deactivateComplianceRequirement(
  requirementId: string,
  schemeId: string,
): Promise<ActionResult> {
  if (!requirementId || !schemeId) return { error: "Missing parameters." };

  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    await db.orm.public.WorksComplianceRequirement
      .where((r) => r.id.eq(requirementId))
      .update({ isActive: false });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "COMPLIANCE_REQUIREMENT_DEACTIVATED",
      entityType: "ComplianceRequirement",
      metadata: { requirementId, module: "works" },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to deactivate compliance requirement." };
  }
}

// ─── Compliance Checks ──────────────────────────────────────────

/**
 * Submit a compliance check (e.g. contractor uploads a document).
 */
export async function submitComplianceCheck(
  formData: FormData,
): Promise<ActionResult> {
  const requirementId = formData.get("requirementId") as string;
  const contractorBusinessId = (formData.get("contractorBusinessId") as string) || null;
  const worksWorkOrderId = (formData.get("worksWorkOrderId") as string) || null;
  const documentUrl = (formData.get("documentUrl") as string)?.trim() || null;
  const documentName = (formData.get("documentName") as string)?.trim() || null;
  const expiryDateRaw = (formData.get("expiryDate") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;
  const schemeId = formData.get("schemeId") as string;

  if (!requirementId) return { error: "Requirement is required." };
  if (!schemeId) return { error: "Scheme is required." };

  try {
    const { profile } = await requireSchemeMembership(schemeId, [
      "ADVISER",
      "SUPPLIER",
    ]);

    const check = await db.orm.public.WorksComplianceCheck.create({
      requirementId,
      contractorBusinessId,
      worksWorkOrderId,
      status: "SUBMITTED",
      documentUrl,
      documentName: documentName ? toVarchar<500>(documentName) : null,
      expiryDate: expiryDateRaw ? toTimestamp(new Date(expiryDateRaw).toISOString()) : null,
      notes,
    });

    // Record verification event
    await db.orm.public.WorksVerificationEvent.create({
      complianceCheckId: check.id,
      verifiedById: profile.id,
      action: "SUBMITTED",
      previousStatus: null,
      newStatus: "SUBMITTED",
      notes,
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "COMPLIANCE_CHECK_SUBMITTED",
      entityType: "ComplianceCheck",
      metadata: { checkId: check.id, requirementId, module: "works" },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to submit compliance check." };
  }
}

/**
 * Verify a compliance check (adviser marks as verified).
 */
export async function verifyComplianceCheck(
  checkId: string,
  schemeId: string,
): Promise<ActionResult> {
  if (!checkId || !schemeId) return { error: "Missing parameters." };

  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    const check = await db.orm.public.WorksComplianceCheck
      .where((c) => c.id.eq(checkId))
      .first();

    if (!check) return { error: "Compliance check not found." };

    const previousStatus = check.status;
    const now = new Date().toISOString();

    await db.orm.public.WorksComplianceCheck
      .where((c) => c.id.eq(checkId))
      .update({
        status: "VERIFIED",
        verifiedById: profile.id,
        verifiedAt: toTimestamp(now),
      });

    await db.orm.public.WorksVerificationEvent.create({
      complianceCheckId: checkId,
      verifiedById: profile.id,
      action: "VERIFIED",
      previousStatus,
      newStatus: "VERIFIED",
      notes: null,
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "COMPLIANCE_CHECK_VERIFIED",
      entityType: "ComplianceCheck",
      metadata: { checkId, module: "works" },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to verify compliance check." };
  }
}

/**
 * Reject a compliance check with a reason.
 */
export async function rejectComplianceCheck(
  formData: FormData,
): Promise<ActionResult> {
  const checkId = formData.get("checkId") as string;
  const schemeId = formData.get("schemeId") as string;
  const rejectionReason = (formData.get("rejectionReason") as string)?.trim();

  if (!checkId) return { error: "Check ID is required." };
  if (!schemeId) return { error: "Scheme is required." };
  if (!rejectionReason) return { error: "Rejection reason is required." };

  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    const check = await db.orm.public.WorksComplianceCheck
      .where((c) => c.id.eq(checkId))
      .first();

    if (!check) return { error: "Compliance check not found." };

    const previousStatus = check.status;

    await db.orm.public.WorksComplianceCheck
      .where((c) => c.id.eq(checkId))
      .update({
        status: "REJECTED",
        rejectionReason,
      });

    await db.orm.public.WorksVerificationEvent.create({
      complianceCheckId: checkId,
      verifiedById: profile.id,
      action: "REJECTED",
      previousStatus,
      newStatus: "REJECTED",
      notes: rejectionReason,
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "COMPLIANCE_CHECK_REJECTED",
      entityType: "ComplianceCheck",
      metadata: { checkId, rejectionReason, module: "works" },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to reject compliance check." };
  }
}

// ─── Approval Routes ────────────────────────────────────────────

/**
 * Create a new approval route for a scheme.
 */
export async function createApprovalRoute(
  formData: FormData,
): Promise<ActionResult> {
  const schemeId = formData.get("schemeId") as string;
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const minAmountRaw = (formData.get("minAmount") as string)?.trim();
  const maxAmountRaw = (formData.get("maxAmount") as string)?.trim();
  const requiredApproversRaw = (formData.get("requiredApprovers") as string)?.trim();
  const approverRolesRaw = (formData.get("approverRoles") as string)?.trim() || "";
  const sortOrderRaw = (formData.get("sortOrder") as string)?.trim();

  if (!schemeId) return { error: "Scheme is required." };
  if (!name) return { error: "Name is required." };

  const approverRoles = approverRolesRaw
    ? approverRolesRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    await db.orm.public.WorksApprovalRoute.create({
      schemeId,
      name: toVarchar<200>(name),
      description,
      minAmount: minAmountRaw ? toNumeric(minAmountRaw) : null,
      maxAmount: maxAmountRaw ? toNumeric(maxAmountRaw) : null,
      requiredApprovers: requiredApproversRaw ? parseInt(requiredApproversRaw, 10) : 1,
      approverRoles,
      sortOrder: sortOrderRaw ? parseInt(sortOrderRaw, 10) : 0,
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "APPROVAL_ROUTE_CREATED",
      entityType: "ApprovalRoute",
      metadata: { name, module: "works" },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to create approval route." };
  }
}

/**
 * Update an existing approval route.
 */
export async function updateApprovalRoute(
  formData: FormData,
): Promise<ActionResult> {
  const routeId = formData.get("routeId") as string;
  const schemeId = formData.get("schemeId") as string;
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const minAmountRaw = (formData.get("minAmount") as string)?.trim();
  const maxAmountRaw = (formData.get("maxAmount") as string)?.trim();
  const requiredApproversRaw = (formData.get("requiredApprovers") as string)?.trim();
  const approverRolesRaw = (formData.get("approverRoles") as string)?.trim() || "";
  const sortOrderRaw = (formData.get("sortOrder") as string)?.trim();
  const isActive = formData.get("isActive") !== "off";

  if (!routeId) return { error: "Route ID is required." };
  if (!schemeId) return { error: "Scheme is required." };
  if (!name) return { error: "Name is required." };

  const approverRoles = approverRolesRaw
    ? approverRolesRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    await db.orm.public.WorksApprovalRoute
      .where((r) => r.id.eq(routeId))
      .update({
        name: toVarchar<200>(name),
        description,
        minAmount: minAmountRaw ? toNumeric(minAmountRaw) : null,
        maxAmount: maxAmountRaw ? toNumeric(maxAmountRaw) : null,
        requiredApprovers: requiredApproversRaw ? parseInt(requiredApproversRaw, 10) : 1,
        approverRoles,
        sortOrder: sortOrderRaw ? parseInt(sortOrderRaw, 10) : 0,
        isActive,
      });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "APPROVAL_ROUTE_UPDATED",
      entityType: "ApprovalRoute",
      metadata: { routeId, name, module: "works" },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update approval route." };
  }
}

// ─── Delegations ────────────────────────────────────────────────

/**
 * Create a new delegation of authority.
 */
export async function createDelegation(
  formData: FormData,
): Promise<ActionResult> {
  const schemeId = formData.get("schemeId") as string;
  const delegatedToId = formData.get("delegatedToId") as string;
  const authorityType = formData.get("authorityType") as string;
  const maxAmountRaw = (formData.get("maxAmount") as string)?.trim();
  const startDateRaw = (formData.get("startDate") as string)?.trim();
  const endDateRaw = (formData.get("endDate") as string)?.trim();
  const conditions = (formData.get("conditions") as string)?.trim() || null;

  if (!schemeId) return { error: "Scheme is required." };
  if (!delegatedToId) return { error: "Delegate is required." };
  if (!authorityType) return { error: "Authority type is required." };
  if (!startDateRaw) return { error: "Start date is required." };

  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    await db.orm.public.WorksDelegation.create({
      schemeId,
      delegatedById: profile.id,
      delegatedToId,
      authorityType,
      maxAmount: maxAmountRaw ? toNumeric(maxAmountRaw) : null,
      startDate: toTimestamp(new Date(startDateRaw).toISOString()),
      endDate: endDateRaw ? toTimestamp(new Date(endDateRaw).toISOString()) : null,
      conditions,
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "DELEGATION_CREATED",
      entityType: "Delegation",
      metadata: { delegatedToId, authorityType, module: "works" },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to create delegation." };
  }
}

/**
 * Revoke a delegation (set isActive = false).
 */
export async function revokeDelegation(
  delegationId: string,
  schemeId: string,
): Promise<ActionResult> {
  if (!delegationId || !schemeId) return { error: "Missing parameters." };

  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    await db.orm.public.WorksDelegation
      .where((d) => d.id.eq(delegationId))
      .update({ isActive: false });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "DELEGATION_REVOKED",
      entityType: "Delegation",
      metadata: { delegationId, module: "works" },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to revoke delegation." };
  }
}

// ─── Approval Workflows ─────────────────────────────────────────

/**
 * Submit an approval decision on a workflow (approve, reject, or defer).
 */
export async function submitApprovalDecision(
  formData: FormData,
): Promise<ActionResult> {
  const workflowId = formData.get("workflowId") as string;
  const schemeId = formData.get("schemeId") as string;
  const decision = formData.get("decision") as string;
  const comments = (formData.get("comments") as string)?.trim() || null;

  if (!workflowId) return { error: "Workflow ID is required." };
  if (!schemeId) return { error: "Scheme is required." };
  if (!decision || !["APPROVED", "REJECTED", "DEFERRED"].includes(decision)) {
    return { error: "Valid decision is required (APPROVED, REJECTED, or DEFERRED)." };
  }

  try {
    const { profile } = await requireSchemeMembership(schemeId, [
      "ADVISER",
      "COMMITTEE",
    ]);

    const workflow = await db.orm.public.WorksApprovalWorkflow
      .where((w) => w.id.eq(workflowId))
      .include("approvalRoute")
      .include("records")
      .first();

    if (!workflow) return { error: "Approval workflow not found." };
    if (workflow.status !== "PENDING") {
      return { error: "This workflow is no longer pending." };
    }

    // Check the approver hasn't already decided
    const existingRecord = workflow.records.find(
      (r) => r.approverId === profile.id,
    );
    if (existingRecord) {
      return { error: "You have already submitted a decision on this workflow." };
    }

    // Create the approval record
    await db.orm.public.WorksApprovalRecord.create({
      workflowId,
      approverId: profile.id,
      decision,
      comments,
    });

    // Check whether the workflow should be finalised
    if (decision === "REJECTED") {
      // Any rejection rejects the whole workflow
      await db.orm.public.WorksApprovalWorkflow
        .where((w) => w.id.eq(workflowId))
        .update({ status: "REJECTED" });
    } else if (decision === "APPROVED") {
      // Count approvals (including this new one)
      const approvalCount = workflow.records.filter(
        (r) => r.decision === "APPROVED",
      ).length + 1;
      const required = workflow.approvalRoute?.requiredApprovers ?? 1;

      if (approvalCount >= required) {
        await db.orm.public.WorksApprovalWorkflow
          .where((w) => w.id.eq(workflowId))
          .update({ status: "APPROVED" });
      }
    }
    // DEFERRED leaves the workflow as PENDING

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: `APPROVAL_${decision}` as ActivityAction,
      entityType: "ApprovalWorkflow",
      metadata: {
        workflowId,
        decision,
        entityType: workflow.entityType,
        entityId: workflow.entityId,
        module: "works",
      },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to submit approval decision." };
  }
}

// ─── Variations ────────────────────────────────────────────────

/**
 * Create a variation under a contract.
 */
export async function createWorksVariation(
  formData: FormData,
): Promise<ActionResult> {
  const contractId = formData.get("contractId") as string;
  const schemeId = formData.get("schemeId") as string;
  const title = (formData.get("title") as string)?.trim();
  const description =
    (formData.get("description") as string)?.trim() || "";
  const reason = (formData.get("reason") as string)?.trim() || undefined;
  const costImpactRaw = (formData.get("costImpact") as string)?.trim();
  const timeImpactRaw =
    (formData.get("timeImpact") as string)?.trim() || null;

  if (!contractId || !schemeId)
    return { error: "Contract and scheme are required." };
  if (!title) return { error: "Title is required." };
  if (!description) return { error: "Description is required." };
  if (!costImpactRaw) return { error: "Cost impact is required." };

  try {
    const { profile } = await requireSchemeMembership(schemeId, [
      "ADVISER",
    ]);

    // Get next variation number for this contract
    const lastVariation = await db.orm.public.WorksVariation
      .where((v) => v.contractId.eq(contractId))
      .orderBy((v) => v.variationNumber.desc())
      .first();
    const nextNumber = lastVariation ? lastVariation.variationNumber + 1 : 1;

    await db.orm.public.WorksVariation.create({
      contractId,
      variationNumber: nextNumber,
      title: toVarchar<300>(title),
      description,
      reason,
      requestedById: profile.id,
      costImpact: toNumeric(Number(costImpactRaw)),
      timeImpact: timeImpactRaw ? Number(timeImpactRaw) : null,
      status: "DRAFT",
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "VARIATION_CREATED",
      entityType: "WorksVariation",
      metadata: { contractId, title, module: "works_variation" },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to create variation." };
  }
}

/**
 * Submit a variation for review (move from DRAFT to SUBMITTED).
 */
export async function submitWorksVariation(
  variationId: string,
  schemeId: string,
): Promise<ActionResult> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, [
      "ADVISER",
      "COMMITTEE",
    ]);

    await db.orm.public.WorksVariation
      .where((v) => v.id.eq(variationId))
      .update({ status: "SUBMITTED" });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "VARIATION_SUBMITTED",
      entityType: "WorksVariation",
      metadata: { variationId, module: "works_variation" },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to submit variation." };
  }
}

/**
 * Approve a variation and recalculate contract totals.
 */
export async function approveWorksVariation(
  variationId: string,
  schemeId: string,
  feeConfirmedCents: number | null = null,
): Promise<ActionResult> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, [
      "ADVISER",
    ]);

    const variation = await db.orm.public.WorksVariation
      .where((v) => v.id.eq(variationId))
      .first();
    if (!variation) return { error: "Variation not found." };

    const parent = await db.orm.public.WorksContract
      .where((c) => c.id.eq(variation.contractId))
      .first();
    if (!parent || parent.schemeId !== schemeId) return { error: "Variation not found." };
    if (variation.status === "APPROVED") return { error: "This variation is already approved." };

    // Approval and the StrataVerze variation fee together.
    await db.transaction(async (tx) => {
      await tx.orm.public.WorksVariation
        .where((v) => v.id.eq(variationId))
        .update({
          status: "APPROVED",
          approvedById: profile.id,
          approvedAt: toTimestamp(new Date().toISOString()),
        });
      await captureUsageFee(tx.orm, {
        schemeId,
        code: "WORKS_VARIATION",
        sourceType: "WorksVariation",
        sourceId: variationId,
        actorId: profile.id,
        confirmedCents: feeConfirmedCents,
      });
    });

    // Recalculate parent contract approved variations total
    const approvedVariations = await db.orm.public.WorksVariation
      .where((v) => and(v.contractId.eq(variation.contractId), v.status.eq("APPROVED")))
      .all();

    // The query above already includes the variation just approved.
    const totalApproved = approvedVariations.reduce(
      (sum, v) => sum + Number(v.costImpact),
      0,
    );

    const contract = await db.orm.public.WorksContract
      .where((c) => c.id.eq(variation.contractId))
      .first();

    if (contract) {
      const revisedValue = Number(contract.contractValue) + totalApproved;
      await db.orm.public.WorksContract
        .where((c) => c.id.eq(variation.contractId))
        .update({
          approvedVariations: toNumeric(totalApproved),
          revisedContractValue: toNumeric(revisedValue),
        });
    }

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "VARIATION_APPROVED",
      entityType: "WorksVariation",
      metadata: { variationId, contractId: variation.contractId, module: "works_variation" },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    const feeError = feeErrorMessage(err);
    if (feeError) return { error: feeError };
    return { error: "Failed to approve variation." };
  }
}

/**
 * Reject a variation.
 */
export async function rejectWorksVariation(
  variationId: string,
  schemeId: string,
): Promise<ActionResult> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, [
      "ADVISER",
    ]);

    await db.orm.public.WorksVariation
      .where((v) => v.id.eq(variationId))
      .update({ status: "REJECTED" });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "VARIATION_REJECTED",
      entityType: "WorksVariation",
      metadata: { variationId, module: "works_variation" },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to reject variation." };
  }
}

/**
 * Record that a works contract has been executed (signed by the owners
 * corporation). Charges the StrataVerze works contract fee, a flat amount by
 * contract value band (never a percentage), in the same transaction.
 */
export async function executeWorksContract(
  contractId: string,
  schemeId: string,
  feeConfirmedCents: number | null = null,
): Promise<ActionResult> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const contract = await db.orm.public.WorksContract
      .where((c) => c.id.eq(contractId))
      .first();
    if (!contract || contract.schemeId !== schemeId) return { error: "Contract not found." };
    if (isExecutedContractStatus(contract.status)) return { error: "This contract is already executed." };
    if (!["DRAFT", "PENDING_SIGNATURE"].includes(String(contract.status))) {
      return { error: "Only a draft contract or one awaiting signature can be recorded as executed." };
    }

    const now = new Date().toISOString();
    await db.transaction(async (tx) => {
      await tx.orm.public.WorksContract
        .where((c) => c.id.eq(contractId))
        .update({
          status: "EXECUTED",
          signedById: profile.id,
          signedAt: toTimestamp(now),
          executedAt: toTimestamp(now),
        });
      await captureUsageFee(tx.orm, {
        schemeId,
        code: "WORKS_CONTRACT",
        bandValue: Math.round(Number(contract.contractValue) * 100),
        sourceType: "WorksContract",
        sourceId: contractId,
        actorId: profile.id,
        confirmedCents: feeConfirmedCents,
      });
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "WORK_ORDER_STATUS_UPDATED",
      entityType: "WorkOrder",
      metadata: { contractId, status: "EXECUTED", module: "works_contract" },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    const feeError = feeErrorMessage(err);
    if (feeError) return { error: feeError };
    return { error: "Failed to record execution." };
  }
}

/**
 * Update an existing works contract.
 */
export async function updateWorksContract(
  formData: FormData,
): Promise<ActionResult> {
  const contractId = formData.get("contractId") as string;
  const schemeId = formData.get("schemeId") as string;
  const title = (formData.get("title") as string)?.trim();
  const description =
    (formData.get("description") as string)?.trim() || null;
  const contractValueRaw = (formData.get("contractValue") as string)?.trim();
  const gstAmountRaw =
    (formData.get("gstAmount") as string)?.trim() || "0";
  const totalValueRaw = (formData.get("totalValue") as string)?.trim();
  const startDate = (formData.get("startDate") as string) || null;
  const endDate = (formData.get("endDate") as string) || null;
  const retentionPercentageRaw =
    (formData.get("retentionPercentage") as string)?.trim() || null;

  if (!contractId || !schemeId) return { error: "Contract and scheme are required." };
  if (!title) return { error: "Title is required." };

  try {
    const { profile } = await requireSchemeMembership(schemeId, [
      "ADVISER",
    ]);

    await db.orm.public.WorksContract
      .where((c) => c.id.eq(contractId))
      .update({
        title: toVarchar<300>(title),
        description,
        contractValue: contractValueRaw ? toNumeric(Number(contractValueRaw)) : undefined,
        gstAmount: toNumeric(Number(gstAmountRaw)),
        totalValue: totalValueRaw ? toNumeric(Number(totalValueRaw)) : undefined,
        startDate: startDate ? toTimestamp(startDate) : null,
        endDate: endDate ? toTimestamp(endDate) : null,
        retentionPercentage: retentionPercentageRaw
          ? (toNumeric(Number(retentionPercentageRaw)) as unknown as Numeric<5, 2>)
          : null,
      });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "WORK_ORDER_STATUS_UPDATED",
      entityType: "WorkOrder",
      metadata: { contractId, title, module: "works_contract" },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update contract." };
  }
}

/**
 * Update an existing works work order.
 */
export async function updateWorksWorkOrder(
  formData: FormData,
): Promise<ActionResult> {
  const workOrderId = formData.get("workOrderId") as string;
  const schemeId = formData.get("schemeId") as string;
  const title = (formData.get("title") as string)?.trim();
  const description =
    (formData.get("description") as string)?.trim() || null;
  const scheduledStart =
    (formData.get("scheduledStart") as string) || null;
  const scheduledEnd = (formData.get("scheduledEnd") as string) || null;

  if (!workOrderId || !schemeId) return { error: "Work order and scheme are required." };
  if (!title) return { error: "Title is required." };

  try {
    const { profile } = await requireSchemeMembership(schemeId, [
      "ADVISER",
      "COMMITTEE",
    ]);

    await db.orm.public.WorksWorkOrder
      .where((wo) => wo.id.eq(workOrderId))
      .update({
        title: toVarchar<300>(title),
        description,
        scheduledStart: scheduledStart ? toTimestamp(scheduledStart) : null,
        scheduledEnd: scheduledEnd ? toTimestamp(scheduledEnd) : null,
      });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "WORK_ORDER_STATUS_UPDATED",
      entityType: "WorkOrder",
      metadata: { workOrderId, title, module: "works_work_order" },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update work order." };
  }
}
