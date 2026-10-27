"use server";
import { LOCKED_MESSAGE, LOCKED_SCHEME_FIELDS, changedLockedFields, requireRolesOrAdmin } from "@/lib/auth/building-lock";
import { defaultTimeZone, PLATFORM_TIME_ZONE, todayIn } from "@/lib/jurisdiction/time-zone";
import { logError } from "@/lib/log";
import { db } from "@/prisma/db";

import { recordSecurityEvent } from "@/lib/audit/security-audit";
import { redirect } from "next/navigation";
import { requireRecentMfa } from "@/lib/auth/mfa-enforcement";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin, AuthorisationError } from "@/lib/auth/require-membership";
import {
  createScheme,
  updateScheme,
  deleteScheme,
} from "@/lib/queries/schemes";
import { logActivity } from "@/lib/queries/activity-log";
import {
  parseStrataRollPDF,
  type ParsedStrataRoll,
} from "@/lib/parse-strata-roll";
import { TooManyPagesError } from "@/lib/pdf/layout-text";
import {
  checkLotBalances,
  checkLots,
  checkOpeningBalances,
  checkYearEnd,
  type LotBalanceInput,
  type OnboardingLot,
  type OpeningBalancesInput,
} from "@/lib/onboarding/property-onboarding";
import { stageOnboardingCutover } from "@/lib/onboarding/stage-opening-cutover";
import { AUSTRALIAN_STATES, schemeLocationProblems } from "@/config/jurisdictions";
import { UnsupportedJurisdictionError } from "@/config/statutory";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { regulationModuleChoiceProblem } from "@/lib/jurisdiction/building-data";

/** The Add Property steps a server-side problem can send the wizard back to. */
export type OnboardingStep = "details" | "address" | "lots" | "balances" | "lotBalances";

export type SchemeFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Onboarding: the step to show, and the problems found on it. */
  step?: OnboardingStep;
  stepErrors?: string[];
  /**
   * The building was created and a property photo is waiting in the
   * browser: it uploads the photo, then goes to `destination`.
   */
  created?: { schemeId: string; destination: string };
};

export type StrataRollParseResult = {
  success: boolean;
  error?: string;
  data?: ParsedStrataRoll;
};

/** Today in a new building's time zone, from its state and postcode (StrataVerze's own until they are known). */
function newBuildingToday(state: string | null | undefined, postcode: string | null | undefined): string {
  return todayIn(defaultTimeZone(state, postcode) ?? PLATFORM_TIME_ZONE);
}

function validateSchemeForm(formData: FormData) {
  const errors: Record<string, string> = {};

  const name = formData.get("name") as string | null;
  const planNumber = formData.get("planNumber") as string | null;
  const address = formData.get("address") as string | null;
  const suburb = formData.get("suburb") as string | null;
  const state = formData.get("state") as string | null;
  const postcode = formData.get("postcode") as string | null;
  const totalLots = formData.get("totalLots") as string | null;
  const totalEntitlement = formData.get("totalEntitlement") as string | null;

  if (!name?.trim()) errors.name = "Scheme name is required.";
  if (!planNumber?.trim()) errors.planNumber = "Plan number is required.";
  if (!address?.trim()) errors.address = "Address is required.";
  if (!suburb?.trim()) errors.suburb = "Suburb is required.";
  if (!state || !(AUSTRALIAN_STATES as readonly string[]).includes(state.trim().toUpperCase()))
    errors.state = "Select a valid state.";
  if (!postcode?.trim() || !/^\d{4}$/.test(postcode.trim()))
    errors.postcode = "Enter a valid 4-digit postcode.";
  if (!totalLots || !Number.isInteger(Number(totalLots)) || Number(totalLots) < 1)
    errors.totalLots = "Must have at least 1 lot (a whole number).";
  if (!totalEntitlement || !Number.isInteger(Number(totalEntitlement)) || Number(totalEntitlement) < 1)
    errors.totalEntitlement = "Total unit entitlement must be a whole number of at least 1.";

  // The end of the building's current financial year, as a full date. The
  // day and month are stored and roll forward each year (24 Oct).
  // Today in the new building's time zone (from its state and postcode).
  const yearEnd = checkYearEnd(formData.get("financialYearEnd") as string | null, newBuildingToday(state, postcode));
  if (!yearEnd.ok) errors.financialYearEnd = yearEnd.message;

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
    yearEnd: yearEnd.ok ? yearEnd.date : null,
    data: {
      name: name?.trim() ?? "",
      planNumber: planNumber?.trim() ?? "",
      address: address?.trim() ?? "",
      suburb: suburb?.trim() ?? "",
      state: (state ?? "").trim().toUpperCase(),
      postcode: postcode?.trim() ?? "",
      totalLots: Number(totalLots),
      totalEntitlement: Number(totalEntitlement),
      financialYearEnd: yearEnd.ok ? yearEnd.mmdd : "06-30",
      abnNumber: (formData.get("abnNumber") as string)?.trim() || undefined,
      buildingType: (formData.get("buildingType") as string)?.trim() || undefined,
      buildingClass: (formData.get("buildingClass") as string)?.trim() || undefined,
      buildingSubType: (formData.get("buildingSubType") as string)?.trim() || undefined,
      folio: (formData.get("folio") as string)?.trim() || undefined,
      isActive: formData.get("isActive") !== "false",
      allInclusiveFees: formData.get("allInclusiveFees") === "true",
      paymentPlan: (formData.get("paymentPlan") as string)?.trim() || undefined,
      debtCollection: formData.get("debtCollection") === "true",
    },
  };
}

