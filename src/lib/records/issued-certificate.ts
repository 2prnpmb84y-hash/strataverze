/**
 * What a certificate's PDF reads (NSW s 184, the Queensland body corporate
 * certificate), and an issued certificate kept as it read on the day it was
 * issued (sale_certificates.issued_content, migration 20261126), server side.
 *
 * A draft is laid out from the building's current pack and details. When a
 * certificate is issued, the same document is kept on its row, in the
 * transaction that issues it, and its PDF is laid out from that alone ever
 * after, in the layout it was issued with: a later pack change (wording,
 * labels), building change (name, plan number, lot number) or layout change
 * never alters a certificate given to a buyer. The SHA-256 of the PDF drawn
 * when it was kept is recorded with it, so a change in the shared PDF
 * renderer shows as a mismatch rather than going unseen. The wording comes
 * from the pack in src/config; nothing here holds any.
 */
import { createHash } from "node:crypto";
import { needRule, type StatutoryRules } from "@/config/statutory";
import { formatLotLabel } from "@/lib/format";
import { CURRENT_CERTIFICATE_LAYOUT, isCertificateLayout, renderCertificatePdf, type CertificateDocument } from "@/lib/pdf/certificate";
import { PdfFontsUnavailableError } from "@/lib/pdf/document";
import type { CertificateItem } from "./certificate-draft";

const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);

/** The certificate row's fields the PDF reads. */
export interface CertificateRow {
  number: number;
  status: string;
  certificateDate: unknown;
  requesterType: string;
  requesterName: string;
  requesterAddress: string;
  authorisedByType: string | null;
  authorisedByName: string | null;
  authorisedByAddress: string | null;
  items: unknown;
}

/**
 * The certificate as its PDF reads it from the building's pack (`rules`) and
 * details today: a draft, or an issued certificate that has no issued
 * content (issued before migration 20261126).
 */
export function certificateDocument(input: {
  cert: CertificateRow;
  rules: StatutoryRules;
  scheme: { name: unknown; planNumber?: unknown } | null;
  lot: { lotNumber: unknown } | null;
  today: string;
}): CertificateDocument {
  const { cert, rules, scheme, lot, today } = input;
  const c = needRule(rules, "CERTIFICATE");
  const types = c.requesterTypes as Readonly<Record<string, string>>;
  return {
    schemeName: String(scheme?.name ?? ""),
    planNumber: scheme?.planNumber ? String(scheme.planNumber) : null,
    planLabel: rules.TERMINOLOGY.planLabel,
    planRowLabel: c.planRowLabel,
    title: c.title,
    section: c.section,
    number: cert.number,
    draft: cert.status !== "ISSUED",
    certificateDate: cert.certificateDate ? day(cert.certificateDate) : null,
    lotNumber: formatLotLabel(String(lot?.lotNumber ?? "")),
    requester: { type: types[cert.requesterType] ?? cert.requesterType, name: cert.requesterName, address: cert.requesterAddress },
    authorisedBy: cert.authorisedByType ? { type: types[cert.authorisedByType] ?? cert.authorisedByType, name: String(cert.authorisedByName ?? ""), address: String(cert.authorisedByAddress ?? "") } : null,
    ownersCorporation: rules.TERMINOLOGY.ownersCorporation,
    items: cert.items as CertificateItem[],
    execution: c.execution,
    executionLines: c.executionLines,
    conclusiveNote: c.conclusiveNote,
    form: c.form,
    follows: c.follows,
    preparedOn: cert.certificateDate ? day(cert.certificateDate) : today,
  };
}

/** The issued certificate's document as kept: everything the PDF reads but the draft mark. */
export type IssuedDocument = Omit<CertificateDocument, "draft">;

/** What sale_certificates.issued_content holds. */
export interface IssuedCertificateContent {
  version: 1;
  /** The certificate layout it is drawn with (src/lib/pdf/certificate.ts); a layout never changes once added. */
  layout: number;
  /**
   * ISSUE: kept by the transaction that issued it, so it is what was issued.
   * BACKFILL: kept later for a certificate issued before migration 20261126,
   * from the pack and the building as they were then (`keptOn`, `keptUnder`).
   */
  source: "ISSUE" | "BACKFILL";
  /** The rule pack the certificate was issued under (its rule_pack), for example "AU-NSW 2026.10.16". */
  rulePack: string | null;
  /** BACKFILL only: the day it was kept and the pack its wording came from. */
  keptOn?: string;
  keptUnder?: string;
  /** The PDF's file name before the number, for example "information-certificate". */
  fileStem: string;
  /** The SHA-256 (hex) of the PDF drawn from this content when it was kept. */
  pdfSha256: string;
  document: IssuedDocument;
}

