"use server";

import { contractorPlanPrice } from "@/lib/billing/contractor-fees";
import { revalidatePath } from "next/cache";
import {
  requireAuth,
  AuthorisationError,
} from "@/lib/auth/require-membership";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type {
  Numeric,
  TimestampString,
  Varchar,
} from "@prisma/orm-postgres/target/codec-types";

// ─── Helpers ────────────────────────────────────────────────────

function toVarchar<N extends number>(value: string): Varchar<N> {
  return value as unknown as Varchar<N>;
}

function toNumeric<P extends number = 12, S extends number = 2>(
  value: number | string,
): Numeric<P, S> {
  return String(value) as unknown as Numeric<P, S>;
}

function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

export type ActionResult = { success?: true; error: string | null };
type SuccessResult = { success: true; error: null };
const OK: SuccessResult = { success: true, error: null };

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

/**
 * Verify the authenticated profile is a contact of the given contractor business.
 */
async function requireContractorAccess(
  profileId: string,
  contractorBusinessId: string,
) {
  const contact = await db.orm.public.ContractorContact
    .where((c) =>
      and(
        c.profileId.eq(profileId),
        c.contractorBusinessId.eq(contractorBusinessId),
      ),
    )
    .first();

  if (!contact) {
    throw new AuthorisationError(
      "You do not have access to this contractor account.",
    );
  }
  return contact;
}

// ─── Step 1: Account Creation ───────────────────────────────────

export async function createContractorAccount(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireAuth();

    const companyName = formData.get("companyName") as string;
    const firstName = formData.get("firstName") as string;
    const lastName = formData.get("lastName") as string;
    const email = formData.get("email") as string;
    const phone = (formData.get("phone") as string) || null;
    const position = (formData.get("position") as string) || null;

    if (!companyName?.trim()) return { error: "Company name is required." };
    if (!firstName?.trim()) return { error: "First name is required." };
    if (!lastName?.trim()) return { error: "Last name is required." };
    if (!email?.trim()) return { error: "Email is required." };

    // Check if profile already has a contractor business
    const existingContact = await db.orm.public.ContractorContact
      .where((c) =>
        and(c.profileId.eq(profile.id), c.isPrimary.eq(true)),
      )
      .first();

    if (existingContact) {
      return { error: "You already have a contractor account." };
    }

    // Create contractor business
    const business = await db.orm.public.ContractorBusiness.create({
      companyName: toVarchar<300>(companyName.trim()),
      status: "PENDING",
    });

    // Create primary contact
    await db.orm.public.ContractorContact.create({
      contractorBusinessId: business.id,
      profileId: profile.id,
      firstName: toVarchar<200>(firstName.trim()),
      lastName: toVarchar<200>(lastName.trim()),
      email: toVarchar<320>(email.trim()),
      phone: phone ? toVarchar<20>(phone.trim()) : null,
      position: position ? toVarchar<200>(position.trim()) : null,
      isPrimary: true,
    });

    // Create onboarding record
    await db.orm.public.ContractorOnboarding.create({
      contractorBusinessId: business.id,
      status: "DRAFT",
      currentStep: 1,
      stepAccountComplete: true,
    });

    revalidatePath("/supplier");
    return OK;
  } catch (err) {
    if (isRedirectError(err)) throw err;
    if (err instanceof AuthorisationError) return { error: err.message };
    console.error("createContractorAccount error:", err);
    return { error: "Something went wrong. Please try again." };
  }
}

// ─── Step 2: Business Profile ───────────────────────────────────

