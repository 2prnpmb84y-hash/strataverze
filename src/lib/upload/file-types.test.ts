import { describe, expect, it } from "vitest";
import { checkFileBytes, checkFileName, sniffKind, STORABLE_MIME_TYPES } from "./file-types";

const bytes = (...b: number[]) => new Uint8Array(b);
const text = (s: string) => new TextEncoder().encode(s);
const DOCS = ["pdf", "png", "jpeg", "gif", "webp", "ooxml", "ole", "text"] as const;

describe("sniffKind", () => {
  it("recognises the allowed kinds by their first bytes", () => {
    expect(sniffKind(text("%PDF-1.7\n"))).toBe("pdf");
    expect(sniffKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("png");
    expect(sniffKind(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(sniffKind(text("GIF89a"))).toBe("gif");
    expect(sniffKind(text("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "))).toBe("webp");
    expect(sniffKind(new Uint8Array([0, 0, 0, 0x18, ...text("ftypheic")]))).toBe("heic");
    expect(sniffKind(bytes(0x50, 0x4b, 0x03, 0x04))).toBe("ooxml");
    expect(sniffKind(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1))).toBe("ole");
    expect(sniffKind(text("lot,owner,amount\n1,A,100\n"))).toBe("text");
  });

  it("refuses SVG, HTML and script dressed as text, and binary junk", () => {
    expect(sniffKind(text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(sniffKind(text("<!DOCTYPE html><html>"))).toBeNull();
    expect(sniffKind(text("hello <script>x</script>"))).toBeNull();
    expect(sniffKind(text('<?xml version="1.0"?>'))).toBeNull();
    expect(sniffKind(bytes(0x4d, 0x5a, 0x90, 0x00))).toBeNull(); // a Windows program
    expect(sniffKind(new Uint8Array(0))).toBeNull();
  });
});

describe("checkFileName", () => {
  it("allows the purpose's kinds and refuses SVG and unknown types", () => {
    expect(checkFileName("Minutes.PDF", DOCS)).toMatchObject({ ok: true, kind: "pdf", mime: "application/pdf", extension: "pdf" });
    expect(checkFileName("plan.svg", DOCS).ok).toBe(false);
    expect(checkFileName("setup.exe", DOCS).ok).toBe(false);
    expect(checkFileName("noextension", DOCS).ok).toBe(false);
    expect(checkFileName("photo.heic", DOCS).ok).toBe(false);
    expect(checkFileName("photo.heic", ["pdf", "heic"])).toMatchObject({ ok: true, mime: "image/heic" });
  });
});

describe("checkFileBytes", () => {
  it("refuses a file whose contents do not match its name", () => {
    expect(checkFileBytes("invoice.pdf", text("%PDF-1.4"), DOCS).ok).toBe(true);
    expect(checkFileBytes("invoice.pdf", text("<html>"), DOCS).ok).toBe(false);
    expect(checkFileBytes("photo.png", text("%PDF-1.4"), DOCS).ok).toBe(false);
    expect(checkFileBytes("notes.txt", text("<svg onload=alert(1)>"), DOCS).ok).toBe(false);
  });
});

describe("STORABLE_MIME_TYPES", () => {
  it("never includes SVG or HTML", () => {
    expect(STORABLE_MIME_TYPES.some((t) => /svg|html|javascript/.test(t))).toBe(false);
  });
});
