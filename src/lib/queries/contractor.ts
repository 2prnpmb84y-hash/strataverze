/**
 * Contractor onboarding query layer.
 *
 * All queries use the Prisma 8 ORM pattern:
 *   db.orm.public.<Model>.where(...).first() / .all() / .aggregate((a) => ({ n: a.count() }))
 */

import { db } from "@/prisma/db";
import { and, or } from "@prisma/orm-postgres/orm-client";

// ─── Single-record queries ───────────────────────────────────────

/**
 * Find the ContractorBusiness where the given profile is the primary contact.
 */
export async function getContractorBusinessForProfile(profileId: string) {
  const contact = await db.orm.public.ContractorContact
    .where((c) => and(c.profileId.eq(profileId), c.isPrimary.eq(true)))
    .first();

  if (!contact) return null;

  const business = await db.orm.public.ContractorBusiness
    .where({ id: contact.contractorBusinessId })
    .first();

  return business;
}

/**
 * Get a contractor business by its primary key.
 */
export async function getContractorBusinessById(
  contractorBusinessId: string,
) {
  return db.orm.public.ContractorBusiness.first({ id: contractorBusinessId });
}

/**
 * Get the onboarding record for a contractor business.
 */
export async function getContractorOnboarding(
  contractorBusinessId: string,
) {
  return db.orm.public.ContractorOnboarding
    .where((o) => o.contractorBusinessId.eq(contractorBusinessId))
    .first();
}

/**
 * Get the membership record for a contractor business.
 */
export async function getContractorMembership(
  contractorBusinessId: string,
) {
  return db.orm.public.ContractorMembership
    .where((m) => m.contractorBusinessId.eq(contractorBusinessId))
    .first();
}

// ─── Collection queries ──────────────────────────────────────────

/**
 * Get all licences for a contractor business, newest first.
 */