export async function updateBusinessProfile(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireAuth();
    const contractorBusinessId = formData.get("contractorBusinessId") as string;
    if (!contractorBusinessId) return { error: "Missing contractor business ID." };

    await requireContractorAccess(profile.id, contractorBusinessId);

    const abn = (formData.get("abn") as string) || null;
    const acn = (formData.get("acn") as string) || null;
    const tradingName = (formData.get("tradingName") as string) || null;
    const businessStructure = (formData.get("businessStructure") as string) || null;
    const registeredAddress = (formData.get("registeredAddress") as string) || null;
    const postalAddress = (formData.get("postalAddress") as string) || null;
    const suburb = (formData.get("suburb") as string) || null;
    const state = (formData.get("state") as string) || null;
    const postcode = (formData.get("postcode") as string) || null;
    const phone = (formData.get("phone") as string) || null;
    const email = (formData.get("email") as string) || null;
    const website = (formData.get("website") as string) || null;
    const businessDescription = (formData.get("businessDescription") as string) || null;

    await db.orm.public.ContractorBusiness
      .where({ id: contractorBusinessId })
      .update({
        abn: abn ? toVarchar<11>(abn.replace(/\s/g, "")) : null,
        acn: acn ? toVarchar<9>(acn.replace(/\s/g, "")) : null,
        tradingName: tradingName ? toVarchar<300>(tradingName) : null,
        businessStructure: businessStructure ? toVarchar<100>(businessStructure) : null,
        registeredAddress,
        postalAddress,
        suburb: suburb ? toVarchar<100>(suburb) : null,
        state: state ? toVarchar<3>(state) : null,
        postcode: postcode ? toVarchar<4>(postcode) : null,
        phone: phone ? toVarchar<20>(phone) : null,
        email: email ? toVarchar<320>(email) : null,
        website: website ? toVarchar<500>(website) : null,
        businessDescription,
      });

    // Mark step complete
    await db.orm.public.ContractorOnboarding
      .where((o) => o.contractorBusinessId.eq(contractorBusinessId))
      .update({ stepBusinessComplete: true });

    revalidatePath("/supplier/onboarding");
    return OK;
  } catch (err) {
    if (isRedirectError(err)) throw err;
    if (err instanceof AuthorisationError) return { error: err.message };
    console.error("updateBusinessProfile error:", err);
    return { error: "Something went wrong. Please try again." };
  }
}

// ─── Step 3: Services and Contacts ──────────────────────────────

export async function updateServicesAndContacts(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireAuth();
    const contractorBusinessId = formData.get("contractorBusinessId") as string;
    if (!contractorBusinessId) return { error: "Missing contractor business ID." };

    await requireContractorAccess(profile.id, contractorBusinessId);

    const tradeCategoriesRaw = (formData.get("tradeCategories") as string) || "";
    const specialistServicesRaw = (formData.get("specialistServices") as string) || "";
    const serviceRegionsRaw = (formData.get("serviceRegions") as string) || "";
    const quotingContactId = (formData.get("quotingContactId") as string) || null;
    const accountsContactId = (formData.get("accountsContactId") as string) || null;
    const afterHoursContactId = (formData.get("afterHoursContactId") as string) || null;
    const usesSubcontractors = formData.get("usesSubcontractors") === "true";
    const projectExamples = (formData.get("projectExamples") as string) || null;

    const tradeCategories = tradeCategoriesRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const specialistServices = specialistServicesRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const serviceRegions = serviceRegionsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    await db.orm.public.ContractorBusiness
      .where({ id: contractorBusinessId })
      .update({
        tradeCategories,
        specialistServices,
        serviceRegions,
        quotingContactId,
        accountsContactId,
        afterHoursContactId,
        usesSubcontractors,
        projectExamples,
      });

    await db.orm.public.ContractorOnboarding
      .where((o) => o.contractorBusinessId.eq(contractorBusinessId))
      .update({ stepServicesComplete: true });

    revalidatePath("/supplier/onboarding");
    return OK;
  } catch (err) {
    if (isRedirectError(err)) throw err;
    if (err instanceof AuthorisationError) return { error: err.message };
    console.error("updateServicesAndContacts error:", err);
    return { error: "Something went wrong. Please try again." };
  }
}

// ─── ABN Lookup Result ──────────────────────────────────────────

