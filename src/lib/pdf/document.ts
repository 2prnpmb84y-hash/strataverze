import { logError } from "@/lib/log";
import { PLATFORM_TIME_ZONE } from "@/lib/jurisdiction/time-zone";
/**
 * PDF layout for StrataVerze documents (server side, no browser). Pages are
 * A4, set in Inter (the brand typeface for legal documents) with the scheme
 * name in the header and a StrataVerze footer with page numbers. Documents
 * are described as a list of blocks so each document only supplies content.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

export type Align = "left" | "right";

export type PdfBlock =
  | { kind: "heading"; text: string; level?: 1 | 2 }
  | { kind: "text"; text: string; muted?: boolean; bold?: boolean; size?: number }
  | { kind: "keyValues"; rows: [string, string][] }
  | { kind: "table"; columns: { header: string; width: number; align?: Align }[]; rows: string[][]; totalRow?: string[] }
  | { kind: "box"; title?: string; lines: string[]; tone?: "note" | "warning" }
  | { kind: "spacer"; height?: number }
  | { kind: "pageBreak" };

export interface PdfInput {
  /** Shown top right on every page, and as the PDF title. */
  title: string;
  /** Shown top left on every page. */
  schemeName: string;
  /** Under the scheme name, for example "Strata Plan 12345". */
  schemeLine?: string | null;
  blocks: PdfBlock[];
  /** Extra text in the footer, for example a document reference. */
  footerNote?: string;
  /**
   * The date the document is prepared, shown in the footer and stored as the
   * PDF's dates. Defaults to today. Only the day is used, so the same
   * document prepared twice on a day is the same file (same hash).
   */
  generatedAt?: Date;
}

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const HEADER = 56;
const FOOTER = 40;
const INK = rgb(0x1a / 255, 0x20 / 255, 0x2c / 255);
const MUTED = rgb(0x64 / 255, 0x74 / 255, 0x8b / 255);
const LINE = rgb(0.85, 0.87, 0.9);
const BRAND = rgb(0x00 / 255, 0xd4 / 255, 0xbf / 255);
const NOTE_BG = rgb(0xcf / 255, 0xf4 / 255, 0xee / 255);
const WARN_BG = rgb(1, 0.96, 0.86);

interface Fonts {
  regular: PDFFont;
  semibold: PDFFont;
  bold: PDFFont;
  /** Standard fonts only cover Windows-1252, so text must be simplified for them. */
  standard: boolean;
  /** Code points the embedded font can draw. */
  charset: Set<number> | null;
}

let cachedFontBytes: { regular: Uint8Array; semibold: Uint8Array; bold: Uint8Array } | null | undefined;

async function fontBytes() {
  if (cachedFontBytes !== undefined) return cachedFontBytes;
  try {
    const dir = path.join(process.cwd(), "src", "lib", "pdf", "fonts");
    const [regular, semibold, bold] = await Promise.all([
      readFile(path.join(dir, "Inter-Regular.ttf")),
      readFile(path.join(dir, "Inter-SemiBold.ttf")),
      readFile(path.join(dir, "Inter-Bold.ttf")),
    ]);
    // Plain Uint8Arrays: pdf-lib does not accept a Buffer from another realm.
    const u8 = (b: Buffer) => new Uint8Array(b.buffer, b.byteOffset, b.byteLength).slice();
    cachedFontBytes = { regular: u8(regular), semibold: u8(semibold), bold: u8(bold) };
  } catch (err) {
    logError("[pdf] Inter fonts not found, using Helvetica:", err);
    cachedFontBytes = null;
  }
  return cachedFontBytes;
}

async function embedFonts(doc: PDFDocument): Promise<Fonts> {
  const bytes = await fontBytes();
  if (bytes) {
    doc.registerFontkit(fontkit);
    const [regular, semibold, bold] = await Promise.all([
      // The files are already cut down to Latin characters (about 30 KB each).
      // pdf-lib's own subsetting drops glyphs from Inter, so embed them whole.
      doc.embedFont(bytes.regular, { subset: false }),
      doc.embedFont(bytes.semibold, { subset: false }),
      doc.embedFont(bytes.bold, { subset: false }),
    ]);
    return { regular, semibold, bold, standard: false, charset: new Set(regular.getCharacterSet()) };
  }
  const [regular, bold] = await Promise.all([doc.embedFont(StandardFonts.Helvetica), doc.embedFont(StandardFonts.HelveticaBold)]);
  return { regular, semibold: bold, bold, standard: true, charset: null };
}

