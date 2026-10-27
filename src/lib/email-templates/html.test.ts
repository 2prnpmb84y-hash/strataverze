import { describe, expect, it } from "vitest";
import { statutoryRulesFor, type NswRules } from "@/config/statutory";
import { escapeHtml, html, plainSubject, safeHref, trustedHtml } from "./html";
import { announcementPublishedEmail } from "./announcement";
import { invitationEmail } from "./invitation";
import { meetingScheduledEmail } from "./meeting";
import { levyIssuedEmail } from "./levy";
import { levyNoticeEmail } from "./levy-notice";
import { possibleDuplicatePaymentEmail } from "./payment-confirmation";
import { platformInvoiceEmail } from "./platform-invoice";
import { workOrderCreatedEmail, workOrderStatusEmail } from "./work-order";

/** Email escaping (S7, SEC-019). */
const EVIL = `<a href="https://evil.example/pay">Pay here</a><script>x</script>'"`;
const URL = "http://localhost:3000/owner";

describe("html", () => {
  it("escapes every value, but not SafeHtml", () => {
    const inner = html`<b>${"<i>"}</b>`;
    expect(html`<p>${EVIL}</p>${inner}${trustedHtml("<br>")}`.value).toBe(
      `<p>${escapeHtml(EVIL)}</p><b>&lt;i&gt;</b><br>`,
    );
    expect(escapeHtml(EVIL)).not.toMatch(/[<>"']/);
    expect(html`${null}${undefined}${false}${["a", "<"]}`.value).toBe("a&lt;");
  });

  it("allows links only to the app", () => {
    expect(safeHref("http://localhost:3000/x?y=1", "http://localhost:3000")).toBe("http://localhost:3000/x?y=1");
    expect(safeHref("https://app.strataverze.com/owner", "https://app.strataverze.com")).toBe("https://app.strataverze.com/owner");
    expect(safeHref("https://app.strataverze.com.evil.example/", "https://app.strataverze.com")).toBe("https://app.strataverze.com/");
    expect(safeHref("http://app.strataverze.com/", "https://app.strataverze.com")).toBe("https://app.strataverze.com/");
    expect(safeHref("javascript:alert(1)", "https://app.strataverze.com")).toBe("https://app.strataverze.com/");
  });

  it("keeps subjects to one line", () => {
    expect(plainSubject("Hello\r\nBcc: x@example.com\tthere")).toBe("Hello Bcc: x@example.com there");
    expect(plainSubject("x".repeat(300))).toHaveLength(200);
  });
});

describe("every email template", () => {
  const emails = [
    announcementPublishedEmail({ recipientEmails: ["a@example.com"], schemeName: EVIL, title: EVIL, body: EVIL, priority: "URGENT", authorName: EVIL, detailUrl: URL }),
    invitationEmail({ recipientEmail: "a@example.com", schemeName: EVIL, role: EVIL, inviterName: EVIL, expiresAt: new Date(), acceptUrl: URL }),
    meetingScheduledEmail({ recipientEmails: [], schemeName: EVIL, meetingTitle: EVIL, meetingType: EVIL, scheduledAt: new Date(), timeZone: "Australia/Sydney", location: EVIL, detailUrl: URL }),
    levyIssuedEmail({ recipientEmail: "a@example.com", ownerName: EVIL, schemeName: EVIL, levyTitle: EVIL, amount: EVIL, dueDate: new Date(), detailUrl: URL }),
    levyNoticeEmail({
      to: "a@example.com", ownerName: EVIL, schemeName: EVIL, planNumber: EVIL, lotNumber: EVIL, noticeNumber: EVIL,
      noticeDate: "2026-10-01", dueDate: "2026-11-01", fundName: EVIL, amount: EVIL,
      payment: { accountName: EVIL, bsb: EVIL, accountNumber: EVIL, reference: EVIL },
      contact: { name: EVIL, emailOrPhone: EVIL }, ledgerUrl: "https://evil.example/", noInterest: false,
      interest: (statutoryRulesFor("NSW") as NswRules).STATUTORY_INTEREST,
      hardship: (statutoryRulesFor("NSW") as NswRules).HARDSHIP_INFORMATION,
      ownersCorporation: "owners corporation",
    }),
    possibleDuplicatePaymentEmail({ recipientEmails: [], schemeName: EVIL, lotLabel: EVIL, noticeNumber: EVIL, amount: EVIL, documentDate: EVIL, earlierUploadedAt: EVIL, reviewUrl: URL }),
    platformInvoiceEmail({ to: [], schemeName: EVIL, invoiceNumber: EVIL, monthLabel: EVIL, total: EVIL, promotional: true, needsApproval: true, detailUrl: URL }),
    workOrderStatusEmail({ recipientEmail: "a@example.com", workOrderTitle: EVIL, schemeName: EVIL, status: EVIL, updatedByName: EVIL, detailUrl: URL }),
    workOrderCreatedEmail({ recipientEmails: [], workOrderTitle: EVIL, schemeName: EVIL, raisedByName: EVIL, priority: EVIL, detailUrl: URL }),
  ];

  it.each(emails.map((e, i) => [i, e] as const))("template %i never carries a person's markup or a foreign link", (_i, email) => {
    expect(email.html).not.toContain("<script");
    expect(email.html).not.toContain('<a href="https://evil.example');
    expect(email.html).not.toContain("https://evil.example/\"");
    expect(email.html).toContain("&lt;a href=&quot;https://evil.example/pay&quot;&gt;");
    expect(email.subject).not.toMatch(/[\r\n]/);
  });

  it("still renders the fixed markup (buttons, rows, banners)", () => {
    expect(emails[0].html).toContain("urgent announcement");
    expect(emails[4].html).toContain("<strong>$");
    expect(emails[6].html).toContain("credited during the promotional period");
    expect(emails[0].html).toContain(`href="${URL}"`);
  });
});