export async function saveAbnLookupResult(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireAuth();
    const contractorBusinessId = formData.get("contractorBusinessId") as string;
    if (!contractorBusinessId) return { error: "Missing contractor business ID." };

    await requireContractorAccess(profile.id, contractorBusinessId);

    const abn = formData.get("abn") as string;
    const entityName = (formData.get("entityName") as string) || null;
    const entityType = (formData.get("entityType") as string) || null;
    const abnStatus = (formData.get("abnStatus") as string) || null;
    const abnStatusFromDate = (formData.get("abnStatusFromDate") as string) || null;
    const gstStatus = (formData.get("gstStatus") as string) || null;
    const gstStatusFromDate = (formData.get("gstStatusFromDate") as string) || null;
    const businessNamesRaw = (formData.get("businessNames") as string) || "";
    const locationState = (formData.get("locationState") as string) || null;
    const locationPostcode = (formData.get("locationPostcode") as string) || null;
    const lookupStatus = (formData.get("lookupStatus") as string) || "ACTIVE_MATCHED";
    const errorMessage = (formData.get("errorMessage") as string) || null;
    const rawResponseStr = (formData.get("rawResponse") as string) || null;

    if (!abn?.trim()) return { error: "ABN is required." };

    const businessNames = businessNamesRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    let rawResponse: Record<string, unknown> | string | null = null;
    if (rawResponseStr) {
      try {
        rawResponse = JSON.parse(rawResponseStr) as Record<string, unknown>;
      } catch {
        rawResponse = rawResponseStr;
      }
    }

    await db.orm.public.AbnLookupRecord.create({
      contractorBusinessId,
      abn: toVarchar<11>(abn.replace(/\s/g, "")),
      entityName: entityName ? toVarchar<500>(entityName) : null,
      entityType: entityType ? toVarchar<200>(entityType) : null,
      abnStatus: abnStatus ? toVarchar<50>(abnStatus) : null,
      abnStatusFromDate: abnStatusFromDate
        ? toTimestamp(new Date(abnStatusFromDate).toISOString())
        : null,
      gstStatus: gstStatus ? toVarchar<50>(gstStatus) : null,
      gstStatusFromDate: gstStatusFromDate
        ? toTimestamp(new Date(gstStatusFromDate).toISOString())
        : null,
      businessNames,
      locationState: locationState ? toVarchar<3>(locationState) : null,
      locationPostcode: locationPostcode ? toVarchar<4>(locationPostcode) : null,
      lookupStatus,
      lookupTimestamp: toTimestamp(new Date().toISOString()),
      rawResponse: (rawResponse ?? null) as import("@prisma/orm-framework/contract/types").JsonValue | null,
      errorMessage,
      performedById: profile.id,
    });

    // Update ABN on the business if lookup was successful
    if (lookupStatus === "ACTIVE_MATCHED") {
      await db.orm.public.ContractorBusiness
        .where({ id: contractorBusinessId })
        .update({
          abn: toVarchar<11>(abn.replace(/\s/g, "")),
          gstRegistered: gstStatus?.toLowerCase() === "active",
        });
    }

    revalidatePath("/supplier/onboarding");
    return OK;
  } catch (err) {
    if (isRedirectError(err)) throw err;
    if (err instanceof AuthorisationError) return { error: err.message };
    console.error("saveAbnLookupResult error:", err);
    return { error: "Something went wrong. Please try again." };
  }
}

// ─── Step 4: Licences ───────────────────────────────────────────

