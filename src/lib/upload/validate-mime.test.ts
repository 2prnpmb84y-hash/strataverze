import { describe, it, expect } from "vitest";
import { validateFileUpload } from "./validate-mime";

function makeFile(
  name: string,
  type: string,
  size: number = 1024,
): File {
  const content = new Uint8Array(size);
  return new File([content], name, { type });
}

describe("validateFileUpload", () => {
  describe("valid file types", () => {
    const validCases = [
      { name: "report.pdf", type: "application/pdf" },
      { name: "doc.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      { name: "sheet.xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      { name: "photo.jpg", type: "image/jpeg" },
      { name: "photo.jpeg", type: "image/jpeg" },
      { name: "image.png", type: "image/png" },
      { name: "image.gif", type: "image/gif" },
      { name: "image.webp", type: "image/webp" },
      { name: "icon.svg", type: "image/svg+xml" },
      { name: "data.csv", type: "text/csv" },
      { name: "notes.txt", type: "text/plain" },
      { name: "slides.pptx", type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
    ];

    for (const { name, type } of validCases) {
      it(`accepts ${name} (${type})`, () => {
        const file = makeFile(name, type);
        expect(validateFileUpload(file)).toBeNull();
      });
    }
  });

  describe("invalid file types", () => {
    it("rejects executable files", () => {
      const file = makeFile("virus.exe", "application/x-msdownload");
      const result = validateFileUpload(file);
      expect(result).not.toBeNull();
      expect(result).toContain("not allowed");
    });

    it("rejects JavaScript files", () => {
      const file = makeFile("script.js", "application/javascript");
      const result = validateFileUpload(file);
      expect(result).not.toBeNull();
    });

    it("rejects HTML files", () => {
      const file = makeFile("page.html", "text/html");
      const result = validateFileUpload(file);
      expect(result).not.toBeNull();
    });

    it("rejects zip archives", () => {
      const file = makeFile("archive.zip", "application/zip");
      const result = validateFileUpload(file);
      expect(result).not.toBeNull();
    });

    it("rejects unknown MIME type with valid extension", () => {
      const file = makeFile("file.pdf", "application/octet-stream");
      const result = validateFileUpload(file);
      expect(result).not.toBeNull();
      expect(result).toContain("not permitted");
    });
  });

  describe("empty and missing files", () => {
    it("rejects zero-size file", () => {
      const file = makeFile("empty.pdf", "application/pdf", 0);
      const result = validateFileUpload(file);
      expect(result).not.toBeNull();
      expect(result).toContain("select a file");
    });
  });

  describe("extension validation", () => {
    it("is case-insensitive for extensions", () => {
      const file = makeFile("REPORT.PDF", "application/pdf");
      expect(validateFileUpload(file)).toBeNull();
    });

    it("rejects files with no extension", () => {
      const file = makeFile("noextension", "application/pdf");
      const result = validateFileUpload(file);
      expect(result).not.toBeNull();
    });
  });

  describe("MIME type edge cases", () => {
    it("accepts file with empty MIME type if extension is valid", () => {
      const file = makeFile("document.pdf", "");
      // Empty type string is falsy, so MIME check is skipped
      expect(validateFileUpload(file)).toBeNull();
    });
  });
});
