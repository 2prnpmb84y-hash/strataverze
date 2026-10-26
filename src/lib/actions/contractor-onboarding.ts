"use server";

import { isWorksTrade } from "@/config/works";
import { PLATFORM_TIME_ZONE } from "@/lib/jurisdiction/time-zone";
import { platformToday } from "@/lib/jurisdiction/time-zone";

import { requireRecentMfa } from "@/lib/auth/mfa-enforcement";
import {
  COMPLIANCE_FEE_DECLARATION,
  chargeComplianceVerification,
  complianceFeeVersion,
  contractorPlanPrice,
  firstComplianceChargeMissing,
  quoteComplianceFee,
} from "@/lib/billing/contractor-fees";
import { confirmedCentsFrom, feeErrorMessage, resolveDisclosure } from "@/lib/billing/disclosure";
import { revalidatePath } from "next/cache";
import {
  requireAuth,
  AuthorisationError,
} from "@/lib/auth/require-membership";
import { db } from "@/prisma/db";
import { syncContractorSupplierBank } from "@/lib/works/completion";
import { and, not } from "@prisma/orm-postgres/orm-client";
import type {
  Numeric,
  TimestampString,
  Varchar,
} from "@prisma/orm-postgres/target/codec-types";
import {
  normaliseAbn,
  validateAbnFormat,
  lookupAbn,
} from "@/lib/services/abn-lookup";

// ─── Helpers ────────────────────────────────────────────────────

function toVarchar<N extends number>(value: string): Varchar<N> {
  return value as unknown as Varchar<N>;
}

function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

function toNumeric<P extends number = 12, S extends number = 2>(
  value: number | string,
): Numeric<P, S> {
  return String(value) as unknown as Numeric<P, S>;
}

export type ActionResult = { success?: true; error: string | null };
export type ActionResultWithId = ActionResult & { id?: string };

const OK: ActionResult = { success: true, error: null };

/** Find the contractor business linked to the current user's profile. */
async function getMyContractorBusiness(profileId: string) {
  const contact = await db.orm.public.ContractorContact
    .where((c) => and(c.profileId.eq(profileId), c.status.eq("ACTIVE")))
    .first();
  if (!contact) return null;
  return db.orm.public.ContractorBusiness
    .where((b) => b.id.eq(contact.contractorBusinessId))
    .first();
}

/** Verify the current user owns the given contractor business. */
async function requireContractorOwnership(profileId: string, contractorId: string) {
  const contact = await db.orm.public.ContractorContact
    .where((c) =>
      and(
        c.profileId.eq(profileId),
        c.contractorBusinessId.eq(contractorId),
        c.status.eq("ACTIVE"),
      ),
    )
    .first();
  if (!contact) {
    throw new AuthorisationError("You do not have access to this contractor business.");
  }
  return contact;
}

// ─── 1. Register Contractor Account ────────────────────────────

export async function registerContractorAccount(): Promise<
  ActionResult & { contractorId?: string }
