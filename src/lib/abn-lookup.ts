import { logError } from "@/lib/log";
/**
 * ABN Lookup Integration
 *
 * Backend-only module for verifying Australian Business Numbers against
 * the official ABN Lookup web services (abr.business.gov.au).
 *
 * Credentials are never exposed to the browser.
 */

// ─── ABN Format Helpers ──────────────────────────────────────────

/** Strip all whitespace and non-digit characters from a raw ABN string. */
export function normaliseAbn(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Validate that an ABN is exactly 11 digits and passes the official
 * ABN checksum algorithm.
 *
 * Algorithm:
 *   1. Subtract 1 from the first digit.
 *   2. Multiply each digit by its positional weight.
 *   3. Sum the products.
 *   4. Valid if sum mod 89 is zero.
 */
export function validateAbnFormat(abn: string): boolean {
  if (!/^\d{11}$/.test(abn)) return false;

  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const digits = abn.split("").map(Number);

  // Subtract 1 from the first digit
  digits[0] = digits[0] - 1;

  let sum = 0;
  for (let i = 0; i < 11; i++) {
    sum += digits[i] * weights[i];
  }

  return sum % 89 === 0;
}

// ─── Types ───────────────────────────────────────────────────────

export interface AbnLookupResult {
  abn: string;
  entityName: string;
  entityType: string;
  abnStatus: string;
  abnStatusFromDate: string | null;
  gstStatus: string | null;
  gstStatusFromDate: string | null;
  businessNames: string[];
  locationState: string | null;
  locationPostcode: string | null;
  rawResponse: unknown;
}

export type AbnLookupErrorCode =
  | "INVALID_FORMAT"
  | "SERVICE_UNAVAILABLE"
  | "NOT_FOUND"
  | "AUTH_FAILED"
  | "PARSE_ERROR";

export type AbnLookupOutcome =
  | { success: true; data: AbnLookupResult }
  | { success: false; error: string; code: AbnLookupErrorCode };

// ─── XML Parsing Helpers ─────────────────────────────────────────

/** Extract the text content of the first occurrence of a given XML tag. */
function extractXmlValue(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
  const match = xml.match(re);
  return match ? match[1].trim() : null;
}

/** Extract all text values for a repeated XML tag. */
function extractXmlValues(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "gi");
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const val = match[1].trim();
    if (val) results.push(val);
  }
  return results;
}

/** Extract the content of an XML block (including nested tags). */
function extractXmlBlock(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(re);
  return match ? match[1] : null;
}

// ─── Main Lookup Function ────────────────────────────────────────

/**
 * Look up an ABN against the official ABN Lookup web service.
 *
 * Requires `ABN_LOOKUP_GUID` to be set in the environment.
 * Never exposes the GUID in logs or error messages.
 */