/** How a building's certificate PDF is named, before its number. */
export function certificateFileStem(rules: Pick<StatutoryRules, "FEATURES">): string {
  return rules.FEATURES.bodyCorporateCertificate ? "body-corporate-certificate" : "information-certificate";
}

export const sha256Hex = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

type Kept = { rulePack: string | null; fileStem: string } & ({ source: "ISSUE" } | { source: "BACKFILL"; keptOn: string; keptUnder: string });

/**
 * The content to keep for an issued certificate: its document (without the
 * draft mark) in the current layout, and the SHA-256 of the PDF drawn from
 * it. The PDF must be drawn in its own fonts (PdfFontsUnavailableError
 * otherwise), so what is recorded is the certificate as issued.
 */
export async function keepCertificate(document: CertificateDocument, kept: Kept): Promise<IssuedCertificateContent> {
  if (document.draft || !document.certificateDate) throw new Error("Only an issued certificate is kept as issued.");
  const { draft: _draft, ...rest } = document;
  const content: Omit<IssuedCertificateContent, "pdfSha256"> = {
    version: 1,
    layout: CURRENT_CERTIFICATE_LAYOUT,
    ...kept,
    document: { ...rest, executionLines: [...rest.executionLines], items: rest.items.map((i) => ({ no: i.no, title: i.title, text: i.text })) },
  };
  const bytes = await renderCertificatePdf({ ...content.document, draft: false }, { layout: content.layout, requireEmbeddedFonts: true });
  return { ...content, pdfSha256: sha256Hex(bytes) };
}

export class IssuedContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IssuedContentError";
  }
}

const isText = (v: unknown): v is string => typeof v === "string";
const isParty = (v: unknown) => !!v && typeof v === "object" && ["type", "name", "address"].every((k) => isText((v as Record<string, unknown>)[k]));

/**
 * What an issued certificate keeps, or null when it keeps none (issued before
 * migration 20261126). Content that is there but not in this shape (or in a
 * layout StrataVerze does not know) is refused rather than laid out from
 * anything else, so an issued certificate is never silently shown with other
 * wording.
 */
export function keptContent(value: unknown): IssuedCertificateContent | null {
  if (value === null || value === undefined) return null;
  const v = (typeof value === "string" ? JSON.parse(value) : value) as Partial<IssuedCertificateContent> | null;
  const d = v?.document as Partial<IssuedDocument> | undefined;
  const ok =
    v?.version === 1 &&
    isCertificateLayout(v.layout) &&
    (v.source === "ISSUE" || (v.source === "BACKFILL" && isText(v.keptOn) && isText(v.keptUnder))) &&
    (v.rulePack === null || isText(v.rulePack)) &&
    isText(v.fileStem) &&
    /^[a-z-]+$/.test(v.fileStem) &&
    isText(v.pdfSha256) &&
    /^[0-9a-f]{64}$/.test(v.pdfSha256) &&
    !!d &&
    ["schemeName", "planLabel", "planRowLabel", "title", "section", "certificateDate", "lotNumber", "ownersCorporation", "execution", "conclusiveNote", "form", "follows", "preparedOn"].every((k) => isText((d as Record<string, unknown>)[k])) &&
    (d.planNumber === null || isText(d.planNumber)) &&
    typeof d.number === "number" &&
    isParty(d.requester) &&
    (d.authorisedBy === null || isParty(d.authorisedBy)) &&
    Array.isArray(d.executionLines) &&
    d.executionLines.every(isText) &&
    Array.isArray(d.items) &&
    d.items.every((i) => !!i && isText(i.no) && isText(i.title) && isText(i.text));
  if (!ok) throw new IssuedContentError("The certificate's issued content cannot be read.");
  return v as IssuedCertificateContent;
}

/**
 * An issued certificate's PDF, drawn from what it kept in the layout it was
 * issued with and in its own fonts (PdfFontsUnavailableError otherwise), and
 * whether it is the same file as the one issued (its SHA-256).
 */
export async function renderKeptCertificate(content: IssuedCertificateContent): Promise<{ bytes: Uint8Array; sha256: string; matches: boolean }> {
  const bytes = await renderCertificatePdf({ ...content.document, draft: false }, { layout: content.layout, requireEmbeddedFonts: true });
  const sha256 = sha256Hex(bytes);
  return { bytes, sha256, matches: sha256 === content.pdfSha256 };
}

/** What the certificate page says about an issued certificate's PDF. */
export type KeptPdfCheck = "MATCHES" | "MISMATCH" | "FONTS_UNAVAILABLE";

export async function checkKeptCertificate(content: IssuedCertificateContent): Promise<KeptPdfCheck> {
  try {
    return (await renderKeptCertificate(content)).matches ? "MATCHES" : "MISMATCH";
  } catch (err) {
    if (err instanceof PdfFontsUnavailableError) return "FONTS_UNAVAILABLE";
    throw err;
  }
}