export async function saveLicence(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireAuth();
    const contractorBusinessId = formData.get("contractorBusinessId") as string;
    if (!contractorBusinessId) return { error: "Missing contractor business ID." };

    await requireContractorAccess(profile.id, contractorBusinessId);

    const licenceId = (formData.get("licenceId") as string) || null;
    const licenceType = formData.get("licenceType") as string;
    const licenceNumber = formData.get("licenceNumber") as string;
    const issuingAuthority = formData.get("issuingAuthority") as string;
    const holderName = formData.get("holderName") as string;
    const holderEntityName = (formData.get("holderEntityName") as string) || null;
    const stateTerritory = (formData.get("stateTerritory") as string) || null;
    const licenceClass = (formData.get("licenceClass") as string) || null;
    const permittedWork = (formData.get("permittedWork") as string) || null;
    const relationshipToBusiness = (formData.get("relationshipToBusiness") as string) || null;
    const conditions = (formData.get("conditions") as string) || null;
    const issueDate = (formData.get("issueDate") as string) || null;
    const expiryDate = (formData.get("expiryDate") as string) || null;
    const documentUrl = (formData.get("documentUrl") as string) || null;

    if (!licenceType?.trim()) return { error: "Licence type is required." };
    if (!licenceNumber?.trim()) return { error: "Licence number is required." };
    if (!issuingAuthority?.trim()) return { error: "Issuing authority is required." };
    if (!holderName?.trim()) return { error: "Holder name is required." };

    const data = {
      licenceType: toVarchar<200>(licenceType.trim()),
      licenceNumber: toVarchar<100>(licenceNumber.trim()),
      issuingAuthority: toVarchar<300>(issuingAuthority.trim()),
      holderName: toVarchar<300>(holderName.trim()),
      holderEntityName: holderEntityName ? toVarchar<300>(holderEntityName) : null,
      stateTerritory: stateTerritory ? toVarchar<3>(stateTerritory) : null,
      licenceClass: licenceClass ? toVarchar<200>(licenceClass) : null,
      permittedWork,
      relationshipToBusiness: relationshipToBusiness
        ? toVarchar<200>(relationshipToBusiness)
        : null,
      conditions,
      issueDate: issueDate ? toTimestamp(new Date(issueDate).toISOString()) : null,
      expiryDate: expiryDate ? toTimestamp(new Date(expiryDate).toISOString()) : null,
      documentUrl,
    };

    if (licenceId) {
      await db.orm.public.WorksLicence
        .where({ id: licenceId })
        .update(data);
    } else {
      await db.orm.public.WorksLicence.create({
        contractorBusinessId,
        ...data,
        status: "SUBMITTED_UNVERIFIED",
      });
    }

    // Mark step complete
    await db.orm.public.ContractorOnboarding
      .where((o) => o.contractorBusinessId.eq(contractorBusinessId))
      .update({ stepLicencesComplete: true });

    revalidatePath("/supplier/onboarding");
    return OK;
  } catch (err) {
    if (isRedirectError(err)) throw err;
    if (err instanceof AuthorisationError) return { error: err.message };
    console.error("saveLicence error:", err);
    return { error: "Something went wrong. Please try again." };
  }
}

export async function deleteLicence(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireAuth();
    const contractorBusinessId = formData.get("contractorBusinessId") as string;
    const licenceId = formData.get("licenceId") as string;

    if (!contractorBusinessId || !licenceId) {
      return { error: "Missing required fields." };
    }

    await requireContractorAccess(profile.id, contractorBusinessId);

    await db.orm.public.WorksLicence.where({ id: licenceId }).delete();

    revalidatePath("/supplier/onboarding");
    return OK;
  } catch (err) {
    if (isRedirectError(err)) throw err;
    if (err instanceof AuthorisationError) return { error: err.message };
    console.error("deleteLicence error:", err);
    return { error: "Something went wrong. Please try again." };
  }
}

// ─── Step 5: Insurance ──────────────────────────────────────────