const DETAIL_FIELDS = ["name", "planNumber", "totalLots", "totalEntitlement"];

/** A JSON array posted by the wizard, or null if it is missing, too large or not an array. */
function readJsonArray(formData: FormData, name: string, maxLength: number): unknown[] | null {
  const raw = formData.get(name);
  if (typeof raw !== "string" || raw.length > maxLength) return null;
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function readJsonObject(formData: FormData, name: string, maxLength: number): Record<string, unknown> | null {
  const raw = formData.get(name);
  if (typeof raw !== "string" || raw.length > maxLength) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

function fundSheet(v: unknown) {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    cashAtBank: str(o.cashAtBank),
    leviesReceivable: str(o.leviesReceivable),
    leviesInAdvance: str(o.leviesInAdvance),
    creditors: str(o.creditors),
    fundBalance: str(o.fundBalance),
  };
}

export async function createSchemeAction(
  _prev: SchemeFormState,
  formData: FormData,
): Promise<SchemeFormState> {
  const { errors: formErrors, isValid: formValid, data, yearEnd } = validateSchemeForm(formData);
  // Only buildings in a supported jurisdiction, with a postcode there.
  const errors = { ...schemeLocationProblems(data), ...formErrors };
  const isValid = formValid && Object.keys(errors).length === 0;
  if (!isValid) {
    const onDetails = Object.keys(errors).some((k) => DETAIL_FIELDS.includes(k));
    return { fieldErrors: errors, step: onDetails ? "details" : "address", stepErrors: Object.values(errors) };
  }

  // The onboarding steps, checked again here with the same rules the wizard
  // shows (24 Oct). Nothing is saved unless every step passes.
  const lotRows = readJsonArray(formData, "lotsJson", 2_000_000);
  if (!lotRows) return { step: "lots", stepErrors: ["Enter the building's lots."] };
  const lotsInput: OnboardingLot[] = lotRows.map((r) => {
    const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    return { lotNumber: str(o.lotNumber), unitNumber: str(o.unitNumber), entitlement: str(o.entitlement), ownerName: str(o.ownerName) };
  });
  const lots = checkLots(lotsInput, data.totalLots, data.totalEntitlement);
  if (!lots.ok) {
    const rowProblems = Object.entries(lots.rowErrors).map(([i, p]) => `Row ${Number(i) + 1}: ${p.join(" ")}`);
    return { step: "lots", stepErrors: [...lots.errors, ...rowProblems].slice(0, 20) };
  }

  const balancesRaw = readJsonObject(formData, "balancesJson", 20_000);
  if (!balancesRaw) return { step: "balances", stepErrors: ["Enter the building's opening balances."] };
  const balancesInput: OpeningBalancesInput = {
    takeoverDate: str(balancesRaw.takeoverDate),
    totalBalance: str(balancesRaw.totalBalance),
    admin: fundSheet(balancesRaw.admin),
    capitalWorks: fundSheet(balancesRaw.capitalWorks),
  };
  const balances = checkOpeningBalances(balancesInput, yearEnd, newBuildingToday(data.state, data.postcode));
  if (!balances.ok) return { step: "balances", stepErrors: [...Object.values(balances.fieldErrors), ...balances.errors] };

  const lotBalanceRows = readJsonArray(formData, "lotBalancesJson", 2_000_000);
  if (!lotBalanceRows) return { step: "lotBalances", stepErrors: ["Enter each lot's opening balance."] };
  const lotBalancesInput: LotBalanceInput[] = lotBalanceRows.map((r) => {
    const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    return {
      lotNumber: str(o.lotNumber),
      admin: str(o.admin),
      interestAdmin: str(o.interestAdmin),
      capitalWorks: str(o.capitalWorks),
      interestCapitalWorks: str(o.interestCapitalWorks),
      unallocated: str(o.unallocated),
    };
  });
  const lotBalances = checkLotBalances(lotBalancesInput, lots.lots, balances);
  if (!lotBalances.ok) {
    const rowProblems = Object.entries(lotBalances.rowErrors).map(([i, p]) => `Lot ${lotBalancesInput[Number(i)]?.lotNumber ?? ""}: ${p.join(" ")}`);
    return { step: "lotBalances", stepErrors: [...lotBalances.errors, ...rowProblems].slice(0, 20) };
  }

  let destination: string;
  let createdId = "";
  try {
    // Buildings are onboarded by StrataVerze administrators only (SEC-002).
    const profile = await requirePlatformAdmin();

    const existing = await db.orm.public.Scheme.where((s) => s.planNumber.eq(data.planNumber)).first();
    if (existing) {
      const message = "A building with this plan number is already registered.";
      return { fieldErrors: { planNumber: message }, step: "details", stepErrors: [message] };
    }

    const scheme = await createScheme(data, profile.id, lots.lots);
    await recordSecurityEvent({
      action: "scheme.created",
      outcome: "allowed",
      actorProfileId: profile.id,
      actorRole: "platform_admin",
      schemeId: scheme.id,
      resourceType: "Scheme",
      resourceId: scheme.id,
    });
    destination = `/adviser/schemes/${scheme.id}`;
    createdId = scheme.id;

    // The opening balances become a draft cutover for the Adviser to sign
    // off and post in Finance. The building stands even if this fails: the
    // cutover page says so and the balances can be entered there.
    try {
      const batchId = await stageOnboardingCutover({
        schemeId: scheme.id,
        actorId: profile.id,
        takeoverDate: balances.takeoverDate!,
        balances,
        lotBalances: lotBalances.rows,
      });
      // Next: last year's income and expenditure, this year's budget and the levies.
      if (batchId) destination = `/adviser/schemes/${scheme.id}/finance/migration/income-budget`;
    } catch (err) {
      logError("createSchemeAction: the opening balances could not be staged:", err);
      destination = `/adviser/schemes/${scheme.id}/finance/migration/cutover?onboarding=not-staged`;
    }
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    // redirect() throws a NEXT_REDIRECT error — rethrow it
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    // Also check for the Next.js redirect digest
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    logError("createSchemeAction error:", err);
    return { error: "Failed to create scheme. Please try again." };
  }
  // A property photo chosen in the wizard is uploaded by the browser now
  // that the building exists (25 Oct 2026), so it is never sent with the form.
  if (formData.get("photoPending") === "1") return { created: { schemeId: createdId, destination } };
  redirect(destination);
}

export async function updateSchemeAction(
  schemeId: string,
  _prev: SchemeFormState,
  formData: FormData,
): Promise<SchemeFormState> {
  const { errors, isValid, data } = validateSchemeForm(formData);
  if (!isValid) return { fieldErrors: errors };

  try {
    const { profile, isAdmin } = await requireRolesOrAdmin(schemeId, ["ADVISER"]);

    // Plan number, address, total lots and total unit entitlement are part of
    // the locked building record: StrataVerze only (24 Oct). The Adviser may
    // change the display name, ABN and financial year end.
    const current = await db.orm.public.Scheme.where((s) => s.id.eq(schemeId)).first();
    if (!current) return { error: "Scheme not found." };
    // A changed state or postcode must be a supported jurisdiction. An
    // unchanged one is not checked again, so an older record can be edited.
    const location = schemeLocationProblems(data, { state: current.state, postcode: current.postcode });
    if (Object.keys(location).length) return { fieldErrors: location };
    const locked = changedLockedFields(LOCKED_SCHEME_FIELDS, current as Record<string, unknown>, data);
    if (locked.length && !isAdmin) {
      await recordSecurityEvent({
        action: "access.denied",
        outcome: "denied",
        actorProfileId: profile.id,
        schemeId,
        resourceType: "Scheme",
        resourceId: schemeId,
        reason: "locked building record",
      });
      return { error: LOCKED_MESSAGE };
    }

    await updateScheme(schemeId, data);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "SCHEME_UPDATED",
      entityType: "Scheme",
      entityId: schemeId,
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    revalidatePath("/adviser/schemes");
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update scheme. Please try again." };
  }
}

export type RegulationModuleState = { error?: string; success?: boolean };

/**
 * Saves the building's regulation module (QLD stage 2, step 10), for a
 * building whose rule pack has a REGULATION_MODULE selector. The adviser (or
 * StrataVerze) saves it, as for the building's other settings. Only a module
 * StrataVerze applies can be saved.
 */
export async function saveRegulationModuleAction(
  schemeId: string,
  _prev: RegulationModuleState,
  formData: FormData,
): Promise<RegulationModuleState> {
  try {
    const { profile } = await requireRolesOrAdmin(schemeId, ["ADVISER"]);
    const current = await db.orm.public.Scheme.where((s) => s.id.eq(schemeId)).first();
    if (!current) return { error: "Scheme not found." };
    const { rules } = rulesForState(current.state);
    const value = String(formData.get("regulationModule") ?? "").trim();
    const problem = regulationModuleChoiceProblem(rules, value);
    if (problem) return { error: problem };

    await db.orm.public.Scheme.where((s) => s.id.eq(schemeId)).update({ regulationModule: value });
    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "REGULATION_MODULE_CHANGED",
      entityType: "Scheme",
      entityId: schemeId,
      metadata: { from: current.regulationModule ?? null, to: value },
    });
    revalidatePath(`/adviser/schemes/${schemeId}`);
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    if (err instanceof UnsupportedJurisdictionError) return { error: err.message };
    logError("saveRegulationModuleAction error:", err);
    return { error: "Failed to save the setting. Please try again." };
  }
}

