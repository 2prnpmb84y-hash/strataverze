import { db } from "@/prisma/db";

// ─── Lot Detail (extended owner info) ────────────────────────────

export async function getLotDetailExtended(lotId: string) {
  try {
    return await db.orm.public.LotDetail
      .where((ld) => ld.lotId.eq(lotId))
      .first();
  } catch {
    return null;
  }
}

export async function upsertLotDetail(
  lotId: string,
  data: {
    ownerPhone?: string | null;
    ownerMobile?: string | null;
    contactName?: string | null;
    ownerAddress?: string | null;
    ownerEmail?: string | null;
    isCommitteeMember?: boolean;
    paidToDate?: string | null;
    lastSettled?: string | null;
  },
) {
  const existing = await getLotDetailExtended(lotId);
  if (existing) {
    return db.orm.public.LotDetail
      .where({ id: existing.id })
      .update(data);
  }
  return db.orm.public.LotDetail.create({ lotId, ...data });
}

// ─── Tenants ─────────────────────────────────────────────────────

export async function getTenantsForLot(lotId: string) {
  try {
    return await db.orm.public.LotTenant
      .where((t) => t.lotId.eq(lotId))
      .orderBy((t) => t.tenantNumber.asc())
      .all();
  } catch {
    return [];
  }
}

export async function upsertTenant(
  lotId: string,
  tenantNumber: number,
  data: {
    isOwnerOccupier?: boolean;
    isFormalTenant?: boolean;
    dateReceived?: string | null;
    deliveryBy?: string;
    salutation?: string | null;
    name?: string | null;
    contactName?: string | null;
    mobile?: string | null;
    email?: string | null;
    leaseStart?: string | null;
    leaseExpiry?: string | null;
    notes?: string | null;
  },
) {
  try {
    const existing = await db.orm.public.LotTenant
      .where((t) => t.lotId.eq(lotId))
      .where((t) => t.tenantNumber.eq(tenantNumber))
      .first();
    if (existing) {
      return db.orm.public.LotTenant
        .where({ id: existing.id })
        .update(data);
    }
    return db.orm.public.LotTenant.create({
      lotId,
      tenantNumber,
      ...data,
    });
  } catch (err) {
    throw err;
  }
}

// ─── Property Manager ────────────────────────────────────────────

export async function getPropertyManager(lotId: string) {
  try {
    return await db.orm.public.PropertyManager
      .where((pm) => pm.lotId.eq(lotId))
      .first();
  } catch {
    return null;
  }
}

export async function upsertPropertyManager(
  lotId: string,
  data: {
    agentName?: string | null;
    company?: string | null;
    address?: string | null;
    agentEmail?: string | null;
    phone?: string | null;
    fax?: string | null;
    email?: string | null;
  },
) {
  const existing = await getPropertyManager(lotId);
  if (existing) {
    return db.orm.public.PropertyManager
      .where({ id: existing.id })
      .update(data);
  }
  return db.orm.public.PropertyManager.create({ lotId, ...data });
}

// ─── Delivery Preferences ────────────────────────────────────────

export async function getDeliveryPreferences(lotId: string) {
  try {
    return await db.orm.public.LotDeliveryPreference
      .where((dp) => dp.lotId.eq(lotId))
      .all();
  } catch {
    return [];
  }
}

export async function upsertDeliveryPreference(
  lotId: string,
  category: string,
  data: {
    deliveryMethod?: string;
    recipientType?: string;
    recipientName?: string | null;
    recipientEmail?: string | null;
    recipientAddress?: string | null;
    recipientSuburb?: string | null;
    recipientState?: string | null;
    recipientPostcode?: string | null;
  },
) {
  try {
    const existing = await db.orm.public.LotDeliveryPreference
      .where((dp) => dp.lotId.eq(lotId))
      .where((dp) => dp.category.eq(category))
      .first();
    if (existing) {
      return db.orm.public.LotDeliveryPreference
        .where({ id: existing.id })
        .update(data);
    }
    return db.orm.public.LotDeliveryPreference.create({
      lotId,
      category,
      ...data,
    });
  } catch (err) {
    throw err;
  }
}

// ─── Debt Collection ─────────────────────────────────────────────

export async function getDebtCollection(lotId: string) {
  try {
    return await db.orm.public.LotDebtCollection
      .where((dc) => dc.lotId.eq(lotId))
      .first();
  } catch {
    return null;
  }
}

export async function upsertDebtCollection(
  lotId: string,
  data: {
    stage?: string;
    notes?: string | null;
    excludeFromCollection?: boolean;
    hasPaymentPlan?: boolean;
    buildingDebtCollection?: boolean;
    repaymentPlan?: boolean;
    legalAction?: boolean;
  },
) {
  const existing = await getDebtCollection(lotId);
  if (existing) {
    return db.orm.public.LotDebtCollection
      .where({ id: existing.id })
      .update(data);
  }
  return db.orm.public.LotDebtCollection.create({ lotId, ...data });
}

// ─── Power of Attorney ───────────────────────────────────────────

export async function getPowersOfAttorney(lotId: string) {
  try {
    return await db.orm.public.LotPowerOfAttorney
      .where((poa) => poa.lotId.eq(lotId))
      .where((poa) => poa.isActive.eq(true))
      .orderBy((poa) => poa.createdAt.desc())
      .all();
  } catch {
    return [];
  }
}

export async function createPowerOfAttorney(
  lotId: string,
  data: {
    attorneyName: string;
    attorneyEmail?: string | null;
    attorneyPhone?: string | null;
    attorneyAddress?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    notes?: string | null;
  },
) {
  return db.orm.public.LotPowerOfAttorney.create({ lotId, ...data });
}

export async function revokePowerOfAttorney(id: string) {
  return db.orm.public.LotPowerOfAttorney
    .where({ id })
    .update({ isActive: false });
}

// ─── Proxy Voting ────────────────────────────────────────────────

export async function getProxies(lotId: string) {
  try {
    return await db.orm.public.LotProxy
      .where((p) => p.lotId.eq(lotId))
      .where((p) => p.isActive.eq(true))
      .orderBy((p) => p.createdAt.desc())
      .all();
  } catch {
    return [];
  }
}

export async function createProxy(
  lotId: string,
  data: {
    proxyName: string;
    proxyEmail?: string | null;
    proxyPhone?: string | null;
    meetingDate?: string | null;
    meetingTitle?: string | null;
    notes?: string | null;
  },
) {
  return db.orm.public.LotProxy.create({ lotId, ...data });
}

export async function revokeProxy(id: string) {
  return db.orm.public.LotProxy
    .where({ id })
    .update({ isActive: false });
}