export async function saveInsurance(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireAuth();
    const contractorBusinessId = formData.get("contractorBusinessId") as string;
    if (!contractorBusinessId) return { error: "Missing contractor business ID." };

    await requireContractorAccess(profile.id, contractorBusinessId);

    const insuranceId = (formData.get("insuranceId") as string) || null;
    const policyType = formData.get("policyType") as string;
    const policyNumber = formData.get("policyNumber") as string;
    const insurer = formData.get("insurer") as string;
    const insuredName = formData.get("insuredName") as string;
    const insuredEntityName = (formData.get("insuredEntityName") as string) || null;
    const coverageAmount = formData.get("coverageAmount") as string;
    const coverageAmountBasis = (formData.get("coverageAmountBasis") as string) || null;
    const coveredActivities = (formData.get("coveredActivities") as string) || null;
    const exclusions = (formData.get("exclusions") as string) || null;
    const startDate = formData.get("startDate") as string;
    const expiryDate = formData.get("expiryDate") as string;
    const notApplicable = formData.get("notApplicable") === "true";
    const notApplicableReason = (formData.get("notApplicableReason") as string) || null;
    const contractorComments = (formData.get("contractorComments") as string) || null;
    const documentUrl = (formData.get("documentUrl") as string) || null;

    if (!notApplicable) {
      if (!policyType?.trim()) return { error: "Policy type is required." };
      if (!policyNumber?.trim()) return { error: "Policy number is required." };
      if (!insurer?.trim()) return { error: "Insurer is required." };
      if (!insuredName?.trim()) return { error: "Insured name is required." };
      if (!coverageAmount) return { error: "Coverage amount is required." };
      if (!startDate) return { error: "Start date is required." };
      if (!expiryDate) return { error: "Expiry date is required." };
    }

    const data = {
      policyType: policyType || "OTHER",
      policyNumber: toVarchar<100>(policyNumber?.trim() || "N/A"),
      insurer: toVarchar<300>(insurer?.trim() || "N/A"),
      insuredName: toVarchar<300>(insuredName?.trim() || "N/A"),
      insuredEntityName: insuredEntityName ? toVarchar<300>(insuredEntityName) : null,
      coverageAmount: toNumeric<14, 2>(coverageAmount || "0"),
      coverageAmountBasis: coverageAmountBasis
        ? toVarchar<200>(coverageAmountBasis)
        : null,
      coveredActivities,
      exclusions,
      startDate: toTimestamp(startDate || new Date().toISOString()),
      expiryDate: toTimestamp(expiryDate || new Date().toISOString()),
      notApplicable,
      notApplicableReason,
      contractorComments,
      documentUrl,
    };

    if (insuranceId) {
      await db.orm.public.WorksInsurance
        .where({ id: insuranceId })
        .update(data);
    } else {
      await db.orm.public.WorksInsurance.create({
        contractorBusinessId,
        ...data,
        status: notApplicable ? "NOT_SUPPLIED" : "SUBMITTED_UNVERIFIED",
      });
    }

    await db.orm.public.ContractorOnboarding
      .where((o) => o.contractorBusinessId.eq(contractorBusinessId))
      .update({ stepInsuranceComplete: true });

    revalidatePath("/supplier/onboarding");
    return OK;
  } catch (err) {
    if (isRedirectError(err)) throw err;
    if (err instanceof AuthorisationError) return { error: err.message };
    console.error("saveInsurance error:", err);
    return { error: "Something went wrong. Please try again." };
  }
}

export async function deleteInsurance(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireAuth();
    const contractorBusinessId = formData.get("contractorBusinessId") as string;
    const insuranceId = formData.get("insuranceId") as string;

    if (!contractorBusinessId || !insuranceId) {
      return { error: "Missing required fields." };
    }

    await requireContractorAccess(profile.id, contractorBusinessId);

    await db.orm.public.WorksInsurance.where({ id: insuranceId }).delete();

    revalidatePath("/supplier/onboarding");
    return OK;
  } catch (err) {
    if (isRedirectError(err)) throw err;
    if (err instanceof AuthorisationError) return { error: err.message };
    console.error("deleteInsurance error:", err);
    return { error: "Something went wrong. Please try again." };
  }
}

// ─── Step 6: Bank Details ───────────────────────────────────────

