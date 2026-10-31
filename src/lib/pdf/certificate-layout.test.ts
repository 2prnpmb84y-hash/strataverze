/**
 * The certificate layouts and the fonts an issued certificate needs (review
 * of fix/issued-certificate-wording, 31 Oct 2026). Layout 1 is fixed: an
 * issued certificate records it and is always drawn with it. A certificate
 * that must read as issued is refused when its fonts cannot be read, rather
 * than drawn in Helvetica; a draft still falls back.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CERTIFICATE, SALE_CERTIFICATE } from "@/config/statutory";
import type { CertificateDocument } from "./certificate";

const fonts = vi.hoisted(() => ({ missing: false }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const readFile = (async (...a: Parameters<typeof actual.readFile>) => {
    if (fonts.missing && String(a[0]).endsWith(".ttf")) throw Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" });
    return actual.readFile(...a);
  }) as typeof actual.readFile;
  return { ...actual, default: { ...actual, readFile }, readFile };
});
vi.mock("@/lib/log", () => ({ logError: vi.fn() }));

const base: CertificateDocument = {
  schemeName: "Harbour View",
  planNumber: "12345",
  planLabel: "Strata Plan",
  planRowLabel: CERTIFICATE.planRowLabel,
  title: SALE_CERTIFICATE.title,
  section: SALE_CERTIFICATE.section,
  number: 3,
  draft: false,
  certificateDate: "2026-01-05",
  lotNumber: "Lot 7",
  requester: { type: "Owner", name: "Jo Citizen", address: "7/1 Example St" },
  authorisedBy: null,
  ownersCorporation: "owners corporation",
  items: [{ no: "1", title: "Strata renewal committee", text: "Nil." }],
  execution: SALE_CERTIFICATE.execution,
  executionLines: CERTIFICATE.executionLines,
  conclusiveNote: SALE_CERTIFICATE.conclusiveNote,
  form: SALE_CERTIFICATE.form,
  follows: CERTIFICATE.follows,
  preparedOn: "2026-01-05",
};

let logError: (typeof import("@/lib/log"))["logError"];

/** A fresh copy of the renderer, so its font cache starts empty. */
async function fresh() {
  vi.resetModules();
  ({ logError } = await import("@/lib/log"));
  return { cert: await import("./certificate"), doc: await import("./document") };
}

beforeEach(() => {
  fonts.missing = false;
});

describe("layout 1", () => {
  it("is the current layout, and states its own date, labels and operative sentence", async () => {
    const { cert } = await fresh();
    expect(cert.CURRENT_CERTIFICATE_LAYOUT).toBe(1);
    const blocks = cert.certificateBlocks(base, 1);
    expect(blocks).toEqual(cert.certificateBlocks(base));
    expect(blocks).toContainEqual({ kind: "keyValues", rows: [["Certificate number", "3"], ["Date of certificate", "5 January 2026"], ["Lot", "Lot 7"], ["Strata plan", "12345"], ["Requested by", "Jo Citizen (Owner), 7/1 Example St"]] });
    expect(blocks).toContainEqual({ kind: "text", text: "The owners corporation certifies the following for the lot." });
  });

  it("refuses a layout StrataVerze does not know, rather than draw it another way", async () => {
    const { cert } = await fresh();
    expect(() => cert.certificateBlocks(base, 2)).toThrow(cert.UnknownCertificateLayoutError);
    await expect(cert.renderCertificatePdf(base, { layout: 0 })).rejects.toThrow(/layout 0 is not known/);
    expect(cert.isCertificateLayout(1)).toBe(true);
    expect(cert.isCertificateLayout(2)).toBe(false);
    expect(cert.isCertificateLayout("1")).toBe(false);
  });

  it("draws the same file each time", async () => {
    const { cert } = await fresh();
    const a = await cert.renderCertificatePdf(base, { requireEmbeddedFonts: true });
    const b = await cert.renderCertificatePdf(base, { requireEmbeddedFonts: true });
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});

describe("fonts", () => {
  it("refuse an issued certificate when they cannot be read, and let a draft fall back", async () => {
    fonts.missing = true;
    const { cert, doc } = await fresh();
    await expect(cert.renderCertificatePdf(base, { requireEmbeddedFonts: true })).rejects.toThrow(doc.PdfFontsUnavailableError);
    const draft = await cert.renderCertificatePdf({ ...base, draft: true });
    expect(new TextDecoder().decode(draft.slice(0, 5))).toBe("%PDF-");
    expect(vi.mocked(logError)).toHaveBeenCalledWith(expect.stringContaining("using Helvetica"), expect.anything());
  });

  it("are used, with nothing logged, when they can be read", async () => {
    const { cert } = await fresh();
    vi.mocked(logError).mockClear();
    await cert.renderCertificatePdf(base, { requireEmbeddedFonts: true });
    await cert.renderCertificatePdf({ ...base, draft: true });
    expect(vi.mocked(logError)).not.toHaveBeenCalled();
  });
});
