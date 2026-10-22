/**
 * Payment controls (server side): reading a scheme's payment policy, its
 * eligible approvers, invoice authorisations and supplier bank detail versions.
 */
import { createHash } from "node:crypto";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { Numeric, Varchar } from "@prisma/orm-postgres/target/codec-types";
import { toCents } from "@/lib/billing/money";
import {
  DEFAULT_BANK_CHANGE_COOLING_OFF_BUSINESS_DAYS,
  DEFAULT_PAYMENT_POLICY,
  eligibleApprovers,
  type BankDetailVersionForControls,
  type BankDetailStatus,
  type PaymentPolicy,
  type SchemeMember,
  type VerificationMethod,
} from "@/lib/finance/payment-controls";

type Orm = typeof db.orm;

const isoTime = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? ""));
const varchar = <N extends number>(v: string) => v as unknown as Varchar<N>;

export interface SchemePaymentSettings {
  policy: PaymentPolicy;
  coolingOffDays: number;
  /** True when the scheme has never saved a policy, so the defaults apply. */
  isDefault: boolean;
}

export async function getPaymentSettings(schemeId: string, orm: Orm = db.orm): Promise<SchemePaymentSettings> {
  const row = await orm.public.SchemePaymentPolicy.where((p) => p.schemeId.eq(schemeId)).first();
  if (!row) {
    return { policy: DEFAULT_PAYMENT_POLICY, coolingOffDays: DEFAULT_BANK_CHANGE_COOLING_OFF_BUSINESS_DAYS, isDefault: true };
  }
  return {
    policy: {
      singleApproverLimitCents: toCents(String(row.singleApproverLimit)),
      requireSecondApproverAboveCents: row.requireSecondApproverAbove == null ? null : toCents(String(row.requireSecondApproverAbove)),
      allowSelfApproval: row.allowSelfApproval,
      allowAdviserApproval: row.allowAdviserApproval,
    },
    coolingOffDays: row.bankChangeCoolingOffDays,
    isDefault: false,
  };
}

/** Save the scheme's payment policy. */
export async function savePaymentPolicy(
  schemeId: string,
  input: PaymentPolicy & { coolingOffDays: number },
  updatedBy: string,
) {
  const values = {
    singleApproverLimit: String(input.singleApproverLimitCents / 100) as unknown as Numeric<12, 2>,
    requireSecondApproverAbove:
      input.requireSecondApproverAboveCents == null
        ? null
        : (String(input.requireSecondApproverAboveCents / 100) as unknown as Numeric<12, 2>),
    allowSelfApproval: input.allowSelfApproval,
    allowAdviserApproval: input.allowAdviserApproval,
    bankChangeCoolingOffDays: input.coolingOffDays,
    updatedBy,
  };
  const existing = await db.orm.public.SchemePaymentPolicy.where((p) => p.schemeId.eq(schemeId)).first();
  if (existing) {
    return db.orm.public.SchemePaymentPolicy.where((p) => p.id.eq(existing.id)).update(values);
  }
  return db.orm.public.SchemePaymentPolicy.create({ schemeId, ...values });
}

export interface ApprovalMember extends SchemeMember {
  membershipId: string;
  name: string;
}

/** Active memberships relevant to payment approval, with names. */
export async function getApprovalMembers(schemeId: string, orm: Orm = db.orm): Promise<ApprovalMember[]> {
  const rows = await orm.public.SchemeMembership
    .where((m) => and(m.schemeId.eq(schemeId), m.isActive.eq(true)))
    .include("profile")
    .limit(2000)
    .all();
  return rows.map((m) => ({
    membershipId: m.id,
    profileId: m.profileId,
    role: String(m.role),
    isActive: m.isActive,
    isTreasurer: m.isTreasurer,
    name: m.profile ? `${m.profile.firstName ?? ""} ${m.profile.lastName ?? ""}`.trim() || m.profile.email : "Member",
  }));
}

export async function getEligibleApproverIds(schemeId: string, policy: PaymentPolicy, orm: Orm = db.orm) {
  return eligibleApprovers(await getApprovalMembers(schemeId, orm), policy);
}

export interface AuthorisationRow {
  id: string;
  approverId: string;
  role: string;
  approvedAt: string;
  sequence: number;
  isException: boolean;
  exceptionReason: string | null;
}

export async function getAuthorisations(
  target: { supplierInvoiceId: string } | { worksInvoiceId: string },
  orm: Orm = db.orm,
): Promise<AuthorisationRow[]> {
  const rows =
    "supplierInvoiceId" in target
      ? await orm.public.PaymentAuthorisation.where((a) => a.supplierInvoiceId.eq(target.supplierInvoiceId))
          .orderBy((a) => a.sequence.asc())
          .limit(10)
          .all()
      : await orm.public.PaymentAuthorisation.where((a) => a.worksInvoiceId.eq(target.worksInvoiceId))
          .orderBy((a) => a.sequence.asc())
          .limit(10)
          .all();
  return rows.map((r) => ({
    id: r.id,
    approverId: r.approverId,
    role: r.role,
    approvedAt: isoTime(r.approvedAt),
    sequence: r.sequence,
    isException: r.isException,
    exceptionReason: r.exceptionReason ?? null,
  }));
}

