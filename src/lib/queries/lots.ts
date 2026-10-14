import { db } from "@/prisma/db";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";

/**
 * Fetch all lots for a given scheme, ordered by lot number.
 */
export async function getLotsForScheme(schemeId: string) {
  return db.orm.public.Lot
    .where((l) => l.schemeId.eq(schemeId))
    .include("memberships", (m) =>
      m.where((sm) => sm.isActive.eq(true)).include("profile"),
    )
    .orderBy((l) => l.lotNumber.asc())
    .all();
}

/**
 * Fetch a single lot by ID with its memberships.
 */
export async function getLotById(lotId: string) {
  return db.orm.public.Lot
    .include("memberships", (m) =>
      m.where((sm) => sm.isActive.eq(true)).include("profile"),
    )
    .first({ id: lotId });
}

/**
 * Create a lot within a scheme.
 */
export async function createLot(data: {
  schemeId: string;
  lotNumber: string;
  unitNumber?: string;
  entitlement: number;
  floorArea?: number;
  lotType?: string;
}) {
  return db.orm.public.Lot.create({
    schemeId: data.schemeId,
    lotNumber: data.lotNumber,
    unitNumber: data.unitNumber ?? null,
    entitlement: data.entitlement,
    floorArea: data.floorArea ?? null,
    lotType: data.lotType ?? "RESIDENTIAL",
  });
}

/**
 * Update an existing lot.
 */
export async function updateLot(
  lotId: string,
  data: Partial<{
    lotNumber: string;
    unitNumber: string | null;
    entitlement: number;
    floorArea: number | null;
    lotType: string;
  }>,
) {
  return db.orm.public.Lot.where({ id: lotId }).update(data);
}

/**
 * Delete a lot.
 */
export async function deleteLot(lotId: string) {
  return db.orm.public.Lot.where({ id: lotId }).delete();
}

/**
 * Assign an owner to a lot by creating a membership.
 */
export async function assignOwnerToLot(data: {
  schemeId: string;
  lotId: string;
  profileId: string;
}) {
  return db.orm.public.SchemeMembership.create({
    schemeId: data.schemeId,
    profileId: data.profileId,
    lotId: data.lotId,
    role: "OWNER",
    isActive: true,
  });
}

/**
 * Remove an owner from a lot by deactivating the membership.
 */
export async function removeOwnerFromLot(membershipId: string) {
  return db.orm.public.SchemeMembership
    .where({ id: membershipId })
    .update({
      isActive: false,
      endDate: new Date().toISOString() as unknown as TimestampString<3>,
    });
}