/** Text the chosen font can draw: characters it lacks are replaced or dropped. */
function clean(text: string, fonts: Fonts): string {
  const t = text.replace(/\r?\n/g, " ").replace(/\t/g, " ");
  if (fonts.charset) {
    return [...t]
      .map((ch) => {
        const cp = ch.codePointAt(0)!;
        if (fonts.charset!.has(cp)) return ch;
        if (/[‘’]/.test(ch)) return "'";
        if (/[“”]/.test(ch)) return '"';
        if (/[–—]/.test(ch)) return "-";
        return "";
      })
      .join("");
  }
  return t
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

/** Break text into lines that fit `width`. A word longer than a line is split. */
export function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const fits = (t: string) => font.widthOfTextAtSize(t, size) <= width;
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let w = word;
    while (!fits(w)) {
      let cut = w.length - 1;
      while (cut > 1 && !fits(w.slice(0, cut))) cut--;
      if (line) {
        out.push(line);
        line = "";
      }
      out.push(w.slice(0, cut));
      w = w.slice(cut);
    }
    const next = line ? `${line} ${w}` : w;
    if (fits(next)) line = next;
    else {
      out.push(line);
      line = w;
    }
  }
  out.push(line);
  return out;
}

export async function renderPdf(input: PdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(input.title);
  doc.setAuthor("StrataVerze");
  doc.setCreator("StrataVerze");
  doc.setProducer("StrataVerze");
  // The PDF's creation date is the day in StrataVerze's time zone, so a document made twice that day is identical.
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: PLATFORM_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(input.generatedAt ?? new Date());
  const generated = new Date(`${day}T00:00:00Z`);
  doc.setCreationDate(generated);
  doc.setModificationDate(generated);
  const fonts = await embedFonts(doc);
  const contentWidth = A4.width - MARGIN * 2;

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;
  const newPage = () => {
    page = doc.addPage([A4.width, A4.height]);
    pages.push(page);
    y = A4.height - MARGIN - HEADER;
  };
  const ensure = (h: number) => {
    if (y - h < MARGIN + FOOTER) newPage();
  };
  const draw = (text: string, x: number, size: number, font: PDFFont, color = INK) =>
    page.drawText(clean(text, fonts), { x, y, size, font, color });
  const drawRight = (text: string, xRight: number, size: number, font: PDFFont, color = INK) => {
    const t = clean(text, fonts);
    page.drawText(t, { x: xRight - font.widthOfTextAtSize(t, size), y, size, font, color });
  };
  const rule = (color = LINE, thickness = 0.5) =>
    page.drawLine({ start: { x: MARGIN, y }, end: { x: A4.width - MARGIN, y }, thickness, color });

  newPage();
  for (const block of input.blocks) {
    switch (block.kind) {
      case "heading": {
        const size = block.level === 2 ? 11.5 : 15;
        const lines = wrap(clean(block.text, fonts), fonts.bold, size, contentWidth);
        ensure(lines.length * size * 1.35 + 14);
        y -= block.level === 2 ? 8 : 4;
        for (const l of lines) {
          y -= size;
          draw(l, MARGIN, size, block.level === 2 ? fonts.semibold : fonts.bold);
          y -= size * 0.35;
        }
        y -= 6;
        break;
      }
      case "text": {
        const size = block.size ?? 9.5;
        const font = block.bold ? fonts.semibold : fonts.regular;
        for (const l of wrap(clean(block.text, fonts), font, size, contentWidth)) {
          ensure(size * 1.45);
          y -= size;
          draw(l, MARGIN, size, font, block.muted ? MUTED : INK);
          y -= size * 0.45;
        }
        y -= 4;
        break;
      }
      case "keyValues": {
        const labelWidth = contentWidth * 0.34;
        for (const [k, v] of block.rows) {
          const vl = wrap(clean(v, fonts), fonts.regular, 9.5, contentWidth - labelWidth);
          ensure(vl.length * 13 + 2);
          y -= 9.5;
          draw(k, MARGIN, 9.5, fonts.semibold, MUTED);
          vl.forEach((line, i) => {
            if (i > 0) y -= 13;
            draw(line, MARGIN + labelWidth, 9.5, fonts.regular);
          });
          y -= 4.5;
        }
        y -= 6;
        break;
      }
      case "table": {
        const totalW = block.columns.reduce((s, c) => s + c.width, 0);
        const widths = block.columns.map((c) => (c.width / totalW) * contentWidth);
        const xs = widths.map((_, i) => MARGIN + widths.slice(0, i).reduce((s, w) => s + w, 0));
        const header = () => {
          ensure(30);
          y -= 9;
          block.columns.forEach((c, i) =>
            c.align === "right" ? drawRight(c.header, xs[i] + widths[i] - 2, 8.5, fonts.semibold, MUTED) : draw(c.header, xs[i], 8.5, fonts.semibold, MUTED),
          );
          y -= 6;
          rule();
          y -= 2;
        };
        header();
        const row = (cells: string[], font: PDFFont) => {
          const wrapped = cells.map((cell, i) => wrap(clean(cell ?? "", fonts), font, 9, widths[i] - 6));
          const h = Math.max(...wrapped.map((w) => w.length)) * 12 + 4;
          if (y - h < MARGIN + FOOTER) {
            newPage();
            header();
          }
          const top = y;
          wrapped.forEach((lines, i) => {
            y = top;
            lines.forEach((l) => {
              y -= 10.5;
              if (block.columns[i].align === "right") drawRight(l, xs[i] + widths[i] - 2, 9, font);
              else draw(l, xs[i], 9, font);
              y -= 1.5;
            });
          });
          y = top - h;
        };
        for (const r of block.rows) row(r, fonts.regular);
        if (block.totalRow) {
          ensure(18);
          rule(MUTED);
          row(block.totalRow, fonts.semibold);
        }
        y -= 8;
        break;
      }
      case "box": {
        const size = 9;
        const lines = [
          ...(block.title ? [{ t: block.title, bold: true }] : []),
          ...block.lines.flatMap((l) => wrap(clean(l, fonts), fonts.regular, size, contentWidth - 20).map((t) => ({ t, bold: false }))),
        ];
        const h = lines.length * 12.5 + 14;
        ensure(h + 6);
        page.drawRectangle({ x: MARGIN, y: y - h, width: contentWidth, height: h, color: block.tone === "warning" ? WARN_BG : NOTE_BG });
        y -= 8;
        for (const l of lines) {
          y -= size + 1;
          draw(l.t, MARGIN + 10, size, l.bold ? fonts.semibold : fonts.regular);
          y -= 2.5;
        }
        y -= 14;
        break;
      }
      case "spacer":
        y -= block.height ?? 10;
        break;
      case "pageBreak":
        newPage();
        break;
    }
  }

  // Header and footer on every page.
  const stamp = generated.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  pages.forEach((p, i) => {
    page = p;
    y = A4.height - MARGIN;
    p.drawRectangle({ x: 0, y: A4.height - 6, width: A4.width, height: 6, color: BRAND });
    y -= 11;
    draw(input.schemeName, MARGIN, 11, fonts.bold);
    drawRight(input.title, A4.width - MARGIN, 11, fonts.semibold);
    if (input.schemeLine) {
      y -= 14;
      draw(input.schemeLine, MARGIN, 8.5, fonts.regular, MUTED);
    }
    y = A4.height - MARGIN - HEADER + 12;
    rule();
    y = MARGIN - 4;
    rule();
    y -= 12;
    draw(`Prepared with StrataVerze · ${stamp}${input.footerNote ? ` · ${input.footerNote}` : ""}`, MARGIN, 7.5, fonts.regular, MUTED);
    drawRight(`Page ${i + 1} of ${pages.length}`, A4.width - MARGIN, 7.5, fonts.regular, MUTED);
  });

  return doc.save();
}
