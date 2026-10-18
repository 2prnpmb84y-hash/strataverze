/**
 * Invoice PDF text extraction and field parsing.
 *
 * Uses pdf-parse for text extraction from uploaded invoices,
 * then applies regex patterns to identify common invoice fields:
 * invoice number, dates, amounts, ABN, supplier name, line items.
 *
 * Falls back to Tesseract OCR via child_process for scanned/image PDFs.
 */

import { execFile } from "child_process";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

// ── Types ────────────────────────────────────────────────────────

export interface ExtractedInvoiceData {
  supplierName: string | null;
  abn: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  subtotal: number | null;
  gstAmount: number | null;
  totalAmount: number | null;
  description: string | null;
  lineItems: ExtractedLineItem[];
  rawText: string;
  confidence: "high" | "medium" | "low";
  extractionMethod: "text" | "ocr";
  warnings: string[];
}

export interface ExtractedLineItem {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
}

// ── Main extraction function ─────────────────────────────────────

/**
 * Extract invoice data from a PDF file buffer.
 * First attempts direct text extraction; if insufficient text is found,
 * falls back to Tesseract OCR.
 */
export async function extractInvoiceFromPdf(
  buffer: Buffer,
): Promise<ExtractedInvoiceData> {
  const warnings: string[] = [];

  // Attempt direct text extraction
  let text = await extractTextFromPdf(buffer);
  let method: "text" | "ocr" = "text";

  // If text extraction yields very little, try OCR
  if (text.trim().length < 50) {
    warnings.push(
      "Direct text extraction yielded minimal content. Attempting OCR.",
    );
    try {
      text = await extractTextViaOcr(buffer);
      method = "ocr";
    } catch {
      warnings.push("OCR extraction failed. Using limited text content.");
    }
  }

  if (text.trim().length < 10) {
    return {
      supplierName: null,
      abn: null,
      invoiceNumber: null,
      invoiceDate: null,
      dueDate: null,
      subtotal: null,
      gstAmount: null,
      totalAmount: null,
      description: null,
      lineItems: [],
      rawText: text,
      confidence: "low",
      extractionMethod: method,
      warnings: [
        ...warnings,
        "Could not extract meaningful text from this PDF. Please enter invoice details manually.",
      ],
    };
  }

  // Parse fields from extracted text
  const result = parseInvoiceText(text);
  result.extractionMethod = method;
  result.warnings = [...warnings, ...result.warnings];

  return result;
}

// ── Text extraction via pdf-parse ────────────────────────────────

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    // Combine all page texts
    const text = result.pages.map((p) => p.text).join("\n");
    return text || "";
  } catch {
    return "";
  }
}

// ── OCR fallback via Tesseract ───────────────────────────────────

async function extractTextViaOcr(buffer: Buffer): Promise<string> {
  const tmpId = randomUUID();
  const tmpDir = "/tmp";
  const pdfPath = join(tmpDir, `invoice-${tmpId}.pdf`);
  const imgPrefix = join(tmpDir, `invoice-${tmpId}`);

  try {
    // Write PDF to temp file
    await writeFile(pdfPath, buffer);

    // Convert PDF to images using pdftoppm
    await execPromise("pdftoppm", [
      "-png",
      "-r",
      "300",
      pdfPath,
      imgPrefix,
    ]);

    // Find generated image files and run Tesseract on each
    const { readdir } = await import("fs/promises");
    const files = await readdir(tmpDir);
    const imgFiles = files
      .filter(
        (f) => f.startsWith(`invoice-${tmpId}`) && f.endsWith(".png"),
      )
      .sort();

    const texts: string[] = [];

    for (const imgFile of imgFiles) {
      const imgPath = join(tmpDir, imgFile);
      try {
        const result = await execPromise("tesseract", [
          imgPath,
          "stdout",
          "-l",
          "eng",
          "--psm",
          "6",
        ]);
        texts.push(result);
      } finally {
        await safeUnlink(imgPath);
      }
    }

    return texts.join("\n");
  } finally {
    await safeUnlink(pdfPath);
  }
}

function execPromise(
  cmd: string,
  args: string[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        reject(
          new Error(
            `${cmd} failed: ${stderr || error.message}`,
          ),
        );
      } else {
        resolve(stdout);
      }
    });
  });
}

async function safeUnlink(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // ignore cleanup errors
  }
}

// ── Invoice text parsing ─────────────────────────────────────────

