/**
 * Which files may be stored, decided from the file's own first bytes, not
 * the name or type the browser claims (security stage S3, findings SEC-006
 * and SEC-022).
 *
 * Each kind lists its extensions and the MIME type stored with it. SVG is
 * not allowed: it can carry script.
 */

export type FileKind = "pdf" | "png" | "jpeg" | "gif" | "webp" | "heic" | "ooxml" | "ole" | "text";

type KindInfo = { extensions: readonly string[]; mime: (ext: string) => string; label: string };

const OOXML_MIME: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
const OLE_MIME: Record<string, string> = {
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
  ppt: "application/vnd.ms-powerpoint",
};

export const FILE_KINDS: Record<FileKind, KindInfo> = {
  pdf: { extensions: ["pdf"], mime: () => "application/pdf", label: "PDF" },
  png: { extensions: ["png"], mime: () => "image/png", label: "PNG image" },
  jpeg: { extensions: ["jpg", "jpeg"], mime: () => "image/jpeg", label: "JPEG image" },
  gif: { extensions: ["gif"], mime: () => "image/gif", label: "GIF image" },
  webp: { extensions: ["webp"], mime: () => "image/webp", label: "WebP image" },
  heic: { extensions: ["heic", "heif"], mime: (e) => (e === "heif" ? "image/heif" : "image/heic"), label: "HEIC photo" },
  ooxml: { extensions: ["docx", "xlsx", "pptx"], mime: (e) => OOXML_MIME[e], label: "Word, Excel or PowerPoint file" },
  ole: { extensions: ["doc", "xls", "ppt"], mime: (e) => OLE_MIME[e], label: "older Word, Excel or PowerPoint file" },
  text: { extensions: ["txt", "csv"], mime: (e) => (e === "csv" ? "text/csv" : "text/plain"), label: "text or CSV file" },
};

/** Every MIME type the documents bucket accepts (set on the bucket too). */
export const STORABLE_MIME_TYPES: readonly string[] = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  ...Object.values(OOXML_MIME),
  ...Object.values(OLE_MIME),
  "text/plain",
  "text/csv",
];

export function extensionOf(fileName: string): string {
  const name = String(fileName ?? "").trim().toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1) : "";
}

export function kindForExtension(ext: string): FileKind | null {
  for (const [kind, info] of Object.entries(FILE_KINDS) as [FileKind, KindInfo][]) {
    if (info.extensions.includes(ext)) return kind;
  }
  return null;
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((b, i) => bytes[offset + i] === b);
}

function ascii(bytes: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...bytes.slice(from, to));
}

