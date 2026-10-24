/**
 * PDF text with its layout kept (onboarding, 24 Oct).
 *
 * A PDF stores text in whatever order its producer wrote it, which is often
 * not reading order. Urbanise Strata, for example, writes every label on a
 * page first and every value at the end, so reading the text in stored order
 * separates "Registered Lot Owner:" from the owner's name by 31 lines. That
 * is what broke the strata roll reader for SP 99999.
 *
 * This rebuilds each page as lines from the text's positions: items on the
 * same baseline form a line, read left to right, and a wide gap between
 * items starts a new cell. A line's text joins its cells with three spaces,
 * so a label and its value, or the columns of a table, stay apart and in
 * order.
 */

export interface LayoutCell {
  /** Left edge, in PDF points from the left of the page. */
  x: number;
  text: string;
}

export interface LayoutLine {
  /** Page number, from 1. */
  page: number;
  /** Baseline, in PDF points from the bottom of the page. */
  y: number;
  cells: LayoutCell[];
  /** The cells joined by three spaces. */
  text: string;
}

export const CELL_SEPARATOR = "   ";

interface Item {
  str: string;
  x: number;
  y: number;
  width: number;
  size: number;
}

/** Group a page's text items into lines and cells. Pure, so it can be tested without a PDF. */
export function layoutLines(page: number, items: readonly Item[]): LayoutLine[] {
  const visible = items.filter((i) => i.str.trim() !== "");
  const sorted = [...visible].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; size: number; items: Item[] }[] = [];
  for (const item of sorted) {
    const last = lines.at(-1);
    const tolerance = Math.max(2, Math.min(item.size, last?.size ?? item.size) * 0.4);
    if (last && Math.abs(last.y - item.y) <= tolerance) last.items.push(item);
    else lines.push({ y: item.y, size: item.size, items: [item] });
  }
  return lines.map((line) => {
    const row = [...line.items].sort((a, b) => a.x - b.x);
    const cells: LayoutCell[] = [];
    let end = -Infinity;
    for (const item of row) {
      const gap = item.x - end;
      const current = cells.at(-1);
      // A gap wider than about half a character's height starts a new cell.
      if (current && gap < Math.max(4, item.size * 0.6)) {
        current.text += gap > item.size * 0.15 && !current.text.endsWith(" ") && !item.str.startsWith(" ") ? ` ${item.str}` : item.str;
      } else {
        cells.push({ x: item.x, text: item.str });
      }
      end = Math.max(end, item.x + item.width);
    }
    const clean = cells.map((c) => ({ x: Math.round(c.x * 10) / 10, text: c.text.replace(/\s+/g, " ").trim() })).filter((c) => c.text);
    return { page, y: Math.round(line.y * 10) / 10, cells: clean, text: clean.map((c) => c.text).join(CELL_SEPARATOR) };
  });
}

/** Every page of a PDF as layout lines, top to bottom. */
export async function readLayoutLines(data: Uint8Array): Promise<{ pages: number; lines: LayoutLine[] }> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(data);
  const lines: LayoutLine[] = [];
  try {
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const items: Item[] = [];
      for (const raw of content.items as unknown[]) {
        const i = raw as { str?: unknown; transform?: unknown; width?: unknown; height?: unknown };
        if (typeof i.str !== "string" || !Array.isArray(i.transform)) continue;
        const t = i.transform as number[];
        items.push({
          str: i.str,
          x: Number(t[4]) || 0,
          y: Number(t[5]) || 0,
          width: Number(i.width) || 0,
          size: Math.abs(Number(t[3]) || Number(i.height) || 10),
        });
      }
      lines.push(...layoutLines(p, items));
    }
    return { pages: pdf.numPages, lines };
  } finally {
    await pdf.cleanup().catch(() => {});
  }
}