function parseInvoiceText(text: string): ExtractedInvoiceData {
  const warnings: string[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Extract supplier name (usually near the top, first substantial line)
  const supplierName = extractSupplierName(lines);

  // Extract ABN
  const abn = extractAbn(text);

  // Extract invoice number
  const invoiceNumber = extractInvoiceNumber(text);

  // Extract dates
  const invoiceDate = extractDate(text, [
    /invoice\s*date[:\s]+(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})/i,
    /date\s*of\s*invoice[:\s]+(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})/i,
    /date[:\s]+(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})/i,
    /issued[:\s]+(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})/i,
    /tax\s*invoice.*?(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})/i,
  ]);

  const dueDate = extractDate(text, [
    /due\s*date[:\s]+(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})/i,
    /payment\s*due[:\s]+(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})/i,
    /pay\s*by[:\s]+(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})/i,
    /terms[:\s]+.*?(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})/i,
  ]);

  // Extract amounts
  const amounts = extractAmounts(text);

  // Extract line items
  const lineItems = extractLineItems(lines);

  // Extract description (look for description/re/for fields)
  const description = extractDescription(text);

  // Determine confidence
  let fieldsFound = 0;
  if (supplierName) fieldsFound++;
  if (invoiceNumber) fieldsFound++;
  if (invoiceDate) fieldsFound++;
  if (amounts.totalAmount !== null) fieldsFound++;
  if (abn) fieldsFound++;

  let confidence: "high" | "medium" | "low";
  if (fieldsFound >= 4) confidence = "high";
  else if (fieldsFound >= 2) confidence = "medium";
  else confidence = "low";

  if (confidence === "low") {
    warnings.push(
      "Few fields could be extracted automatically. Please review and complete the details.",
    );
  }

  return {
    supplierName,
    abn,
    invoiceNumber,
    invoiceDate,
    dueDate,
    subtotal: amounts.subtotal,
    gstAmount: amounts.gstAmount,
    totalAmount: amounts.totalAmount,
    description,
    lineItems,
    rawText: text,
    confidence,
    extractionMethod: "text",
    warnings,
  };
}

// ── Field extraction helpers ─────────────────────────────────────

function extractSupplierName(lines: string[]): string | null {
  // Look for company-like text in the first 10 lines
  // Skip common header words like "Tax Invoice", "Invoice", page numbers
  const skipPatterns = [
    /^(tax\s+)?invoice$/i,
    /^page\s+\d/i,
    /^date/i,
    /^abn/i,
    /^\d+$/,
    /^(to|from|bill\s+to|ship\s+to)/i,
  ];

  for (const line of lines.slice(0, 10)) {
    if (line.length < 3 || line.length > 100) continue;
    if (skipPatterns.some((p) => p.test(line))) continue;

    // Check for company indicators
    if (
      /pty\s*ltd|proprietary|limited|inc\.|corporation|group|services|solutions|plumbing|electrical|management|maintenance|cleaning|consulting/i.test(
        line,
      )
    ) {
      return line;
    }
  }

  // Fallback: first substantial line that looks like a name
  for (const line of lines.slice(0, 5)) {
    if (line.length >= 3 && line.length <= 80) {
      if (skipPatterns.some((p) => p.test(line))) continue;
      if (/[a-zA-Z]{2,}/.test(line)) {
        return line;
      }
    }
  }

  return null;
}

function extractAbn(text: string): string | null {
  // Australian Business Number: 11 digits, often formatted with spaces
  const patterns = [
    /abn[:\s]+(\d{2}\s?\d{3}\s?\d{3}\s?\d{3})/i,
    /a\.b\.n\.[:\s]+(\d{2}\s?\d{3}\s?\d{3}\s?\d{3})/i,
    /australian\s+business\s+number[:\s]+(\d{2}\s?\d{3}\s?\d{3}\s?\d{3})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].replace(/\s/g, "");
    }
  }

  return null;
}

function extractInvoiceNumber(text: string): string | null {
  const patterns = [
    /invoice\s*(?:no|number|num|#|ref)[.:\s]+([A-Za-z0-9\-/]+)/i,
    /inv[.:\s]+([A-Za-z0-9\-/]+)/i,
    /reference[:\s]+([A-Za-z0-9\-/]+)/i,
    /invoice[:\s]+([A-Za-z0-9\-/]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const num = match[1].trim();
      // Sanity check: should look like an invoice number
      if (num.length >= 1 && num.length <= 30) {
        return num;
      }
    }
  }

  return null;
}

function extractDate(
  text: string,
  patterns: RegExp[],
): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const dateStr = match[1];
      const parsed = parseAuDate(dateStr);
      if (parsed) return parsed;
    }
  }
  return null;
}

function parseAuDate(value: string): string | null {
  // Try DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const match = value.match(
    /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/,
  );
  if (!match) return null;

  const [, dayStr, monthStr, yearStr] = match;
  let year = Number(yearStr);
  if (year < 100) year += 2000;
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const d = new Date(year, month - 1, day);
  if (isNaN(d.getTime())) return null;

  return d.toISOString().split("T")[0];
}

