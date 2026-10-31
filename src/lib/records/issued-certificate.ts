/**
 * What a certificate's PDF reads (NSW s 184, the Queensland body corporate
 * certificate), and an issued certificate kept as it read on the day it was
 * issued (sale_certificates.issued_content, migration 20261126). Pure.
 *
 * A draft is laid out from the building's current pack and details. When a
 * certificate is issued, the same document is kept on its row, in the
 * transaction that issues it, and its PDF is laid out from that alone ever
 * after: a later pack change (wording, labels) or building change (name,
 * plan number, lot number) never alters a certificate given to a buyer. The
 * wording comes from the pack in src/config; nothing here holds any.
 */
import { needRule, type StatutoryRules } from "@/config/statutory";
import { formatLotLabel } from "@/lib/format";
import type { CertificateDocument } from "@/lib/pdf/certificate";
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
  document: IssuedDocument;
}

/** The content to keep for a certificate: its document, without the draft mark. */
export function issuedCertificateContent(document: CertificateDocument, kept: { rulePack: string | null } & ({ source: "ISSUE" } | { source: "BACKFILL"; keptOn: string; keptUnder: string })): IssuedCertificateContent {
  if (document.draft || !document.certificateDate) throw new Error("Only an issued certificate is kept as issued.");
  const { draft: _draft, ...rest } = document;
  return { version: 1, ...kept, document: { ...rest, executionLines: [...rest.executionLines], items: rest.items.map((i) => ({ no: i.no, title: i.title, text: i.text })) } };
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
 * The document an issued certificate keeps, or null when it keeps none
 * (issued before migration 20261126). Content that is there but not in this
 * shape is refused rather than laid out from anything else, so an issued
 * certificate is never silently shown with other wording.
 */
export function keptDocument(value: unknown): IssuedDocument | null {
  if (value === null || value === undefined) return null;
  const v = (typeof value === "string" ? JSON.parse(value) : value) as Partial<IssuedCertificateContent> | null;
  const d = v?.document as Partial<IssuedDocument> | undefined;
  const ok =
    v?.version === 1 &&
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
  return d as IssuedDocument;
}

/** What an issued certificate's PDF reads: its kept document, or (none kept) the current pack's. */
export function issuedOrCurrentDocument(input: Parameters<typeof certificateDocument>[0] & { cert: CertificateRow & { issuedContent?: unknown } }): { document: CertificateDocument; kept: boolean } {
  const kept = input.cert.status === "ISSUED" ? keptDocument(input.cert.issuedContent) : null;
  return kept ? { document: { ...kept, draft: false }, kept: true } : { document: certificateDocument(input), kept: false };
}
