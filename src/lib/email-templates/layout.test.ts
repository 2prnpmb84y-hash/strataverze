import { describe, it, expect } from "vitest";
import { emailLayout, emailButton } from "./layout";
import { trustedHtml } from "./html";

describe("emailLayout", () => {
  it("wraps content in a valid HTML document", () => {
    const result = emailLayout(trustedHtml("<p>Hello</p>"));
    expect(result).toContain("<!DOCTYPE html>");
    expect(result).toContain("<html");
    expect(result).toContain("</html>");
  });

  it("includes the StrataVerze brand name in the header", () => {
    const result = emailLayout(trustedHtml("<p>Test</p>"));
    expect(result).toContain("Strata");
    expect(result).toContain("Verze");
  });

  it("embeds the provided content", () => {
    const content = "<h1>Important Notice</h1><p>Details here</p>";
    const result = emailLayout(trustedHtml(content));
    expect(result).toContain(content);
  });

  it("includes a footer disclaimer", () => {
    const result = emailLayout(trustedHtml("<p>Test</p>"));
    expect(result).toContain("automated notification");
    expect(result).toContain("Owners Corporation");
  });

  it("includes viewport meta for mobile", () => {
    const result = emailLayout(trustedHtml("<p>Test</p>"));
    expect(result).toContain('name="viewport"');
  });
});

describe("emailButton", () => {
  it("creates a link with the provided label and href", () => {
    const result = emailButton("View Invoice", "http://localhost:3000/invoice").value;
    expect(result).toContain("View Invoice");
    expect(result).toContain('href="http://localhost:3000/invoice"');
  });

  it("only links to the app itself (S7, SEC-019)", () => {
    for (const href of ["https://example.com/invoice", "javascript:alert(1)", "//evil.example", "/relative"]) {
      expect(emailButton("Click", href).value).toContain('href="http://localhost:3000/"');
    }
  });

  it("opens link in new tab", () => {
    const result = emailButton("Click", "http://localhost:3000").value;
    expect(result).toContain('target="_blank"');
  });

  it("applies the brand colour to the button background", () => {
    const result = emailButton("Click", "http://localhost:3000").value;
    expect(result).toContain("#00D4BF");
  });

  it("renders as a table-based button for email compatibility", () => {
    const result = emailButton("Click", "http://localhost:3000").value;
    expect(result).toContain('role="presentation"');
    expect(result).toContain("<a ");
  });
});
