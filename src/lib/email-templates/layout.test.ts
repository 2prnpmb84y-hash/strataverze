import { describe, it, expect } from "vitest";
import { emailLayout, emailButton } from "./layout";

describe("emailLayout", () => {
  it("wraps content in a valid HTML document", () => {
    const result = emailLayout("<p>Hello</p>");
    expect(result).toContain("<!DOCTYPE html>");
    expect(result).toContain("<html");
    expect(result).toContain("</html>");
  });

  it("includes the StrataVerze brand name in the header", () => {
    const result = emailLayout("<p>Test</p>");
    expect(result).toContain("Strata");
    expect(result).toContain("Verze");
  });

  it("embeds the provided content", () => {
    const content = "<h1>Important Notice</h1><p>Details here</p>";
    const result = emailLayout(content);
    expect(result).toContain(content);
  });

  it("includes a footer disclaimer", () => {
    const result = emailLayout("<p>Test</p>");
    expect(result).toContain("automated notification");
    expect(result).toContain("Owners Corporation");
  });

  it("includes viewport meta for mobile", () => {
    const result = emailLayout("<p>Test</p>");
    expect(result).toContain('name="viewport"');
  });
});

describe("emailButton", () => {
  it("creates a link with the provided label and href", () => {
    const result = emailButton("View Invoice", "https://example.com/invoice");
    expect(result).toContain("View Invoice");
    expect(result).toContain('href="https://example.com/invoice"');
  });

  it("opens link in new tab", () => {
    const result = emailButton("Click", "https://example.com");
    expect(result).toContain('target="_blank"');
  });

  it("applies the brand colour to the button background", () => {
    const result = emailButton("Click", "https://example.com");
    expect(result).toContain("#00D4BF");
  });

  it("renders as a table-based button for email compatibility", () => {
    const result = emailButton("Click", "https://example.com");
    expect(result).toContain('role="presentation"');
    expect(result).toContain("<a ");
  });
});