export async function lookupAbn(rawAbn: string): Promise<AbnLookupOutcome> {
  const abn = normaliseAbn(rawAbn);

  if (!validateAbnFormat(abn)) {
    return {
      success: false,
      error: "The ABN entered is not a valid 11-digit Australian Business Number.",
      code: "INVALID_FORMAT",
    };
  }

  const guid = process.env.ABN_LOOKUP_GUID;
  if (!guid) {
    return {
      success: false,
      error: "ABN Lookup service is not configured. Please contact support.",
      code: "SERVICE_UNAVAILABLE",
    };
  }

  const url = new URL(
    "https://abr.business.gov.au/abrxmlsearch/AbrXmlSearch.asmx/SearchByABNv202001",
  );
  url.searchParams.set("searchString", abn);
  url.searchParams.set("includeHistoricalDetails", "N");
  url.searchParams.set("authenticationGuid", guid);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  let responseText: string;

  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { Accept: "application/xml" },
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        console.error("ABN Lookup authentication failed (HTTP %d)", res.status);
        return {
          success: false,
          error: "ABN Lookup authentication failed. Please contact support.",
          code: "AUTH_FAILED",
        };
      }
      console.error("ABN Lookup returned HTTP %d", res.status);
      return {
        success: false,
        error: "ABN Lookup service is temporarily unavailable. Please try again later.",
        code: "SERVICE_UNAVAILABLE",
      };
    }

    responseText = await res.text();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.error("ABN Lookup request timed out");
    } else {
      logError("ABN Lookup network error:", err);
    }
    return {
      success: false,
      error: "ABN Lookup service is temporarily unavailable. Please try again later.",
      code: "SERVICE_UNAVAILABLE",
    };
  } finally {
    clearTimeout(timeout);
  }

  // ── Parse the XML response ──

  try {
    // Check for exception/error in the response
    const exception = extractXmlBlock(responseText, "exception");
    if (exception) {
      const exceptionDesc =
        extractXmlValue(exception, "exceptionDescription") ?? "Unknown error";

      if (
        exceptionDesc.toLowerCase().includes("not found") ||
        exceptionDesc.toLowerCase().includes("no record")
      ) {
        return {
          success: false,
          error: "No business found for the entered ABN.",
          code: "NOT_FOUND",
        };
      }

      if (exceptionDesc.toLowerCase().includes("authentication")) {
        console.error("ABN Lookup auth exception");
        return {
          success: false,
          error: "ABN Lookup authentication failed. Please contact support.",
          code: "AUTH_FAILED",
        };
      }

      return {
        success: false,
        error: `ABN Lookup returned an error: ${exceptionDesc}`,
        code: "PARSE_ERROR",
      };
    }

    const businessEntity =
      extractXmlBlock(responseText, "businessEntity202001") ??
      extractXmlBlock(responseText, "businessEntity201408") ??
      extractXmlBlock(responseText, "businessEntity");

    if (!businessEntity) {
      return {
        success: false,
        error: "No business found for the entered ABN.",
        code: "NOT_FOUND",
      };
    }

    // ABN details
    const abnBlock = extractXmlBlock(businessEntity, "ABN");
    const identifierValue = abnBlock
      ? extractXmlValue(abnBlock, "identifierValue")
      : null;
    const identifierStatus = abnBlock
      ? extractXmlValue(abnBlock, "identifierStatus")
      : null;

    // Entity status
    const entityStatusBlock = extractXmlBlock(businessEntity, "entityStatus");
    const entityStatusCode = entityStatusBlock
      ? extractXmlValue(entityStatusBlock, "entityStatusCode")
      : null;
    const statusEffectiveFrom = entityStatusBlock
      ? extractXmlValue(entityStatusBlock, "effectiveFrom")
      : null;

    // Entity type
    const entityTypeBlock = extractXmlBlock(businessEntity, "entityType");
    const entityTypeDesc = entityTypeBlock
      ? extractXmlValue(entityTypeBlock, "entityDescription")
      : null;

    // Entity name: try mainName first, then legalName
    const mainNameBlock = extractXmlBlock(businessEntity, "mainName");
    let entityName = mainNameBlock
      ? extractXmlValue(mainNameBlock, "organisationName")
      : null;

    if (!entityName) {
      const legalNameBlock = extractXmlBlock(businessEntity, "legalName");
      if (legalNameBlock) {
        const given = extractXmlValue(legalNameBlock, "givenName") ?? "";
        const other = extractXmlValue(legalNameBlock, "otherGivenName") ?? "";
        const family = extractXmlValue(legalNameBlock, "familyName") ?? "";
        entityName = [given, other, family].filter(Boolean).join(" ");
      }
    }

    // GST
    const gstBlock = extractXmlBlock(businessEntity, "goodsAndServicesTax");
    const gstEffectiveFrom = gstBlock
      ? extractXmlValue(gstBlock, "effectiveFrom")
      : null;
    const gstEffectiveTo = gstBlock
      ? extractXmlValue(gstBlock, "effectiveTo")
      : null;

    // Determine GST status from dates
    let gstStatus: string | null = null;
    if (gstBlock) {
      if (!gstEffectiveTo || gstEffectiveTo === "0001-01-01") {
        gstStatus = "Active";
      } else {
        gstStatus = "Cancelled";
      }
    }

    // Location
    const addressBlock = extractXmlBlock(
      businessEntity,
      "mainBusinessPhysicalAddress",
    );
    const locationState = addressBlock
      ? extractXmlValue(addressBlock, "stateCode")
      : null;
    const locationPostcode = addressBlock
      ? extractXmlValue(addressBlock, "postcode")
      : null;

    // Business names
    const businessNameBlocks = businessEntity.match(
      /<businessName>[\s\S]*?<\/businessName>/gi,
    );
    const businessNames: string[] = [];
    if (businessNameBlocks) {
      for (const block of businessNameBlocks) {
        const name = extractXmlValue(block, "organisationName");
        if (name) businessNames.push(name);
      }
    }

    const result: AbnLookupResult = {
      abn: identifierValue ?? abn,
      entityName: entityName ?? "Unknown Entity",
      entityType: entityTypeDesc ?? "Unknown",
      abnStatus: identifierStatus ?? entityStatusCode ?? "Unknown",
      abnStatusFromDate: statusEffectiveFrom ?? null,
      gstStatus,
      gstStatusFromDate: gstEffectiveFrom ?? null,
      businessNames,
      locationState,
      locationPostcode,
      rawResponse: responseText,
    };

    return { success: true, data: result };
  } catch (err) {
    logError("ABN Lookup parse error:", err);
    return {
      success: false,
      error: "Failed to parse ABN Lookup response. Please try again.",
      code: "PARSE_ERROR",
    };
  }
}

// ─── Status Determination ────────────────────────────────────────

/**
 * Determine the appropriate lookup status based on the ABN Lookup result.
 *
 * Returns one of the ContractorOnboarding ABN lookup statuses:
 *   ACTIVE_MATCHED, INACTIVE_REVIEW, DETAILS_REVIEW
 */
export function determineAbnLookupStatus(result: AbnLookupResult): string {
  const status = result.abnStatus?.toLowerCase();

  if (status === "active") return "ACTIVE_MATCHED";
  if (status === "cancelled") return "INACTIVE_REVIEW";
  return "DETAILS_REVIEW";
}
