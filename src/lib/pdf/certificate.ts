/**
 * A certificate (NSW s 184, Queensland body corporate certificate) as a PDF,
 * laid out by StrataVerze from the approved form's items.
 *
 * The layout is versioned. An issued certificate records the layout it was
 * issued with (issued_content.layout) and is always drawn with it. A layout
 * is NEVER changed once added: a change to how certificates are laid out is
 * a new layout (2, 3, ...), made the current one for drafts and new issues.
 * Layout 1 holds its own words (the labels, the operative sentence, the
 * draft box, the execution title, the layout line, the PDF title, the plan
 * line and the footer note) and its own date format, so nothing it draws
 * comes from code shared with other documents. The page frame (the header,
 * the "Prepared with StrataVerze" footer, fonts and spacing) is the shared
 * renderer's: the SHA-256 recorded at issue shows if that ever changes.
 */
import { renderPdf, type PdfBlock, type PdfInput } from "./document";

export interface CertificateDocument {
  schemeName: string;
  planNumber: string | null;
  /** The building's name for its plan (`rules.TERMINOLOGY.planLabel`). */
  planLabel: string;
  /** How the key values name the plan number (`rules.CERTIFICATE.planRowLabel`). */
  planRowLabel: string;
  title: string;
  section: string;
  number: number;
  draft: boolean;
  certificateDate: string | null;
  lotNumber: string;
  requester: { type: string; name: string; address: string };
  authorisedBy: { type: string; name: string; address: string } | null;
  ownersCorporation: string;
  items: Array<{ no: string; title: string; text: string }>;
  execution: string;
  /** The execution box's lines after `execution` (`rules.CERTIFICATE.executionLines`). */
  executionLines: readonly string[];
  conclusiveNote: string;
  form: string;
  /** What the layout follows (`rules.CERTIFICATE.follows`). */
  follows: string;
  preparedOn: string;
}

interface CertificateLayout {
  blocks: (d: CertificateDocument) => PdfBlock[];
  pdf: (d: CertificateDocument) => PdfInput;
}

// ─── Layout 1 (31 Oct 2026). NEVER CHANGE: issued certificates are drawn with it. ───

const LAYOUT_1_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-10-27" as "27 October 2026". */
function layout1Date(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${LAYOUT_1_MONTHS[m - 1]} ${y}`;
}

function layout1Blocks(d: CertificateDocument): PdfBlock[] {
  const blocks: PdfBlock[] = [{ kind: "heading", text: `${d.title} (${d.section})` }];
  if (d.draft) blocks.push({ kind: "box", tone: "warning", title: "Draft", lines: ["This is a draft. It is not a certificate until it is issued."] });
  blocks.push(
    {
      kind: "keyValues",
      rows: [
        ["Certificate number", String(d.number)],
        ["Date of certificate", d.certificateDate ? layout1Date(d.certificateDate) : "Not yet issued"],
        ["Lot", d.lotNumber],
        [d.planRowLabel, d.planNumber ?? ""],
        ["Requested by", `${d.requester.name} (${d.requester.type}), ${d.requester.address}`],
        ...(d.authorisedBy ? ([["Authorised by", `${d.authorisedBy.name} (${d.authorisedBy.type}), ${d.authorisedBy.address}`]] as [string, string][]) : []),
      ],
    },
    { kind: "text", text: `The ${d.ownersCorporation} certifies the following for the lot.` },
  );
  for (const i of d.items) {
    blocks.push({ kind: "heading", level: 2, text: `${i.no}. ${i.title}` });
    for (const line of i.text.split(/\n+/).filter(Boolean)) blocks.push({ kind: "text", text: line });
  }
  blocks.push(
    { kind: "spacer" },
    { kind: "box", title: "Execution", lines: [d.execution, ...d.executionLines] },
    { kind: "text", text: d.conclusiveNote, muted: true, size: 8 },
    { kind: "text", text: `Laid out by StrataVerze following ${d.follows}.`, muted: true, size: 8 },
  );
  return blocks;
}

const LAYOUT_1: CertificateLayout = {
  blocks: layout1Blocks,
  pdf: (d) => ({
    title: `${d.title} ${d.number}${d.draft ? " (draft)" : ""}`,
    schemeName: d.schemeName,
    schemeLine: d.planNumber ? `${d.planLabel} ${d.planNumber}` : null,
    blocks: layout1Blocks(d),
    footerNote: `Certificate ${d.number}`,
    generatedAt: new Date(`${d.preparedOn}T00:00:00Z`),
  }),
};

// ─── The layouts ───

const LAYOUTS: Readonly<Record<number, CertificateLayout>> = { 1: LAYOUT_1 };

/** The layout drafts are drawn with and new certificates are issued with. */
export const CURRENT_CERTIFICATE_LAYOUT = 1;

export class UnknownCertificateLayoutError extends Error {
  constructor(layout: unknown) {
    super(`Certificate layout ${String(layout)} is not known to StrataVerze.`);
    this.name = "UnknownCertificateLayoutError";
  }
}

function layoutOf(layout: number): CertificateLayout {
  const l = Object.prototype.hasOwnProperty.call(LAYOUTS, layout) ? LAYOUTS[layout] : undefined;
  if (!l) throw new UnknownCertificateLayoutError(layout);
  return l;
}

export function isCertificateLayout(layout: unknown): layout is number {
  return typeof layout === "number" && Object.prototype.hasOwnProperty.call(LAYOUTS, layout);
}

/** The certificate's blocks in a layout (the current one by default). */
export function certificateBlocks(d: CertificateDocument, layout: number = CURRENT_CERTIFICATE_LAYOUT): PdfBlock[] {
  return layoutOf(layout).blocks(d);
}

/**
 * The certificate as a PDF in a layout (the current one by default). An
 * issued certificate passes `requireEmbeddedFonts`: it is refused
 * (PdfFontsUnavailableError) rather than drawn in a substitute font.
 */
export async function renderCertificatePdf(d: CertificateDocument, options: { layout?: number; requireEmbeddedFonts?: boolean } = {}): Promise<Uint8Array> {
  return renderPdf({ ...layoutOf(options.layout ?? CURRENT_CERTIFICATE_LAYOUT).pdf(d), requireEmbeddedFonts: options.requireEmbeddedFonts });
}