export async function deleteSchemeAction(schemeId: string) {
  try {
    // Deleting a building: StrataVerze only (24 Oct).
    const profile = await requirePlatformAdmin();
    // A sensitive operation: needs an authenticator check in the last 15 minutes.
    await requireRecentMfa();

    await deleteScheme(schemeId);
    // The building's activity log goes with it; this record stays.
    await recordSecurityEvent({
      action: "scheme.deleted",
      outcome: "allowed",
      actorProfileId: profile.id,
      actorRole: "ADVISER",
      schemeId,
      resourceType: "Scheme",
      resourceId: schemeId,
    });
    revalidatePath("/adviser/schemes");
    redirect("/adviser/schemes");
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    return { error: "Failed to delete scheme." };
  }
}

/**
 * Parse an uploaded strata roll PDF and extract scheme + lot data.
 */
export async function parseStrataRollAction(
  formData: FormData,
): Promise<StrataRollParseResult> {

  try {
    // Part of building onboarding, which only StrataVerze administrators do.
    await requirePlatformAdmin();
  } catch (err) {
    if (err instanceof AuthorisationError) return { success: false, error: err.message };
    throw err;
  }

  const file = formData.get("strataRoll") as File | null;
  if (!file || file.size === 0) {
    return { success: false, error: "Please select a file to upload." };
  }

  // Validate file type
  const allowedTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!allowedTypes.includes(file.type) && ext !== "pdf" && ext !== "docx") {
    return {
      success: false,
      error: "Only .pdf and .docx files are supported.",
    };
  }

  // Validate file size (30MB max)
  if (file.size > 30 * 1024 * 1024) {
    return { success: false, error: "File must be smaller than 30 MB." };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (ext === "docx" || file.type.includes("wordprocessingml")) {
      return {
        success: false,
        error:
          "DOCX parsing is not yet supported. Please convert to PDF and try again.",
      };
    }

    const data = await parseStrataRollPDF(buffer);

    // Check how many scheme fields were actually extracted
    const s = data.scheme;
    const fieldsFound = [
      s.name,
      s.planNumber,
      s.address,
      s.suburb,
      s.state,
      s.postcode,
      s.abnNumber,
      s.totalLots,
      s.totalEntitlement,
    ].filter((v) => v != null).length;

    if (fieldsFound === 0 && data.lots.length === 0) {
      // Nothing could be extracted — return debug info
      // The roll's text holds owners' names and addresses, so only its
      // length is logged (S7, SEC-026).
      console.warn("parseStrataRollAction: no fields extracted. Text length:", data.rawTextPreview?.length ?? 0);
      return {
        success: false,
        error: data.issues.find((i) => i.code === "no-text")?.message ??
          "The document was read but no scheme data could be extracted. " +
            "Please check that the file is a strata roll (not a levy notice or meeting minutes) " +
            "and try again, or skip to enter details manually.",
      };
    }

    // Only what the wizard uses goes to the browser: owners' addresses and
    // emails, and the raw text, stay on the server until a later step needs
    // them (review of 24 Oct).
    return {
      success: true,
      data: {
        ...data,
        rawTextPreview: undefined,
        details: data.details.map((d) => ({ lotNumber: d.lotNumber, tablePage: d.tablePage, ownerPage: d.ownerPage })),
      },
    };
  } catch (err) {
    if (err instanceof TooManyPagesError) return { success: false, error: `${err.message} Upload the strata roll on its own.` };
    logError("parseStrataRollAction error:", err);
    return {
      success: false,
      error: "Failed to parse the strata roll. Please check the file and try again.",
    };
  }
}