export async function saveBankDetails(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireAuth();
    const contractorBusinessId = formData.get("contractorBusinessId") as string;
    if (!contractorBusinessId) return { error: "Missing contractor business ID." };

    await requireContractorAccess(profile.id, contractorBusinessId);

    const accountName = formData.get("accountName") as string;
    const bankName = (formData.get("bankName") as string) || null;
    const bsb = formData.get("bsb") as string;
    const accountNumber = formData.get("accountNumber") as string;
    const remittanceEmail = (formData.get("remittanceEmail") as string) || null;
    const entityDifferenceExplanation =
      (formData.get("entityDifferenceExplanation") as string) || null;

    if (!accountName?.trim()) return { error: "Account name is required." };
    if (!bsb?.trim()) return { error: "BSB is required." };
    if (!accountNumber?.trim()) return { error: "Account number is required." };

    // Validate BSB format (6 digits, optionally with hyphen)
    const cleanBsb = bsb.replace(/[^0-9]/g, "");
    if (cleanBsb.length !== 6) {
      return { error: "BSB must be 6 digits." };
    }

    // Validate account number (4-9 digits)
    const cleanAccount = accountNumber.replace(/[^0-9]/g, "");
    if (cleanAccount.length < 4 || cleanAccount.length > 9) {
      return { error: "Account number must be between 4 and 9 digits." };
    }

    // Get next version number
    const existing = await db.orm.public.WorksBankDetailVersion
      .where((v) => v.contractorBusinessId.eq(contractorBusinessId))
      .all();

    const maxVersion = existing.reduce(
      (max, v) => Math.max(max, v.versionNumber),
      0,
    );

    // Mark any existing verified version as superseded
    for (const ver of existing) {
      if (ver.status === "VERIFIED") {
        await db.orm.public.WorksBankDetailVersion
          .where({ id: ver.id })
          .update({ status: "SUPERSEDED" });
      }
    }

    await db.orm.public.WorksBankDetailVersion.create({
      contractorBusinessId,
      versionNumber: maxVersion + 1,
      bsb: toVarchar<7>(`${cleanBsb.slice(0, 3)}-${cleanBsb.slice(3)}`),
      accountNumber: toVarchar<20>(cleanAccount),
      accountName: toVarchar<200>(accountName.trim()),
      bankName: bankName ? toVarchar<200>(bankName.trim()) : null,
      remittanceEmail: remittanceEmail
        ? toVarchar<320>(remittanceEmail.trim())
        : null,
      entityDifferenceExplanation,
      updatedById: profile.id,
      status: "SUBMITTED_UNVERIFIED",
    });

    await db.orm.public.ContractorOnboarding
      .where((o) => o.contractorBusinessId.eq(contractorBusinessId))
      .update({ stepBankingComplete: true });

    revalidatePath("/supplier/onboarding");
    return OK;
  } catch (err) {
    if (isRedirectError(err)) throw err;
    if (err instanceof AuthorisationError) return { error: err.message };
    console.error("saveBankDetails error:", err);
    return { error: "Something went wrong. Please try again." };
  }
}

// ─── Step 7: Declarations and Membership ────────────────────────

export async function acceptDeclarations(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireAuth();
    const contractorBusinessId = formData.get("contractorBusinessId") as string;
    if (!contractorBusinessId) return { error: "Missing contractor business ID." };

    await requireContractorAccess(profile.id, contractorBusinessId);

    const declarationsJson = formData.get("declarations") as string;
    if (!declarationsJson) return { error: "Declarations data is required." };

    let declarations: Array<{
      declarationType: string;
      documentVersion: string;
      accepted: boolean;
    }>;

    try {
      declarations = JSON.parse(declarationsJson);
    } catch {
      return { error: "Invalid declarations data." };
    }

    const now = new Date().toISOString();

    for (const decl of declarations) {
      await db.orm.public.ContractorDeclaration.create({
        contractorBusinessId,
        declarationType: decl.declarationType,
        documentVersion: toVarchar<50>(decl.documentVersion),
        accepted: decl.accepted,
        acceptedAt: decl.accepted ? toTimestamp(now) : null,
        acceptedById: decl.accepted ? profile.id : null,
      });
    }

    // Create promotional membership if not exists
    const existingMembership = await db.orm.public.ContractorMembership
      .where((m) => m.contractorBusinessId.eq(contractorBusinessId))
      .first();

    if (!existingMembership) {
      const plan = await contractorPlanPrice();
      await db.orm.public.ContractorMembership.create({
        contractorBusinessId,
        promotionId: toVarchar<100>("LAUNCH_2027"),
        promotionStart: toTimestamp(now),
        promotionEnd: toTimestamp("2027-03-31T23:59:59+11:00"),
        termsVersion: toVarchar<50>("1.0"),
        acceptedById: profile.id,
        acceptedAt: toTimestamp(now),
        subscriptionStatus: "PROMOTIONAL",
        paidActivationStatus: "NOT_ACTIVATED",
        // Price from the price book; the column default applies if it is missing.
        ...(plan ? { planMonthlyPrice: toNumeric<10, 2>(String(plan.cents / 100)), planGstInclusive: plan.gstInclusive } : {}),
      });
    }

    await db.orm.public.ContractorOnboarding
      .where((o) => o.contractorBusinessId.eq(contractorBusinessId))
      .update({ stepMembershipComplete: true });

    revalidatePath("/supplier/onboarding");
    return OK;
  } catch (err) {
    if (isRedirectError(err)) throw err;
    if (err instanceof AuthorisationError) return { error: err.message };
    console.error("acceptDeclarations error:", err);
    return { error: "Something went wrong. Please try again." };
  }
}

