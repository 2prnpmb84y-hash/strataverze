import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString, Numeric } from "@prisma/orm-postgres/target/codec-types";

function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}
function num12(value: number): Numeric<12, 2> {
  return String(value) as unknown as Numeric<12, 2>;
}
function num14(value: number): Numeric<14, 2> {
  return String(value) as unknown as Numeric<14, 2>;
}

export interface CreateClaimData {
  schemeId: string;
  policyId?: string | null;
  title: string;
  incidentCategory?: string | null;
  incidentDate?: string | null;
  incidentTime?: string | null;
  discoveredDate?: string | null;
  incidentLocation?: string | null;
  lotReference?: string | null;
  commonProperty?: boolean | null;
  individualLot?: boolean | null;
  description?: string | null;
  damageDetails?: string | null;
  immediateAction?: string | null;
  estimatedLoss?: number | null;
  reporterType?: string | null;
  reporterName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  smsUpdates?: boolean;
  otherParties?: string | null;
}

export async function createClaim(data: CreateClaimData) {
  return db.orm.public.InsuranceClaim.create({
    schemeId: data.schemeId,
    policyId: data.policyId ?? null,
    title: data.title,
    incidentCategory: data.incidentCategory ?? null,
    incidentDate: data.incidentDate ? toTimestamp(data.incidentDate) : null,
    incidentTime: data.incidentTime ?? null,
    discoveredDate: data.discoveredDate ? toTimestamp(data.discoveredDate) : null,
    incidentLocation: data.incidentLocation ?? null,
    lotReference: data.lotReference ?? null,
    commonProperty: data.commonProperty ?? null,
    individualLot: data.individualLot ?? null,
    description: data.description ?? null,
    damageDetails: data.damageDetails ?? null,
    immediateAction: data.immediateAction ?? null,
    estimatedLoss: data.estimatedLoss != null ? num14(data.estimatedLoss) : null,
    reporterType: data.reporterType ?? null,
    reporterName: data.reporterName ?? null,
    contactEmail: data.contactEmail ?? null,
    contactPhone: data.contactPhone ?? null,
    smsUpdates: data.smsUpdates ?? false,
    otherParties: data.otherParties ?? null,
    status: "DRAFT",
  } as never);
}

export async function getClaimById(claimId: string) {
  return db.orm.public.InsuranceClaim
    .where((c) => and(c.id.eq(claimId), c.deletedAt.eq(null)))
    .include("policy")
    .include("events")
    .include("documents")
    .first();
}

export async function getClaimsForScheme(schemeId: string, limit = 200) {
  return db.orm.public.InsuranceClaim
    .where((c) => and(c.schemeId.eq(schemeId), c.deletedAt.eq(null)))
    .orderBy((c) => c.createdAt.desc())
    .limit(limit)
    .all();
}

export type UpdateClaimData = Partial<
  CreateClaimData & {
    insurerClaimRef: string | null;
    assignedOwnerId: string | null;
    assessorDetails: string | null;
    contractorDetails: string | null;
    claimedAmount: number | null;
    approvedAmount: number | null;
    paidAmount: number | null;
    excessAmount: number | null;
    settlementDetails: string | null;
    decisionReason: string | null;
  }
>;

