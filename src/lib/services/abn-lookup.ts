// ─── ABN Lookup Integration ────────────────────────────────────
// Backend-only service for the Australian Business Register (ABR)
// XML search API. Never expose the authentication GUID in browser code.
// Note: No "use server" directive here. This module is imported by
// server actions in contractor-onboarding.ts which already has it.

const ABR_ENDPOINT =
  "https://abr.business.gov.au/abrxmlsearch/AbrXmlSearch.asmx/SearchByABNv202001";

// ─── Helpers ───────────────────────────────────────────────────

/** Strip spaces, dashes and non-digit characters from an ABN string. */
export function normaliseAbn(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}

/** Validate ABN format and checksum. Returns null if valid, error string if not. */
export function validateAbnFormat(abn: string): string | null {
  const digits = normaliseAbn(abn);
  if (digits.length !== 11) {
    return "An ABN must be exactly 11 digits.";
  }

  // ABN checksum algorithm
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const nums = digits.split("").map(Number);
  // Subtract 1 from the first digit
  nums[0] = nums[0] - 1;
  const sum = nums.reduce((acc, d, i) => acc + d * weights[i], 0);

  if (sum % 89 !== 0) {
    return "The ABN checksum is invalid. Please check the number.";
  }

  return null;
}

// ─── XML Parsing Helpers ───────────────────────────────────────

function extractTag(xml: string, tag: string): string | null {
  // Handle both namespaced and non-namespaced tags
  const patterns = [
    new RegExp(`<(?:[a-zA-Z0-9]+:)?${tag}[^>]*>([^<]*)</(?:[a-zA-Z0-9]+:)?${tag}>`, "i"),
    new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match && match[1].trim()) return match[1].trim();
  }
  return null;
}

function extractAllTags(xml: string, tag: string): string[] {
  const pattern = new RegExp(
    `<(?:[a-zA-Z0-9]+:)?${tag}[^>]*>([^<]*)</(?:[a-zA-Z0-9]+:)?${tag}>`,
    "gi",
  );
  const matches = [...xml.matchAll(pattern)];
  return matches.map((m) => m[1].trim()).filter(Boolean);
}

function extractBlock(xml: string, tag: string): string | null {
  const pattern = new RegExp(
    `<(?:[a-zA-Z0-9]+:)?${tag}[^>]*>([\\s\\S]*?)</(?:[a-zA-Z0-9]+:)?${tag}>`,
    "i",
  );
  const match = xml.match(pattern);
  return match ? match[1] : null;
}

function extractAllBlocks(xml: string, tag: string): string[] {
  const pattern = new RegExp(
    `<(?:[a-zA-Z0-9]+:)?${tag}[^>]*>([\\s\\S]*?)</(?:[a-zA-Z0-9]+:)?${tag}>`,
    "gi",
  );
  return [...xml.matchAll(pattern)].map((m) => m[1]);
}

// ─── Types ─────────────────────────────────────────────────────

export type AbnLookupResult = {
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
};

export type AbnLookupResponse = {
  success: boolean;
  result?: AbnLookupResult;
  error?: string;
  rawXml?: string;
};

// ─── Main Lookup Function ──────────────────────────────────────