export async function getContractorLicences(
  contractorBusinessId: string,
) {
  const licences = await db.orm.public.WorksLicence
    .where((l) => l.contractorBusinessId.eq(contractorBusinessId))
    .all();

  // Sort newest first
  return licences.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/**
 * Get all insurance policies for a contractor business, newest first.
 */
export async function getContractorInsurances(
  contractorBusinessId: string,
) {
  const insurances = await db.orm.public.WorksInsurance
    .where((i) => i.contractorBusinessId.eq(contractorBusinessId))
    .all();

  return insurances.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/**
 * Get all bank detail versions for a contractor, newest version first.
 */
export async function getContractorBankDetails(
  contractorBusinessId: string,
) {
  const versions = await db.orm.public.WorksBankDetailVersion
    .where((v) => v.contractorBusinessId.eq(contractorBusinessId))
    .all();

  return versions.sort((a, b) => b.versionNumber - a.versionNumber);
}

/**
 * Get only the latest (highest version number) bank detail version.
 */
export async function getLatestBankDetails(
  contractorBusinessId: string,
) {
  const all = await getContractorBankDetails(contractorBusinessId);
  return all.length > 0 ? all[0] : null;
}

/**
 * Get all ABN lookup records for a contractor, newest first.
 */
export async function getAbnLookupHistory(
  contractorBusinessId: string,
) {
  const records = await db.orm.public.AbnLookupRecord
    .where((r) => r.contractorBusinessId.eq(contractorBusinessId))
    .all();

  return records.sort(
    (a, b) =>
      new Date(b.lookupTimestamp).getTime() -
      new Date(a.lookupTimestamp).getTime(),
  );
}

/**
 * Get all declarations for a contractor business.
 */
export async function getContractorDeclarations(
  contractorBusinessId: string,
) {
  return db.orm.public.ContractorDeclaration
    .where((d) => d.contractorBusinessId.eq(contractorBusinessId))
    .all();
}

/**
 * Get all review items for a contractor business.
 */
export async function getContractorReviewItems(
  contractorBusinessId: string,
) {
  const items = await db.orm.public.ContractorReviewItem
    .where((r) => r.contractorBusinessId.eq(contractorBusinessId))
    .all();

  return items.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/**
 * Get all contacts for a contractor business.
 */
export async function getContractorContacts(
  contractorBusinessId: string,
) {
  return db.orm.public.ContractorContact
    .where((c) => c.contractorBusinessId.eq(contractorBusinessId))
    .all();
}

// ─── Dashboard aggregate ─────────────────────────────────────────

export interface ContractorDashboardData {
  business: Awaited<ReturnType<typeof getContractorBusinessById>>;
  onboarding: Awaited<ReturnType<typeof getContractorOnboarding>>;
  membership: Awaited<ReturnType<typeof getContractorMembership>>;
  latestBank: Awaited<ReturnType<typeof getLatestBankDetails>>;
  licenceCount: number;
  insuranceCount: number;
  pendingReviewCount: number;
}

/**
 * Aggregated data for the contractor dashboard.
 * Runs queries in parallel for performance.
 */
export async function getContractorDashboardData(
  contractorBusinessId: string,
): Promise<ContractorDashboardData> {
  const [
    business,
    onboarding,
    membership,
    latestBank,
  ] = await Promise.all([
    getContractorBusinessById(contractorBusinessId),
    getContractorOnboarding(contractorBusinessId),
    getContractorMembership(contractorBusinessId),
    getLatestBankDetails(contractorBusinessId),
  ]);

  const licenceCount = Number(
    await db.orm.public.WorksLicence
      .where((l) => l.contractorBusinessId.eq(contractorBusinessId))
      .aggregate((a) => ({ n: a.count() })).then((r) => r.n),
  );
  const insuranceCount = Number(
    await db.orm.public.WorksInsurance
      .where((i) => i.contractorBusinessId.eq(contractorBusinessId))
      .aggregate((a) => ({ n: a.count() })).then((r) => r.n),
  );
  const pendingReviewCount = Number(
    await db.orm.public.ContractorReviewItem
      .where((r) =>
        and(
          r.contractorBusinessId.eq(contractorBusinessId),
          r.status.eq("PENDING"),
        ),
      )
      .aggregate((a) => ({ n: a.count() })).then((r) => r.n),
  );

  return {
    business,
    onboarding,
    membership,
    latestBank,
    licenceCount,
    insuranceCount,
    pendingReviewCount,
  };
}

// ─── Alias exports for onboarding page ──────────────────────────

/** Alias used by the onboarding page server component. */
export const getOnboardingForBusiness = getContractorOnboarding;
export const getLicencesForBusiness = getContractorLicences;
export const getInsurancesForBusiness = getContractorInsurances;
export const getBankDetailsForBusiness = getContractorBankDetails;
export const getMembershipForBusiness = getContractorMembership;
export const getDeclarationsForBusiness = getContractorDeclarations;
export const getAbnLookupsForBusiness = getAbnLookupHistory;

// ─── Admin review queries ────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
};

/**
 * Get review queue items filtered by queue type and optional status.
 * Ordered by priority (URGENT first) then by creation date ascending.
 */
export async function getReviewQueue(
  queueType: string,
  status?: string,
  limit = 50,
  offset = 0,
) {
  let items: Awaited<ReturnType<typeof db.orm.public.ContractorReviewItem.all>>;

  if (status) {
    items = await db.orm.public.ContractorReviewItem
      .where((r) => and(r.queueType.eq(queueType), r.status.eq(status)))
      .all();
  } else {
    items = await db.orm.public.ContractorReviewItem
      .where((r) => r.queueType.eq(queueType))
      .all();
  }

  // Sort by priority then date
  items.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 2;
    const pb = PRIORITY_ORDER[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    return (
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  });

  return {
    items: items.slice(offset, offset + limit),
    total: items.length,
  };
}

/**
 * Get counts of PENDING review items grouped by queue type.
 */
export async function getReviewQueueCounts() {
  const allPending = await db.orm.public.ContractorReviewItem
    .where((r) => r.status.eq("PENDING"))
    .all();

  const counts: Record<string, number> = {};
  for (const item of allPending) {
    counts[item.queueType] = (counts[item.queueType] ?? 0) + 1;
  }

  return counts;
}

// ─── Admin listing ───────────────────────────────────────────────

/**
 * List all contractor businesses with optional filtering and search.
 */
export async function getAllContractorBusinesses(options: {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const { status, search, limit = 50, offset = 0 } = options;

  let businesses: Awaited<
    ReturnType<typeof db.orm.public.ContractorBusiness.all>
  >;

  if (status && search) {
    const safe = search.replace(/[%_\\]/g, (ch) => `\\${ch}`).toLowerCase();
    businesses = await db.orm.public.ContractorBusiness
      .where((b) =>
        and(
          b.status.eq(status),
          or(
            b.companyName.ilike(`%${safe}%`),
            b.tradingName.ilike(`%${safe}%`),
          ),
        ),
      )
      .all();
  } else if (status) {
    businesses = await db.orm.public.ContractorBusiness
      .where((b) => b.status.eq(status))
      .all();
  } else if (search) {
    const safe = search.replace(/[%_\\]/g, (ch) => `\\${ch}`).toLowerCase();
    businesses = await db.orm.public.ContractorBusiness
      .where((b) =>
        or(
          b.companyName.ilike(`%${safe}%`),
          b.tradingName.ilike(`%${safe}%`),
        ),
      )
      .all();
  } else {
    businesses = await db.orm.public.ContractorBusiness.all();
  }

  // Sort newest first
  businesses.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return {
    items: businesses.slice(offset, offset + limit),
    total: businesses.length,
  };
}

// ─── Expiring documents ──────────────────────────────────────────

export interface ExpiringDocument {
  type: "licence" | "insurance";
  id: string;
  contractorBusinessId: string;
  name: string;
  expiryDate: Date;
  daysUntilExpiry: number;
}

/**
 * Find licences and insurance policies expiring within the given number
 * of days from today.
 */
export async function getExpiringDocuments(
  daysAhead: number,
): Promise<ExpiringDocument[]> {
  const now = new Date();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + daysAhead);

  const [allLicences, allInsurances] = await Promise.all([
    db.orm.public.WorksLicence.all(),
    db.orm.public.WorksInsurance.all(),
  ]);

  const results: ExpiringDocument[] = [];

  for (const lic of allLicences) {
    if (!lic.expiryDate) continue;
    const exp = new Date(lic.expiryDate);
    if (exp >= now && exp <= cutoff) {
      results.push({
        type: "licence",
        id: lic.id,
        contractorBusinessId: lic.contractorBusinessId,
        name: `${lic.licenceType} — ${lic.licenceNumber}`,
        expiryDate: exp,
        daysUntilExpiry: Math.ceil(
          (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        ),
      });
    }
  }

  for (const ins of allInsurances) {
    if (!ins.expiryDate) continue;
    const exp = new Date(ins.expiryDate);
    if (exp >= now && exp <= cutoff) {
      results.push({
        type: "insurance",
        id: ins.id,
        contractorBusinessId: ins.contractorBusinessId,
        name: `${ins.policyType} — ${ins.policyNumber}`,
        expiryDate: exp,
        daysUntilExpiry: Math.ceil(
          (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        ),
      });
    }
  }

  // Soonest expiry first
  results.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

  return results;
}