// ─── Step 8: Submit Application ─────────────────────────────────

export async function submitApplication(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireAuth();
    const contractorBusinessId = formData.get("contractorBusinessId") as string;
    if (!contractorBusinessId) return { error: "Missing contractor business ID." };

    await requireContractorAccess(profile.id, contractorBusinessId);

    // Verify all required steps are complete
    const onboarding = await db.orm.public.ContractorOnboarding
      .where((o) => o.contractorBusinessId.eq(contractorBusinessId))
      .first();

    if (!onboarding) return { error: "Onboarding record not found." };

    const missingSteps: string[] = [];
    if (!onboarding.stepAccountComplete) missingSteps.push("Account");
    if (!onboarding.stepBusinessComplete) missingSteps.push("Business profile");
    if (!onboarding.stepServicesComplete) missingSteps.push("Services");
    // Licences and insurance are optional but we check membership
    if (!onboarding.stepMembershipComplete) missingSteps.push("Membership");

    if (missingSteps.length > 0) {
      return {
        error: `Please complete the following steps before submitting: ${missingSteps.join(", ")}.`,
      };
    }

    const now = new Date().toISOString();

    // Update onboarding status
    await db.orm.public.ContractorOnboarding
      .where((o) => o.contractorBusinessId.eq(contractorBusinessId))
      .update({
        status: "SUBMITTED",
        submittedAt: toTimestamp(now),
        stepReviewComplete: true,
      });

    // Create review item for admin
    await db.orm.public.ContractorReviewItem.create({
      contractorBusinessId,
      queueType: "NEW_APPLICATION",
      status: "PENDING",
      priority: "NORMAL",
    });

    revalidatePath("/supplier/onboarding");
    revalidatePath("/supplier");
    return OK;
  } catch (err) {
    if (isRedirectError(err)) throw err;
    if (err instanceof AuthorisationError) return { error: err.message };
    console.error("submitApplication error:", err);
    return { error: "Something went wrong. Please try again." };
  }
}

// ─── Onboarding Step Navigation ─────────────────────────────────

export async function updateOnboardingStep(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireAuth();
    const contractorBusinessId = formData.get("contractorBusinessId") as string;
    const step = Number(formData.get("step"));

    if (!contractorBusinessId) return { error: "Missing contractor business ID." };
    if (isNaN(step) || step < 1 || step > 8) return { error: "Invalid step number." };

    await requireContractorAccess(profile.id, contractorBusinessId);

    await db.orm.public.ContractorOnboarding
      .where((o) => o.contractorBusinessId.eq(contractorBusinessId))
      .update({ currentStep: step });

    revalidatePath("/supplier/onboarding");
    return OK;
  } catch (err) {
    if (isRedirectError(err)) throw err;
    if (err instanceof AuthorisationError) return { error: err.message };
    console.error("updateOnboardingStep error:", err);
    return { error: "Something went wrong. Please try again." };
  }
}

// ─── Admin Review Actions ───────────────────────────────────────