/** A one-way hash of the approver's IP address, so the record shows where it came from without storing the address. */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const salt = process.env.PAYMENT_AUTH_IP_SALT ?? "strataverze";
  return createHash("sha256").update(`${salt}:${ip.split(",")[0].trim()}`).digest("hex");
}

// ─── Bank detail versions ───────────────────────────────────────────────────

export interface BankDetailVersionRow extends BankDetailVersionForControls {
  id: string;
  supplierId: string;
  newBsb: string | null;
  newAccountNumber: string | null;
  newAccountName: string | null;
  previousBsb: string | null;
  previousAccountNumber: string | null;
  secondVerifiedAt: string | null;
  rejectionReason: string | null;
}

function toVersionRow(r: Awaited<ReturnType<Orm["public"]["SupplierBankDetailVersion"]["all"]>>[number]): BankDetailVersionRow {
  return {
    id: r.id,
    supplierId: r.supplierId,
    status: r.status as BankDetailStatus,
    changedById: r.changedBy,
    changedAt: isoTime(r.changedAt),
    verifiedById: r.verifiedBy ?? null,
    verifiedAt: r.verifiedAt ? isoTime(r.verifiedAt) : null,
    verificationMethod: (r.verificationMethod as VerificationMethod | null) ?? null,
    secondVerifiedById: r.secondVerifiedBy ?? null,
    secondVerifiedAt: r.secondVerifiedAt ? isoTime(r.secondVerifiedAt) : null,
    newBsb: r.newBsb ?? null,
    newAccountNumber: r.newAccountNumber ?? null,
    newAccountName: r.newAccountName ?? null,
    previousBsb: r.previousBsb ?? null,
    previousAccountNumber: r.previousAccountNumber ?? null,
    rejectionReason: r.rejectionReason ?? null,
  };
}

export async function getBankDetailVersions(supplierId: string, orm: Orm = db.orm): Promise<BankDetailVersionRow[]> {
  const rows = await orm.public.SupplierBankDetailVersion.where((v) => v.supplierId.eq(supplierId))
    .orderBy((v) => v.changedAt.desc())
    .limit(100)
    .all();
  return rows.map(toVersionRow);
}

export async function getLatestBankDetailVersion(supplierId: string, orm: Orm = db.orm) {
  return (await getBankDetailVersions(supplierId, orm))[0] ?? null;
}

export async function getBankDetailVersionById(id: string, orm: Orm = db.orm) {
  const r = await orm.public.SupplierBankDetailVersion.where((v) => v.id.eq(id)).first();
  return r ? toVersionRow(r) : null;
}

/** Record a bank detail change. The new details need verifying before any payment. */
export async function recordBankDetailChange(
  orm: Orm,
  input: {
    supplierId: string;
    schemeId: string | null;
    previous: { bsb: string | null; accountNumber: string | null; accountName: string | null };
    next: { bsb: string | null; accountNumber: string | null; accountName: string | null };
    changedBy: string;
  },
) {
  const v7 = (s: string | null) => (s ? varchar<7>(s.slice(0, 7)) : null);
  const v20 = (s: string | null) => (s ? varchar<20>(s.slice(0, 20)) : null);
  const v200 = (s: string | null) => (s ? varchar<200>(s.slice(0, 200)) : null);
  return orm.public.SupplierBankDetailVersion.create({
    supplierId: input.supplierId,
    schemeId: input.schemeId,
    previousBsb: v7(input.previous.bsb),
    previousAccountNumber: v20(input.previous.accountNumber),
    previousAccountName: v200(input.previous.accountName),
    newBsb: v7(input.next.bsb),
    newAccountNumber: v20(input.next.accountNumber),
    newAccountName: v200(input.next.accountName),
    changedBy: input.changedBy,
    status: "PENDING",
  });
}

/** Whether bank details have changed (ignoring formatting such as the BSB hyphen and spaces). */
export function bankDetailsDiffer(
  a: { bsb: string | null; accountNumber: string | null; accountName: string | null },
  b: { bsb: string | null; accountNumber: string | null; accountName: string | null },
): boolean {
  const norm = (s: string | null) => (s ?? "").replace(/[\s-]/g, "").toUpperCase();
  return norm(a.bsb) !== norm(b.bsb) || norm(a.accountNumber) !== norm(b.accountNumber) || norm(a.accountName) !== norm(b.accountName);
}