export async function updateClaim(claimId: string, data: UpdateClaimData) {
  const u: Record<string, unknown> = {};
  const s = (k: string, v: unknown) => {
    u[k] = v;
  };
  if (data.title !== undefined) s("title", data.title);
  if (data.policyId !== undefined) s("policyId", data.policyId);
  if (data.incidentCategory !== undefined) s("incidentCategory", data.incidentCategory);
  if (data.incidentDate !== undefined)
    s("incidentDate", data.incidentDate ? toTimestamp(data.incidentDate) : null);
  if (data.incidentTime !== undefined) s("incidentTime", data.incidentTime);
  if (data.discoveredDate !== undefined)
    s("discoveredDate", data.discoveredDate ? toTimestamp(data.discoveredDate) : null);
  if (data.incidentLocation !== undefined) s("incidentLocation", data.incidentLocation);
  if (data.lotReference !== undefined) s("lotReference", data.lotReference);
  if (data.commonProperty !== undefined) s("commonProperty", data.commonProperty);
  if (data.individualLot !== undefined) s("individualLot", data.individualLot);
  if (data.description !== undefined) s("description", data.description);
  if (data.damageDetails !== undefined) s("damageDetails", data.damageDetails);
  if (data.immediateAction !== undefined) s("immediateAction", data.immediateAction);
  if (data.estimatedLoss !== undefined)
    s("estimatedLoss", data.estimatedLoss != null ? num14(data.estimatedLoss) : null);
  if (data.reporterType !== undefined) s("reporterType", data.reporterType);
  if (data.reporterName !== undefined) s("reporterName", data.reporterName);
  if (data.contactEmail !== undefined) s("contactEmail", data.contactEmail);
  if (data.contactPhone !== undefined) s("contactPhone", data.contactPhone);
  if (data.smsUpdates !== undefined) s("smsUpdates", data.smsUpdates);
  if (data.otherParties !== undefined) s("otherParties", data.otherParties);
  if (data.insurerClaimRef !== undefined) s("insurerClaimRef", data.insurerClaimRef);
  if (data.assignedOwnerId !== undefined) s("assignedOwnerId", data.assignedOwnerId);
  if (data.assessorDetails !== undefined) s("assessorDetails", data.assessorDetails);
  if (data.contractorDetails !== undefined) s("contractorDetails", data.contractorDetails);
  if (data.claimedAmount !== undefined)
    s("claimedAmount", data.claimedAmount != null ? num14(data.claimedAmount) : null);
  if (data.approvedAmount !== undefined)
    s("approvedAmount", data.approvedAmount != null ? num14(data.approvedAmount) : null);
  if (data.paidAmount !== undefined)
    s("paidAmount", data.paidAmount != null ? num14(data.paidAmount) : null);
  if (data.excessAmount !== undefined)
    s("excessAmount", data.excessAmount != null ? num12(data.excessAmount) : null);
  if (data.settlementDetails !== undefined) s("settlementDetails", data.settlementDetails);
  if (data.decisionReason !== undefined) s("decisionReason", data.decisionReason);

  return db.orm.public.InsuranceClaim.where({ id: claimId }).update(u);
}

export async function setClaimStatus(
  claimId: string,
  status: string,
  opts: { closedAt?: string | null } = {},
  orm: typeof db.orm = db.orm,
) {
  const u: Record<string, unknown> = { status };
  if (opts.closedAt !== undefined)
    u.closedAt = opts.closedAt ? toTimestamp(opts.closedAt) : null;
  return orm.public.InsuranceClaim.where({ id: claimId }).update(u);
}

export interface LodgeClaimData {
  lodgedAt: string;
  lodgedChannel?: string | null;
  lodgedRecipient?: string | null;
  lodgedReference?: string | null;
  lodgedById: string;
}

export async function recordClaimLodgement(
  claimId: string,
  data: LodgeClaimData,
  orm: typeof db.orm = db.orm,
) {
  return orm.public.InsuranceClaim.where({ id: claimId }).update({
    lodgedAt: toTimestamp(data.lodgedAt),
    lodgedChannel: data.lodgedChannel ?? null,
    lodgedRecipient: data.lodgedRecipient ?? null,
    lodgedReference: data.lodgedReference ?? null,
    lodgedById: data.lodgedById,
  });
}

export async function softDeleteClaim(claimId: string) {
  return db.orm.public.InsuranceClaim
    .where({ id: claimId })
    .update({ deletedAt: toTimestamp(new Date().toISOString()) });
}

// ─── Events (append-only timeline) ───────────────────────────────

export interface ClaimEventInput {
  claimId: string;
  eventType: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  note?: string | null;
  actorId?: string | null;
  payload?: Record<string, unknown> | null;
}

export async function recordClaimEvent(input: ClaimEventInput) {
  return db.orm.public.InsuranceClaimEvent.create({
    claimId: input.claimId,
    eventType: input.eventType,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    note: input.note ?? null,
    actorId: input.actorId ?? null,
    payload: (input.payload ?? null) as never,
  } as never);
}

export async function getClaimEvents(claimId: string) {
  return db.orm.public.InsuranceClaimEvent
    .where((e) => e.claimId.eq(claimId))
    .orderBy((e) => e.createdAt.asc())
    .all();
}