/** Where `needle` first appears in `bytes` (from `from`, up to `to`), or -1. */
function indexOfBytes(bytes: Uint8Array, needle: readonly number[], from = 0, to = bytes.length): number {
  const last = Math.min(to, bytes.length) - needle.length;
  outer: for (let i = from; i <= last; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

const enc = (text: string) => [...text].map((c) => c.charCodeAt(0));
/** Names found in the zip directory of Word, Excel and PowerPoint files. */
const OOXML_MARKERS = ["[Content_Types].xml", "_rels/", "docProps/", "word/", "xl/", "ppt/"].map(enc);
/** PDF readers accept the header within the first kilobyte. */
const PDF_HEADER = enc("%PDF-");
const PDF_HEADER_WINDOW = 1024;

/** Tags that make a browser treat text as a page or an image with script. */
const MARKUP = /<\s*\/?\s*(svg|html|head|body|script|style|iframe|frame|object|embed|img|meta|link|base|form|a|math|!doctype|\?xml)\b/i;

/**
 * Decode a text sample: UTF-8 first, then UTF-16 when it starts with a byte
 * order mark, then Windows-1252 (common for bank and accounting exports).
 * Null when it is not text (NUL bytes or control characters outside UTF-16).
 */
function decodeText(head: Uint8Array): string | null {
  if (head.length === 0) return null;
  const sample = head.length >= 4096 ? trimPartialUtf8(head) : head;
  if ((head[0] === 0xff && head[1] === 0xfe) || (head[0] === 0xfe && head[1] === 0xff)) {
    try {
      const text = new TextDecoder(head[0] === 0xff ? "utf-16le" : "utf-16be", { fatal: true }).decode(
        head.slice(0, head.length - (head.length % 2)),
      );
      return hasControlCharacters(text) ? null : text;
    } catch {
      return null;
    }
  }
  if (head.includes(0)) return null;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(sample);
  } catch {
    text = new TextDecoder("windows-1252").decode(head);
  }
  return hasControlCharacters(text) ? null : text;
}

/** Control characters other than tab, line feed, carriage return and form feed. */
function hasControlCharacters(text: string): boolean {
  return /[\u0000-\u0008\u000B\u000E-\u001F\u007F]/.test(text);
}

/**
 * What the bytes are, from their first few kilobytes, or null when they are
 * not one of the allowed kinds. A zip must look like an Office file. Text
 * must not contain control characters and must not look like HTML, SVG or
 * script.
 */
export function sniffKind(head: Uint8Array): FileKind | null {
  if (indexOfBytes(head, PDF_HEADER, 0, PDF_HEADER_WINDOW) >= 0) return "pdf";
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(head, [0x47, 0x49, 0x46, 0x38])) return "gif"; // GIF8
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && ascii(head, 8, 12) === "WEBP") return "webp";
  if (ascii(head, 4, 8) === "ftyp" && ["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1"].includes(ascii(head, 8, 12))) {
    return "heic";
  }
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04])) {
    // A zip. Office files name their parts in the zip's first entries.
    return OOXML_MARKERS.some((m) => indexOfBytes(head, m) >= 0) ? "ooxml" : null;
  }
  if (startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "ole";
  const text = decodeText(head);
  if (text === null || MARKUP.test(text)) return null;
  return "text";
}

/** Drop a UTF-8 sequence cut off at the end of a sample. */
function trimPartialUtf8(bytes: Uint8Array): Uint8Array {
  let end = bytes.length;
  for (let i = 1; i <= 3 && end - i >= 0; i++) {
    const b = bytes[end - i];
    if ((b & 0xc0) === 0x80) continue; // continuation byte
    const need = (b & 0xe0) === 0xc0 ? 2 : (b & 0xf0) === 0xe0 ? 3 : (b & 0xf8) === 0xf0 ? 4 : 1;
    if (need > i) end -= i;
    break;
  }
  return bytes.slice(0, end);
}

export type FileCheck =
  | { ok: true; kind: FileKind; mime: string; extension: string }
  | { ok: false; error: string };

/**
 * Check a file's name against the kinds allowed for an upload, before it is
 * uploaded (from the name only; the bytes are checked afterwards).
 */
export function checkFileName(fileName: string, allowed: readonly FileKind[]): FileCheck {
  const extension = extensionOf(fileName);
  const kind = kindForExtension(extension);
  if (!kind || !allowed.includes(kind)) {
    return { ok: false, error: `This type of file is not accepted here. Accepted: ${describeKinds(allowed)}.` };
  }
  return { ok: true, kind, mime: FILE_KINDS[kind].mime(extension), extension };
}

/** Check the stored bytes match the name's kind. */
export function checkFileBytes(fileName: string, head: Uint8Array, allowed: readonly FileKind[]): FileCheck {
  const byName = checkFileName(fileName, allowed);
  if (!byName.ok) return byName;
  const sniffed = sniffKind(head);
  // A password-protected Word, Excel or PowerPoint file is an encrypted
  // container in the older (OLE) format, whatever its extension.
  const protectedOffice = byName.kind === "ooxml" && sniffed === "ole";
  if (sniffed !== byName.kind && !protectedOffice) {
    return { ok: false, error: "The file's contents do not match its type. Please upload the original file." };
  }
  return byName;
}

export function describeKinds(kinds: readonly FileKind[]): string {
  return kinds.map((k) => FILE_KINDS[k].label).join(", ");
}

/** Extensions for an <input accept> attribute. */
export function acceptAttribute(kinds: readonly FileKind[]): string {
  return kinds.flatMap((k) => FILE_KINDS[k].extensions.map((e) => `.${e}`)).join(",");
}