export async function reviewContractorApplication(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireAuth();

    const reviewItemId = formData.get("reviewItemId") as string;
    const outcome = formData.get("outcome") as string;
    const outcomeNotes = (formData.get("outcomeNotes") as string) || null;

    if (!reviewItemId) return { error: "Review item ID is required." };
    if (!outcome) return { error: "Outcome is required." };

    const now = new Date().toISOString();

    // Update the review item
    const status =
      outcome === "APPROVED"
        ? "APPROVED"
        : outcome === "REJECTED"
          ? "REJECTED"
          : outcome === "NEEDS_INFO"
            ? "AWAITING_RESPONSE"
            : "DEFERRED";

    await db.orm.public.ContractorReviewItem
      .where({ id: reviewItemId })
      .update({
        status,
        outcome: toVarchar<100>(outcome),
        outcomeNotes,
        completedById: profile.id,
        completedAt: toTimestamp(now),
      });

    // If approved and it is a new application, update onboarding
    const reviewItem = await db.orm.public.ContractorReviewItem.first({
      id: reviewItemId,
    });

    if (
      reviewItem &&
      outcome === "APPROVED" &&
      reviewItem.queueType === "NEW_APPLICATION"
    ) {
      await db.orm.public.ContractorOnboarding
        .where((o) =>
          o.contractorBusinessId.eq(reviewItem.contractorBusinessId),
        )
        .update({
          status: "REVIEWED",
          reviewedAt: toTimestamp(now),
          reviewNotes: outcomeNotes,
        });

      // Update contractor business status
      await db.orm.public.ContractorBusiness
        .where({ id: reviewItem.contractorBusinessId })
        .update({ status: "APPROVED" });
    }

    revalidatePath("/supplier");
    revalidatePath("/adviser");
    return OK;
  } catch (err) {
    if (isRedirectError(err)) throw err;
    if (err instanceof AuthorisationError) return { error: err.message };
    console.error("reviewContractorApplication error:", err);
    return { error: "Something went wrong. Please try again." };
  }
}

export async function assignReviewer(
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAuth();

    const reviewItemId = formData.get("reviewItemId") as string;
    const assignToId = formData.get("assignToId") as string;

    if (!reviewItemId || !assignToId) {
      return { error: "Review item and assignee are required." };
    }

    await db.orm.public.ContractorReviewItem
      .where({ id: reviewItemId })
      .update({
        assignedToId: assignToId,
        status: "IN_PROGRESS",
      });

    revalidatePath("/adviser");
    return OK;
  } catch (err) {
    if (isRedirectError(err)) throw err;
    if (err instanceof AuthorisationError) return { error: err.message };
    console.error("assignReviewer error:", err);
    return { error: "Something went wrong. Please try again." };
  }
}

export async function requestClarification(
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAuth();

    const reviewItemId = formData.get("reviewItemId") as string;
    const clarificationRequest = formData.get("clarificationRequest") as string;

    if (!reviewItemId) return { error: "Review item ID is required." };
    if (!clarificationRequest?.trim()) {
      return { error: "Clarification request text is required." };
    }

    const reviewItem = await db.orm.public.ContractorReviewItem.first({
      id: reviewItemId,
    });
    if (!reviewItem) return { error: "Review item not found." };

    await db.orm.public.ContractorReviewItem
      .where({ id: reviewItemId })
      .update({
        clarificationRequest,
        status: "AWAITING_RESPONSE",
      });

    // Update onboarding status
    await db.orm.public.ContractorOnboarding
      .where((o) =>
        o.contractorBusinessId.eq(reviewItem.contractorBusinessId),
      )
      .update({ status: "INFORMATION_REQUIRED" });

    revalidatePath("/supplier");
    revalidatePath("/adviser");
    return OK;
  } catch (err) {
    if (isRedirectError(err)) throw err;
    if (err instanceof AuthorisationError) return { error: err.message };
    console.error("requestClarification error:", err);
    return { error: "Something went wrong. Please try again." };
  }
}

export async function respondToClarification(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profile = await requireAuth();

    const reviewItemId = formData.get("reviewItemId") as string;
    const clarificationResponse = formData.get("clarificationResponse") as string;

    if (!reviewItemId) return { error: "Review item ID is required." };
    if (!clarificationResponse?.trim()) {
      return { error: "Response text is required." };
    }

    const reviewItem = await db.orm.public.ContractorReviewItem.first({
      id: reviewItemId,
    });
    if (!reviewItem) return { error: "Review item not found." };

    // Verify the profile is a contact of this business
    await requireContractorAccess(
      profile.id,
      reviewItem.contractorBusinessId,
    );

    await db.orm.public.ContractorReviewItem
      .where({ id: reviewItemId })
      .update({
        clarificationResponse,
        status: "PENDING",
      });

    revalidatePath("/supplier");
    revalidatePath("/adviser");
    return OK;
  } catch (err) {
    if (isRedirectError(err)) throw err;
    if (err instanceof AuthorisationError) return { error: err.message };
    console.error("respondToClarification error:", err);
    return { error: "Something went wrong. Please try again." };
  }
}