> {
  try {
    const profile = await requireAuth();

    // Check if already registered
    const existing = await getMyContractorBusiness(profile.id);
    if (existing) {
      return { success: true, error: null, contractorId: existing.id };
    }

    // Create the contractor business
    const contractor = await db.orm.public.ContractorBusiness.create({
      companyName: toVarchar<300>(
        `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim() || "New Business",
      ),
      status: "PENDING",
      gstRegistered: false,
      tradeCategories: [],
      specialistServices: [],
      serviceRegions: [],
    });

    // Create primary contact linked to profile
    await db.orm.public.ContractorContact.create({
      contractorBusinessId: contractor.id,
      profileId: profile.id,
      firstName: toVarchar<200>(profile.firstName ?? ""),
      lastName: toVarchar<200>(profile.lastName ?? ""),
      email: toVarchar<320>(profile.email ?? ""),
      phone: profile.phone ? toVarchar<20>(profile.phone) : null,
      position: null,
      isPrimary: true,
      status: "ACTIVE",
    });

    // Create onboarding record
    await db.orm.public.ContractorOnboarding.create({
      contractorBusinessId: contractor.id,
      status: "DRAFT",
      currentStep: 1,
      stepAccountComplete: false,
      stepBusinessComplete: false,
      stepServicesComplete: false,
      stepLicencesComplete: false,
      stepInsuranceComplete: false,
      stepBankingComplete: false,
      stepMembershipComplete: false,
      stepReviewComplete: false,
    });

    revalidatePath("/supplier");
    return { success: true, error: null, contractorId: contractor.id };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to create contractor account." };
  }
}

// ─── 2. ABN Lookup ─────────────────────────────────────────────

export async function performAbnLookup(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireAuth();
    const contractorId = formData.get("contractorId") as string;
    const rawAbn = (formData.get("abn") as string)?.trim();

    if (!contractorId) return { error: "Contractor ID is required." };
    if (!rawAbn) return { error: "Please enter an ABN." };

    await requireContractorOwnership(profile.id, contractorId);

    const abn = normaliseAbn(rawAbn);
    const formatError = validateAbnFormat(abn);
    if (formatError) return { error: formatError };

    // Create lookup record with PENDING status
    const record = await db.orm.public.AbnLookupRecord.create({
      contractorBusinessId: contractorId,
      abn: toVarchar<11>(abn),
      lookupStatus: "LOOKUP_PENDING",
      lookupTimestamp: toTimestamp(new Date().toISOString()),
      performedById: profile.id,
    });

    // Perform the lookup
    const response = await lookupAbn(abn);

    if (!response.success || !response.result) {
      // Update record with error
      await db.orm.public.AbnLookupRecord
        .where((r) => r.id.eq(record.id))
        .update({
          lookupStatus: "LOOKUP_UNAVAILABLE",
          errorMessage: response.error ?? "Lookup failed",
          rawResponse: response.rawXml ? JSON.parse(JSON.stringify({ xml: response.rawXml })) : null,
        });
      revalidatePath("/supplier/onboarding");
      return { error: response.error ?? "ABN lookup failed." };
    }

    const result = response.result;

    // Determine lookup status
    let lookupStatus = "ACTIVE_MATCHED";
    if (result.abnStatus !== "Active") {
      lookupStatus = "INACTIVE_REVIEW";
    }

    // Update the lookup record
    await db.orm.public.AbnLookupRecord
      .where((r) => r.id.eq(record.id))
      .update({
        entityName: result.entityName ? toVarchar<500>(result.entityName) : null,
        entityType: result.entityType ? toVarchar<200>(result.entityType) : null,
        abnStatus: result.abnStatus ? toVarchar<50>(result.abnStatus) : null,
        abnStatusFromDate: result.abnStatusFromDate
          ? toTimestamp(result.abnStatusFromDate)
          : null,
        gstStatus: result.gstStatus ? toVarchar<50>(result.gstStatus) : null,
        gstStatusFromDate: result.gstStatusFromDate
          ? toTimestamp(result.gstStatusFromDate)
          : null,
        businessNames: result.businessNames,
        locationState: result.locationState ? toVarchar<3>(result.locationState) : null,
        locationPostcode: result.locationPostcode
          ? toVarchar<4>(result.locationPostcode)
          : null,
        lookupStatus,
        rawResponse: response.rawXml ? JSON.parse(JSON.stringify({ xml: response.rawXml })) : null,
      });

    // Update the contractor business with ABN info
    await db.orm.public.ContractorBusiness
      .where((c) => c.id.eq(contractorId))
      .update({
        abn: toVarchar<11>(abn),
        gstRegistered: result.gstStatus === "Active",
      });

    revalidatePath("/supplier/onboarding");
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to perform ABN lookup." };
  }
}

// ─── 3. Save Business Profile ──────────────────────────────────

export async function saveBusinessProfile(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireAuth();
    const contractorId = formData.get("contractorId") as string;
    if (!contractorId) return { error: "Contractor ID is required." };

    await requireContractorOwnership(profile.id, contractorId);

    const companyName = (formData.get("companyName") as string)?.trim();
    if (!companyName) return { error: "Company name is required." };

    const tradeCategoriesRaw = (formData.get("tradeCategories") as string)?.trim() || "";
    const tradeCategories = tradeCategoriesRaw
      ? tradeCategoriesRaw.split(",").map((c) => c.trim()).filter(Boolean)
      : [];

    // The ABN is set by the ABN Lookup step, which verifies it with the ABR.
    // Saving the profile cannot change it (L5): a different ABN must be
    // looked up again so the verified result matches the ABN on file.
    const business = await db.orm.public.ContractorBusiness
      .where((c) => c.id.eq(contractorId))
      .first();
    if (!business) return { error: "Contractor business not found." };
    const submittedAbn = formData.get("abn") ? normaliseAbn(formData.get("abn") as string) : "";
    const currentAbn = business.abn ? normaliseAbn(String(business.abn)) : "";
    if (submittedAbn && submittedAbn !== currentAbn) {
      return { error: "Your ABN has changed. Use Look Up ABN to verify the new ABN before saving." };
    }

    await db.orm.public.ContractorBusiness
      .where((c) => c.id.eq(contractorId))
      .update({
        companyName: toVarchar<300>(companyName),
        tradingName: formData.get("tradingName")
          ? toVarchar<300>((formData.get("tradingName") as string).trim())
          : null,
        acn: formData.get("acn")
          ? toVarchar<9>((formData.get("acn") as string).trim())
          : null,
        registeredAddress: (formData.get("registeredAddress") as string)?.trim() || null,
        phone: formData.get("phone")
          ? toVarchar<20>((formData.get("phone") as string).trim())
          : null,
        email: (formData.get("businessEmail") ?? formData.get("email"))
          ? toVarchar<320>(((formData.get("businessEmail") ?? formData.get("email")) as string).trim())
          : null,
        website: formData.get("website")
          ? toVarchar<500>((formData.get("website") as string).trim())
          : null,
        businessStructure: formData.get("businessStructure")
          ? toVarchar<100>((formData.get("businessStructure") as string).trim())
          : null,
        businessDescription: (formData.get("businessDescription") as string)?.trim() || null,
        postalAddress: (formData.get("postalAddress") as string)?.trim() || null,
        suburb: formData.get("suburb")
          ? toVarchar<100>((formData.get("suburb") as string).trim())
          : null,
        state: formData.get("state")
          ? toVarchar<3>((formData.get("state") as string).trim())
          : null,
        postcode: formData.get("postcode")
          ? toVarchar<4>((formData.get("postcode") as string).trim())
          : null,
        tradeCategories,
      });

    // Mark step complete
    await db.orm.public.ContractorOnboarding
      .where((o) => o.contractorBusinessId.eq(contractorId))
      .update({ stepBusinessComplete: true });

    revalidatePath("/supplier/onboarding");
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to save business profile." };
  }
}

// ─── 4. Save Services and Contacts ─────────────────────────────

export async function saveServicesAndContacts(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireAuth();
    const contractorId = formData.get("contractorId") as string;
    if (!contractorId) return { error: "Contractor ID is required." };

    await requireContractorOwnership(profile.id, contractorId);

    // TagInput creates multiple hidden inputs per name, so use getAll()
    const specialistServices = formData.getAll("specialistServices")
      .map((v) => String(v).trim())
      .filter(Boolean);
    const serviceRegions = formData.getAll("serviceRegions")
      .map((v) => String(v).trim())
      .filter(Boolean);
    // Only the fixed list buildings choose from (works stage 3, 25 Oct 2026).
    const tradeCategories = formData.getAll("tradeCategories")
      .map((v) => String(v).trim())
      .filter(isWorksTrade);

    await db.orm.public.ContractorBusiness
      .where((c) => c.id.eq(contractorId))
      .update({
        specialistServices,
        serviceRegions,
        tradeCategories,
        usesSubcontractors: formData.get("usesSubcontractors") === "true",
        projectExamples: (formData.get("projectExamples") as string)?.trim() || null,
      });

    // Mark step complete
    await db.orm.public.ContractorOnboarding
      .where((o) => o.contractorBusinessId.eq(contractorId))
      .update({ stepServicesComplete: true });

    revalidatePath("/supplier/onboarding");
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to save services and contacts." };
  }
}

// ─── 5. Save Licence ───────────────────────────────────────────

export async function saveLicence(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResultWithId> {
  try {
    const profile = await requireAuth();
    const contractorId = formData.get("contractorId") as string;
    const licenceId = formData.get("licenceId") as string | null;

    if (!contractorId) return { error: "Contractor ID is required." };
    await requireContractorOwnership(profile.id, contractorId);

    const licenceType = (formData.get("licenceType") as string)?.trim();
    if (!licenceType) return { error: "Licence type is required." };

    const data = {
      contractorBusinessId: contractorId,
      licenceType: toVarchar<200>(licenceType),
      holderName: toVarchar<300>(
        ((formData.get("holderName") as string) ?? "").trim(),
      ),
      licenceNumber: toVarchar<100>(
        ((formData.get("licenceNumber") as string) ?? "").trim(),
      ),
      issuingAuthority: toVarchar<300>(
        ((formData.get("issuingAuthority") as string) ?? "").trim(),
      ),
      stateTerritory: formData.get("stateTerritory")
        ? toVarchar<3>((formData.get("stateTerritory") as string).trim())
        : null,
      licenceClass: formData.get("licenceClass")
        ? toVarchar<200>((formData.get("licenceClass") as string).trim())
        : null,
      permittedWork: (formData.get("permittedWork") as string)?.trim() || null,
      conditions: (formData.get("conditions") as string)?.trim() || null,
      issueDate: (formData.get("startDate") as string) || null,
      expiryDate: (formData.get("expiryDate") as string) || null,
      relationshipToBusiness: formData.get("relationshipToBusiness")
        ? toVarchar<200>((formData.get("relationshipToBusiness") as string).trim())
        : null,
      documentUrl: (formData.get("documentUrl") as string)?.trim() || null,
      status: "UNVERIFIED",
    };

    let resultId: string;
    if (licenceId) {
      const existing = await db.orm.public.WorksLicence
        .where((l) =>
          and(l.id.eq(licenceId), l.contractorBusinessId.eq(contractorId)),
        )
        .first();
      if (!existing || existing.contractorBusinessId !== contractorId) return { error: "Licence not found." };
      // A verified licence that is edited must be verified again (L5).
      const wasVerified = existing.status === "VERIFIED";
      await db.orm.public.WorksLicence
        .where((l) =>
          and(l.id.eq(licenceId), l.contractorBusinessId.eq(contractorId)),
        )
        .update(
          wasVerified
            ? {
                ...data,
                status: "SUBMITTED_UNVERIFIED",
                verifiedById: null,
                verifiedAt: null,
                verificationOutcome: null,
              }
            : data,
        );
      resultId = licenceId;
    } else {
      const created = await db.orm.public.WorksLicence.create(data);
      resultId = created.id;
    }

    revalidatePath("/supplier/onboarding");
    return { success: true, error: null, id: resultId };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to save licence." };
  }
}

// ─── 6. Delete Licence ─────────────────────────────────────────

export async function deleteLicence(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireAuth();
    const contractorId = formData.get("contractorId") as string;
    const licenceId = formData.get("licenceId") as string;

    if (!contractorId || !licenceId) return { error: "Missing required IDs." };
    await requireContractorOwnership(profile.id, contractorId);

    await db.orm.public.WorksLicence
      .where((l) =>
        and(l.id.eq(licenceId), l.contractorBusinessId.eq(contractorId)),
      )
      .delete();

    revalidatePath("/supplier/onboarding");
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to delete licence." };
  }
}

// ─── 7. Save Insurance ─────────────────────────────────────────

export async function saveInsurance(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResultWithId> {
  try {
    const profile = await requireAuth();
    const contractorId = formData.get("contractorId") as string;
    const insuranceId = formData.get("insuranceId") as string | null;

    if (!contractorId) return { error: "Contractor ID is required." };
    await requireContractorOwnership(profile.id, contractorId);

    const insuranceType = (formData.get("insuranceType") as string)?.trim();
    if (!insuranceType) return { error: "Insurance type is required." };

    const notApplicable = formData.get("notApplicable") === "true";
    const hasCertificate = !!(formData.get("documentUrl") as string)?.trim();

    const data = {
      contractorBusinessId: contractorId,
      policyType: insuranceType,
      insuredName: toVarchar<300>(
        ((formData.get("insuredName") as string) ?? "").trim(),
      ),
      insurer: toVarchar<300>(
        ((formData.get("insurer") as string) ?? "").trim(),
      ),
      policyNumber: toVarchar<100>(
        ((formData.get("policyNumber") as string) ?? "").trim(),
      ),
      startDate: (formData.get("startDate") as string) || platformToday(),
      expiryDate: (formData.get("expiryDate") as string) || platformToday(),
      coverageAmount: toNumeric<14, 2>(
        (formData.get("coverageAmount") as string) || "0",
      ),
      coverageAmountBasis: ((formData.get("coverageAmountBasis") as string)?.trim() || null) as Varchar<200> | null,
      coveredActivities: (formData.get("coveredActivities") as string)?.trim() || null,
      exclusions: (formData.get("exclusions") as string)?.trim() || null,
      documentUrl: (formData.get("documentUrl") as string)?.trim() || null,
      notApplicable,
      notApplicableReason: notApplicable
        ? (formData.get("notApplicableReason") as string)?.trim() || null
        : null,
      contractorComments: (formData.get("contractorComments") as string)?.trim() || null,
      status: notApplicable
        ? "NOT_APPLICABLE_REVIEWED"
        : hasCertificate
          ? "SUBMITTED_UNVERIFIED"
          : "NOT_SUPPLIED",
    };

    let resultId: string;
    if (insuranceId) {
      const existing = await db.orm.public.WorksInsurance
        .where((i) =>
          and(i.id.eq(insuranceId), i.contractorBusinessId.eq(contractorId)),
        )
        .first();
      if (!existing || existing.contractorBusinessId !== contractorId) return { error: "Insurance policy not found." };
      // A verified policy that is edited must be verified again (L5).
      const wasVerified = existing.status === "VERIFIED";
      await db.orm.public.WorksInsurance
        .where((i) =>
          and(i.id.eq(insuranceId), i.contractorBusinessId.eq(contractorId)),
        )
        .update(
          wasVerified
            ? {
                ...data,
                status: "SUBMITTED_UNVERIFIED",
                verifiedById: null,
                verifiedAt: null,
                verificationOutcome: null,
              }
            : data,
        );
      resultId = insuranceId;
    } else {
      const created = await db.orm.public.WorksInsurance.create(data);
      resultId = created.id;
    }

    revalidatePath("/supplier/onboarding");
    return { success: true, error: null, id: resultId };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to save insurance." };
  }
}

// ─── 8. Delete Insurance ───────────────────────────────────────

export async function deleteInsurance(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireAuth();
    const contractorId = formData.get("contractorId") as string;
    const insuranceId = formData.get("insuranceId") as string;

    if (!contractorId || !insuranceId) return { error: "Missing required IDs." };
    await requireContractorOwnership(profile.id, contractorId);

    await db.orm.public.WorksInsurance
      .where((i) =>
        and(i.id.eq(insuranceId), i.contractorBusinessId.eq(contractorId)),
      )
      .delete();

    revalidatePath("/supplier/onboarding");
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to delete insurance policy." };
  }
}

// ─── 9. Save Bank Details ──────────────────────────────────────

export async function saveBankDetails(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireAuth();
    const contractorId = formData.get("contractorId") as string;
    if (!contractorId) return { error: "Contractor ID is required." };

    await requireContractorOwnership(profile.id, contractorId);
    await requireRecentMfa();

    const accountName = (formData.get("accountName") as string)?.trim();
    const bankName = (formData.get("bankName") as string)?.trim();
    const bsb = (formData.get("bsb") as string)?.trim().replace(/[^0-9]/g, "");
    const accountNumber = (formData.get("accountNumber") as string)?.trim();

    if (!accountName) return { error: "Account name is required." };
    if (!bankName) return { error: "Bank name is required." };
    if (!bsb || bsb.length !== 6) return { error: "BSB must be 6 digits." };
    if (!accountNumber) return { error: "Account number is required." };

    // Supersede any existing non-superseded version
    const existing = await db.orm.public.WorksBankDetailVersion
      .where((b) =>
        and(
          b.contractorBusinessId.eq(contractorId),
          not(b.status.eq("SUPERSEDED")),
          not(b.status.eq("REJECTED")),
        ),
      )
      .all();

    for (const old of existing) {
      await db.orm.public.WorksBankDetailVersion
        .where((b) => b.id.eq(old.id))
        .update({ status: "SUPERSEDED" });
    }

    // Compute next version number
    const maxVersion = existing.length > 0
      ? Math.max(...existing.map((b) => (b.versionNumber as number) ?? 0))
      : 0;

    // Create new version
    await db.orm.public.WorksBankDetailVersion.create({
      contractorBusinessId: contractorId,
      accountName: toVarchar<200>(accountName),
      bankName: toVarchar<200>(bankName),
      bsb: toVarchar<7>(`${bsb.slice(0, 3)}-${bsb.slice(3)}`),
      accountNumber: toVarchar<20>(accountNumber),
      remittanceEmail: formData.get("remittanceEmail")
        ? toVarchar<320>((formData.get("remittanceEmail") as string).trim())
        : null,
      entityDifferenceExplanation:
        (formData.get("entityDifferenceExplanation") as string)?.trim() || null,
      supportingDocumentUrl:
        (formData.get("supportingDocumentUrl") as string)?.trim() || null,
      versionNumber: maxVersion + 1,
      updatedById: profile.id,
      status: "SUBMITTED_UNVERIFIED",
    });

    // Mark step complete
    await db.orm.public.ContractorOnboarding
      .where((o) => o.contractorBusinessId.eq(contractorId))
      .update({ stepBankingComplete: true });

    // Each building already paying this contractor (works stage 4) gets the
    // change too, and must verify it before paying again.
    await propagateContractorBankChange(contractorId);

    revalidatePath("/supplier/onboarding");
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to save bank details." };
  }
}

// ─── 10. Accept Declarations ───────────────────────────────────

export async function acceptDeclarations(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireAuth();
    const contractorId = formData.get("contractorId") as string;
    if (!contractorId) return { error: "Contractor ID is required." };

    await requireContractorOwnership(profile.id, contractorId);

    const declarationTypes = [
      "AUTHORITY_TO_REPRESENT",
      "ACCURACY_OF_INFORMATION",
      "OBLIGATION_TO_NOTIFY",
      "PLATFORM_TERMS",
      "PRIVACY_NOTICE",
      "PROMOTIONAL_TERMS",
    ];

    const marketingConsent = formData.get("marketingConsent") === "true";
    if (marketingConsent) {
      declarationTypes.push("MARKETING_CONSENT");
    }

    const now = new Date().toISOString();

    for (const declType of declarationTypes) {
      const accepted = formData.get(declType) === "true" || declType === "MARKETING_CONSENT";

      // Check if declaration already exists
      const existing = await db.orm.public.ContractorDeclaration
        .where((d) =>
          and(
            d.contractorBusinessId.eq(contractorId),
            d.declarationType.eq(declType),
          ),
        )
        .first();

      if (existing) {
        await db.orm.public.ContractorDeclaration
          .where((d) => d.id.eq(existing.id))
          .update({
            accepted,
            acceptedAt: toTimestamp(now),
            acceptedById: profile.id,
            documentVersion: toVarchar<50>("1.0"),
          });
      } else {
        await db.orm.public.ContractorDeclaration.create({
          contractorBusinessId: contractorId,
          declarationType: declType,
          documentVersion: toVarchar<50>("1.0"),
          accepted,
          acceptedAt: toTimestamp(now),
          acceptedById: profile.id,
        });
      }
    }

    revalidatePath("/supplier/onboarding");
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to save declarations." };
  }
}

// ─── 11. Accept Membership ─────────────────────────────────────

export async function acceptMembership(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireAuth();
    const contractorId = formData.get("contractorId") as string;
    if (!contractorId) return { error: "Contractor ID is required." };

    await requireContractorOwnership(profile.id, contractorId);

    // The contractor must confirm the annual compliance verification charge.
    const complianceQuote = await quoteComplianceFee();
    const complianceDisclosure = resolveDisclosure(complianceQuote, confirmedCentsFrom(formData), profile.id);
    const plan = await contractorPlanPrice();

    const now = new Date().toISOString();
    const promotionEnd = "2027-03-31T23:59:59+11:00";

    // Check existing
    const existing = await db.orm.public.ContractorMembership
      .where((m) => m.contractorBusinessId.eq(contractorId))
      .first();

    if (existing) {
      await db.orm.public.ContractorMembership
        .where((m) => m.id.eq(existing.id))
        .update({
          acceptedById: profile.id,
          acceptedAt: toTimestamp(now),
          termsVersion: toVarchar<50>("1.0"),
        });
    } else {
      await db.orm.public.ContractorMembership.create({
        contractorBusinessId: contractorId,
        promotionId: toVarchar<100>("LAUNCH_2027"),
        promotionStart: toTimestamp(now),
        promotionEnd: toTimestamp(promotionEnd),
        termsVersion: toVarchar<50>("1.0"),
        acceptedById: profile.id,
        acceptedAt: toTimestamp(now),
        paidActivationStatus: "NOT_ACTIVATED",
        subscriptionStatus: "PROMOTIONAL",
        planName: toVarchar<200>("StrataVerze Contractor"),
        planCurrency: toVarchar<3>("AUD"),
        ...(plan
          ? { planMonthlyPrice: toNumeric<10, 2>(plan.cents / 100), planGstInclusive: plan.gstInclusive }
          : {}),
        billingTimezone: toVarchar<100>(PLATFORM_TIME_ZONE),
      });
    }

    // Keep the contractor's confirmation of the compliance verification charge.
    if (complianceDisclosure) {
      await db.orm.public.ContractorDeclaration.create({
        contractorBusinessId: contractorId,
        declarationType: COMPLIANCE_FEE_DECLARATION,
        documentVersion: toVarchar<50>(complianceFeeVersion(complianceDisclosure.amountCents)),
        accepted: true,
        acceptedAt: toTimestamp(complianceDisclosure.shownAt),
        acceptedById: profile.id,
      });
    }

    // Mark step complete
    await db.orm.public.ContractorOnboarding
      .where((o) => o.contractorBusinessId.eq(contractorId))
      .update({ stepMembershipComplete: true });

    revalidatePath("/supplier/onboarding");
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    const feeError = feeErrorMessage(err);
    if (feeError) return { error: feeError };
    return { error: "Failed to accept membership terms." };
  }
}

// ─── 11b. Confirm the compliance verification charge ───────────

/**
 * For contractors who accepted the membership terms before the annual
 * compliance verification charge existed, or since its price changed.
 * Records their confirmation. An approved contractor who was never charged
 * is charged the first year now, as the confirmation describes.
 */
export async function confirmComplianceFee(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireAuth();
    const contractorId = formData.get("contractorId") as string;
    if (!contractorId) return { error: "Contractor ID is required." };
    await requireContractorOwnership(profile.id, contractorId);

    const quote = await quoteComplianceFee();
    const disclosure = resolveDisclosure(quote, confirmedCentsFrom(formData), profile.id);
    if (!disclosure) return OK;

    const business = await db.orm.public.ContractorBusiness.where((b) => b.id.eq(contractorId)).first();
    await db.transaction(async (tx) => {
      await tx.orm.public.ContractorDeclaration.create({
        contractorBusinessId: contractorId,
        declarationType: COMPLIANCE_FEE_DECLARATION,
        documentVersion: toVarchar<50>(complianceFeeVersion(disclosure.amountCents)),
        accepted: true,
        acceptedAt: toTimestamp(disclosure.shownAt),
        acceptedById: profile.id,
      });
      if (business?.status === "APPROVED" && (await firstComplianceChargeMissing(tx.orm, contractorId))) {
        await chargeComplianceVerification(tx.orm, { contractorBusinessId: contractorId, year: 1, actorId: profile.id });
      }
    });

    revalidatePath("/supplier", "layout");
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    const feeError = feeErrorMessage(err);
    if (feeError) return { error: feeError };
    return { error: "Failed to record your confirmation." };
  }
}

// ─── 12. Submit Application ────────────────────────────────────

export async function submitApplication(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireAuth();
    const contractorId = formData.get("contractorId") as string;
    if (!contractorId) return { error: "Contractor ID is required." };

    await requireContractorOwnership(profile.id, contractorId);

    // Check required steps
    const onboarding = await db.orm.public.ContractorOnboarding
      .where((o) => o.contractorBusinessId.eq(contractorId))
      .first();

    if (!onboarding) return { error: "Onboarding record not found." };

    if (!onboarding.stepAccountComplete) {
      return { error: "Please complete the Account step." };
    }
    if (!onboarding.stepBusinessComplete) {
      return { error: "Please complete the Business & ABN step." };
    }

    const now = new Date().toISOString();

    // Process declarations from the review form
    const declarationMap: Record<string, string> = {
      declaration_authority: "AUTHORITY_TO_REPRESENT",
      declaration_accuracy: "ACCURACY_OF_INFORMATION",
      declaration_notify: "OBLIGATION_TO_NOTIFY",
      declaration_platformTerms: "PLATFORM_TERMS",
      declaration_privacy: "PRIVACY_NOTICE",
      declaration_promotionTerms: "PROMOTIONAL_TERMS",
      declaration_marketing: "MARKETING_CONSENT",
    };

    for (const [fieldName, declType] of Object.entries(declarationMap)) {
      const fieldValue = formData.get(fieldName) as string | null;
      if (!fieldValue) continue;

      const existing = await db.orm.public.ContractorDeclaration
        .where((d) =>
          and(
            d.contractorBusinessId.eq(contractorId),
            d.declarationType.eq(declType),
          ),
        )
        .first();

      if (existing) {
        await db.orm.public.ContractorDeclaration
          .where((d) => d.id.eq(existing.id))
          .update({
            accepted: true,
            acceptedAt: toTimestamp(now),
            acceptedById: profile.id,
            documentVersion: toVarchar<50>("1.0"),
          });
      } else {
        await db.orm.public.ContractorDeclaration.create({
          contractorBusinessId: contractorId,
          declarationType: declType,
          documentVersion: toVarchar<50>("1.0"),
          accepted: true,
          acceptedAt: toTimestamp(now),
          acceptedById: profile.id,
        });
      }
    }

    // Update onboarding status
    await db.orm.public.ContractorOnboarding
      .where((o) => o.contractorBusinessId.eq(contractorId))
      .update({
        status: "SUBMITTED",
        submittedAt: toTimestamp(now),
        stepReviewComplete: true,
      });

    // Create review queue item
    await db.orm.public.ContractorReviewItem.create({
      contractorBusinessId: contractorId,
      queueType: "NEW_APPLICATION",
      status: "PENDING",
      priority: "NORMAL",
      entityType: toVarchar<100>("ContractorBusiness"),
      entityId: contractorId,
    });

    revalidatePath("/supplier");
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to submit application." };
  }
}

// ─── 13. Update Onboarding Step ────────────────────────────────

export async function updateOnboardingStep(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireAuth();
    const contractorId = formData.get("contractorId") as string;
    const step = parseInt(formData.get("step") as string, 10);

    if (!contractorId) return { error: "Contractor ID is required." };
    if (!step || step < 1 || step > 8) return { error: "Invalid step number." };

    await requireContractorOwnership(profile.id, contractorId);

    const stepFlags: Record<number, string> = {
      1: "stepAccountComplete",
      2: "stepBusinessComplete",
      3: "stepServicesComplete",
      4: "stepLicencesComplete",
      5: "stepInsuranceComplete",
      6: "stepBankingComplete",
      7: "stepMembershipComplete",
      8: "stepReviewComplete",
    };

    const flagName = stepFlags[step];
    if (!flagName) return { error: "Invalid step." };

    const updateData: Record<string, unknown> = {
      currentStep: Math.max(step + 1, step),
      [flagName]: true,
    };

    await db.orm.public.ContractorOnboarding
      .where((o) => o.contractorBusinessId.eq(contractorId))
      .update(updateData);

    revalidatePath("/supplier/onboarding");
    return OK;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update onboarding step." };
  }
}

/**
 * A contractor changed their bank details: record the change on each
 * building's finance supplier for them (works stage 4, 25 Oct 2026), so
 * the building's bank detail controls apply before any further payment.
 */
async function propagateContractorBankChange(contractorBusinessId: string) {
  const suppliers = await db.orm.public.Supplier.where((s) => s.contractorBusinessId.eq(contractorBusinessId)).limit(500).all();
  for (const supplier of suppliers) await syncContractorSupplierBank(supplier.id, contractorBusinessId);
}
