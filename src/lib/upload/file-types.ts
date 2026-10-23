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

/**
 * What the bytes are, from their first few kilobytes, or null when they are
 * not one of the allowed kinds. Text must be valid UTF-8 with no NUL bytes
 * and must not look like HTML, SVG or script.
 */
export function sniffKind(head: Uint8Array): FileKind | null {
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(head, [0x47, 0x49, 0x46, 0x38])) return "gif"; // GIF8
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && ascii(head, 8, 12) === "WEBP") return "webp";
  if (ascii(head, 4, 8) === "ftyp" && ["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1"].includes(ascii(head, 8, 12))) {
    return "heic";
  }
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04])) return "ooxml"; // a zip; Office files are zips
  if (startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "ole";
  if (head.length > 0 && !head.includes(0)) {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(head.length >= 4096 ? trimPartialUtf8(head) : head);
    } catch {
      return null;
    }
    if (/<\s*(svg|html|script|!doctype|\?xml|iframe|object|embed)\b/i.test(text)) return null;
    return "text";
  }
  return null;
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
  if (sniffed !== byName.kind) {
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