export async function lookupAbn(abn: string): Promise<AbnLookupResponse> {
  const normalised = normaliseAbn(abn);

  // Validate format first
  const formatError = validateAbnFormat(normalised);
  if (formatError) {
    return { success: false, error: formatError };
  }

  // Check GUID is configured
  const guid = process.env.ABN_LOOKUP_GUID;
  if (!guid) {
    return {
      success: false,
      error: "ABN Lookup service is not configured. Please contact support.",
    };
  }

  // Call ABR API with timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  let responseText: string;
  try {
    const url = `${ABR_ENDPOINT}?searchString=${normalised}&includeHistoricalDetails=N&authenticationGuid=${guid}`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/xml" },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `ABN Lookup service returned status ${response.status}. Please try again later.`,
      };
    }

    responseText = await response.text();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        success: false,
        error: "ABN Lookup service timed out. Please try again later.",
      };
    }
    return {
      success: false,
      error: "Unable to reach the ABN Lookup service. Please try again later.",
    };
  } finally {
    clearTimeout(timeout);
  }

  // Check for exception / not-found response
  const exceptionBlock = extractBlock(responseText, "exception");
  if (exceptionBlock) {
    const exceptionDesc = extractTag(exceptionBlock, "exceptionDescription");
    if (exceptionDesc) {
      return {
        success: false,
        error: `ABN not found: ${exceptionDesc}`,
        rawXml: responseText,
      };
    }
  }

  // Parse the response
  try {
    const result = parseAbrResponse(responseText, normalised);
    return { success: true, result, rawXml: responseText };
  } catch {
    return {
      success: false,
      error:
        "Unable to parse the ABN Lookup response. The service may have changed its format.",
      rawXml: responseText,
    };
  }
}

// ─── Response Parser ───────────────────────────────────────────

function parseAbrResponse(xml: string, queriedAbn: string): AbnLookupResult {
  // Extract ABN status
  const abnBlock = extractBlock(xml, "ABN");
  const abnValue = abnBlock ? extractTag(abnBlock, "identifierValue") : null;
  const abnStatusRaw = abnBlock
    ? extractTag(abnBlock, "identifierStatus")
    : null;

  // Entity status
  const entityStatusBlock = extractBlock(xml, "entityStatus");
  const abnStatus = entityStatusBlock
    ? extractTag(entityStatusBlock, "entityStatusCode") ?? "Unknown"
    : abnStatusRaw ?? "Unknown";
  const abnStatusFromDate = entityStatusBlock
    ? extractTag(entityStatusBlock, "effectiveFrom")
    : null;

  // Entity name — try organisation first, then individual
  let entityName = "";
  const mainNameBlock = extractBlock(xml, "mainName");
  if (mainNameBlock) {
    entityName = extractTag(mainNameBlock, "organisationName") ?? "";
  }
  if (!entityName) {
    const legalNameBlock = extractBlock(xml, "legalName");
    if (legalNameBlock) {
      const given = extractTag(legalNameBlock, "givenName") ?? "";
      const family = extractTag(legalNameBlock, "familyName") ?? "";
      entityName = [given, family].filter(Boolean).join(" ");
    }
  }

  // Entity type
  const entityTypeBlock = extractBlock(xml, "entityType");
  const entityType = entityTypeBlock
    ? extractTag(entityTypeBlock, "entityDescription") ?? "Unknown"
    : "Unknown";

  // GST registration
  const gstBlock = extractBlock(xml, "goodsAndServicesTax");
  const gstStatusFromDate = gstBlock
    ? extractTag(gstBlock, "effectiveFrom")
    : null;
  const gstEffectiveTo = gstBlock
    ? extractTag(gstBlock, "effectiveTo")
    : null;
  // If effectiveTo is "0001-01-01" or empty, GST is current
  const gstIsActive =
    gstStatusFromDate &&
    (!gstEffectiveTo ||
      gstEffectiveTo === "0001-01-01" ||
      gstEffectiveTo === "");
  const gstStatus = gstBlock
    ? gstIsActive
      ? "Active"
      : "Inactive"
    : null;

  // Business names (trading names)
  const bnBlocks = extractAllBlocks(xml, "businessName");
  const businessNames = bnBlocks
    .map((b) => extractTag(b, "organisationName"))
    .filter((n): n is string => n !== null);

  // Main business location
  const addressBlock = extractBlock(xml, "mainBusinessPhysicalAddress");
  const locationState = addressBlock
    ? extractTag(addressBlock, "stateCode")
    : null;
  const locationPostcode = addressBlock
    ? extractTag(addressBlock, "postcode")
    : null;

  return {
    abn: abnValue ?? queriedAbn,
    entityName,
    entityType,
    abnStatus,
    abnStatusFromDate,
    gstStatus,
    gstStatusFromDate,
    businessNames,
    locationState,
    locationPostcode,
  };
}