function extractAmounts(text: string): {
  subtotal: number | null;
  gstAmount: number | null;
  totalAmount: number | null;
} {
  let subtotal: number | null = null;
  let gstAmount: number | null = null;
  let totalAmount: number | null = null;

  // Total amount patterns (most specific first)
  const totalPatterns = [
    /total\s*(?:amount\s*)?(?:inc(?:l(?:uding)?)?\.?\s*gst)?[:\s]*\$?\s*([\d,]+\.?\d*)/i,
    /amount\s*due[:\s]*\$?\s*([\d,]+\.?\d*)/i,
    /balance\s*due[:\s]*\$?\s*([\d,]+\.?\d*)/i,
    /total[:\s]*\$?\s*([\d,]+\.?\d*)/i,
    /grand\s*total[:\s]*\$?\s*([\d,]+\.?\d*)/i,
  ];

  const gstPatterns = [
    /gst[:\s]*\$?\s*([\d,]+\.?\d*)/i,
    /goods\s*(?:and|&)\s*services\s*tax[:\s]*\$?\s*([\d,]+\.?\d*)/i,
    /tax\s*amount[:\s]*\$?\s*([\d,]+\.?\d*)/i,
  ];

  const subtotalPatterns = [
    /sub\s*-?\s*total[:\s]*\$?\s*([\d,]+\.?\d*)/i,
    /total\s*(?:exc(?:l(?:uding)?)?\.?\s*gst|before\s*gst|ex\.?\s*gst)[:\s]*\$?\s*([\d,]+\.?\d*)/i,
    /net\s*amount[:\s]*\$?\s*([\d,]+\.?\d*)/i,
  ];

  for (const pattern of totalPatterns) {
    const match = text.match(pattern);
    if (match) {
      totalAmount = parseCurrency(match[1]);
      if (totalAmount !== null) break;
    }
  }

  for (const pattern of gstPatterns) {
    const match = text.match(pattern);
    if (match) {
      gstAmount = parseCurrency(match[1]);
      if (gstAmount !== null) break;
    }
  }

  for (const pattern of subtotalPatterns) {
    const match = text.match(pattern);
    if (match) {
      subtotal = parseCurrency(match[1]);
      if (subtotal !== null) break;
    }
  }

  // Infer missing amounts
  if (totalAmount !== null && gstAmount !== null && subtotal === null) {
    subtotal = Math.round((totalAmount - gstAmount) * 100) / 100;
  } else if (
    subtotal !== null &&
    gstAmount !== null &&
    totalAmount === null
  ) {
    totalAmount = Math.round((subtotal + gstAmount) * 100) / 100;
  } else if (
    subtotal !== null &&
    totalAmount !== null &&
    gstAmount === null
  ) {
    gstAmount = Math.round((totalAmount - subtotal) * 100) / 100;
  }

  return { subtotal, gstAmount, totalAmount };
}

function parseCurrency(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, "");
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  return Math.round(num * 100) / 100;
}

function extractDescription(text: string): string | null {
  const patterns = [
    /(?:description|re|for|regarding|subject)[:\s]+(.+)/i,
    /(?:scope\s*of\s*work|work\s*description)[:\s]+(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const desc = match[1].trim();
      if (desc.length >= 3 && desc.length <= 500) {
        return desc;
      }
    }
  }

  return null;
}

function extractLineItems(lines: string[]): ExtractedLineItem[] {
  const items: ExtractedLineItem[] = [];

  // Look for lines that look like item rows:
  // Description ... Qty ... Unit Price ... Amount
  // Or: Description ... Amount
  const amountPattern =
    /^(.+?)\s+(\d+(?:\.\d+)?)\s+\$?\s*([\d,]+\.?\d*)\s+\$?\s*([\d,]+\.?\d*)$/;
  const simplePattern = /^(.+?)\s+\$?\s*([\d,]+\.?\d{2})$/;

  for (const line of lines) {
    // Skip header-like lines
    if (
      /^(description|item|qty|quantity|unit|price|amount|total)/i.test(
        line,
      )
    ) {
      continue;
    }

    // Try full line item pattern (description, qty, unit price, amount)
    const fullMatch = line.match(amountPattern);
    if (fullMatch) {
      const qty = parseFloat(fullMatch[2]);
      const unitPrice = parseCurrency(fullMatch[3]);
      const amount = parseCurrency(fullMatch[4]);
      if (amount !== null) {
        items.push({
          description: fullMatch[1].trim(),
          quantity: isNaN(qty) ? null : qty,
          unitPrice,
          amount,
        });
        continue;
      }
    }

    // Try simple pattern (description, amount)
    const simpleMatch = line.match(simplePattern);
    if (simpleMatch) {
      const amount = parseCurrency(simpleMatch[2]);
      if (amount !== null && amount > 0 && amount < 1000000) {
        items.push({
          description: simpleMatch[1].trim(),
          quantity: null,
          unitPrice: null,
          amount,
        });
      }
    }
  }

  return items;
}
