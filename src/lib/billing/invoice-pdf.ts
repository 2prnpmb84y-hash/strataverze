/**
 * PDF of a StrataVerze invoice to a scheme. Rendered on request from the
 * stored invoice and its fee events, so the PDF always matches the ledger.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { PLATFORM_TIME_ZONE } from "@/lib/jurisdiction/time-zone";
import { bodyCorporateName, type Terms } from "@/lib/jurisdiction/wording";
import { formatAud } from "./money";
import { STRATAVERZE_SUPPLIER, formatAbn } from "./strataverze-supplier";

export interface InvoicePdfInput {
  invoiceNumber: string;
  issuedAt: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  scheme: { name: string; planNumber: string | null; address: string | null; suburb: string | null; state: string | null; postcode: string | null };
  lines: { description: string; exGstCents: number; gstCents: number }[];
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
}

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 50;
const INK = rgb(0.1, 0.1, 0.18);
const MUTED = rgb(0.39, 0.45, 0.55);
const LINE = rgb(0.85, 0.87, 0.9);

/** Standard PDF fonts only cover Windows-1252, so swap anything else out. */
function safe(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E -ÿ]/g, "");
}

const day = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: PLATFORM_TIME_ZONE,
  });

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = safe(text).split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && current) {
      lines.push(current);
      current = w;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** `terms` is the building's TERMINOLOGY, for the name of the owners corporation billed. */
export async function renderInvoicePdf(input: InvoicePdfInput, terms: Pick<Terms, "bodyCorporateName" | "ownersCorporation">): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`StrataVerze invoice ${input.invoiceNumber}`);
  doc.setAuthor("StrataVerze");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = doc.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN;

  const text = (t: string, x: number, size = 10, font = regular, color = INK) => {
    page.drawText(safe(t), { x, y, size, font, color });
  };
  const right = (t: string, xRight: number, size = 10, font = regular, color = INK) => {
    const s = safe(t);
    page.drawText(s, { x: xRight - font.widthOfTextAtSize(s, size), y, size, font, color });
  };
  const rule = () => {
    page.drawLine({ start: { x: MARGIN, y }, end: { x: A4.width - MARGIN, y }, thickness: 0.5, color: LINE });
  };

  // Header
  // A tax invoice needs the supplier's ABN and GST registration.
  const hasAbn = !!STRATAVERZE_SUPPLIER.abn;
  const isTaxInvoice = hasAbn && STRATAVERZE_SUPPLIER.gstRegistered;
  text(isTaxInvoice ? "Tax invoice" : "Invoice", MARGIN, 20, bold);
  right(input.invoiceNumber, A4.width - MARGIN, 12, bold);
  y -= 22;
  text(STRATAVERZE_SUPPLIER.companyName, MARGIN, 11, bold);
  right(`Issued ${day(input.issuedAt)}`, A4.width - MARGIN, 10, regular, MUTED);
  y -= 14;
  text(hasAbn ? `ABN ${formatAbn(STRATAVERZE_SUPPLIER.abn!)}` : "ABN to be confirmed", MARGIN, 9, regular, MUTED);
  right("Due on issue", A4.width - MARGIN, 10, regular, MUTED);
  y -= 30;

  // Bill to
  text("Bill to", MARGIN, 9, bold, MUTED);
  y -= 14;
  text(bodyCorporateName(terms, input.scheme), MARGIN, 11, bold);
  y -= 14;
  text(input.scheme.name, MARGIN, 10);
  const address = [input.scheme.address, [input.scheme.suburb, input.scheme.state, input.scheme.postcode].filter(Boolean).join(" ")]
    .filter((p) => p && String(p).trim())
    .join(", ");
  if (address) {
    y -= 13;
    text(address, MARGIN, 10, regular, MUTED);
  }
  y -= 26;
  text(`Subscription period ${day(input.periodStart)} to ${day(input.periodEnd)}. Fees are for actions before the period began.`, MARGIN, 9, regular, MUTED);
  y -= 24;

  // Lines
  const colEx = A4.width - MARGIN - 150;
  const colGst = A4.width - MARGIN - 75;
  const colTotal = A4.width - MARGIN;
  const descWidth = colEx - 80 - MARGIN;
  const header = () => {
    text("Description", MARGIN, 9, bold, MUTED);
    right("Ex GST", colEx, 9, bold, MUTED);
    right("GST", colGst, 9, bold, MUTED);
    right("Total", colTotal, 9, bold, MUTED);
    y -= 8;
    rule();
    y -= 14;
  };
  header();

  for (const line of input.lines) {
    const wrapped = wrap(line.description, regular, 10, descWidth);
    const needed = wrapped.length * 13 + 6;
    if (y - needed < MARGIN + 120) {
      page = doc.addPage([A4.width, A4.height]);
      y = A4.height - MARGIN;
      header();
    }
    right(formatAud(line.exGstCents), colEx);
    right(formatAud(line.gstCents), colGst);
    right(formatAud(line.exGstCents + line.gstCents), colTotal);
    for (const w of wrapped) {
      text(w, MARGIN);
      y -= 13;
    }
    y -= 6;
  }

  // Totals
  rule();
  y -= 18;
  text("Subtotal (ex GST)", colEx - 120, 10);
  right(formatAud(input.subtotalCents), colTotal);
  y -= 15;
  text("GST", colEx - 120, 10);
  right(formatAud(input.gstCents), colTotal);
  y -= 17;
  text("Total (incl. GST)", colEx - 120, 12, bold);
  right(formatAud(input.totalCents), colTotal, 12, bold);
  y -= 36;

  const notes = [
    "Every StrataVerze charge is a flat amount from the published fee schedule. StrataVerze never charges a percentage.",
    "This invoice is entered in the scheme's accounts as a supplier invoice for approval and payment in the usual way.",
  ];
  if (!hasAbn) notes.push("This is not a tax invoice until StrataVerze's ABN is shown.");
  else if (!STRATAVERZE_SUPPLIER.gstRegistered) notes.push("StrataVerze Pty Ltd is not registered for GST, so this is not a tax invoice.");
  for (const n of notes) {
    for (const w of wrap(n, regular, 8.5, A4.width - MARGIN * 2)) {
      text(w, MARGIN, 8.5, regular, MUTED);
      y -= 11;
    }
    y -= 3;
  }

  return doc.save();
}
