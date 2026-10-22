import { emailLayout, emailButton } from "./layout";
import { HARDSHIP_INFORMATION } from "@/lib/finance/levy-notice-content";
import { STATUTORY_INTEREST } from "@/config/statutory";

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface LevyNoticeEmail {
  to: string;
  ownerName: string;
  schemeName: string;
  planNumber: string;
  lotNumber: string;
  noticeNumber: string;
  noticeDate: string;
  dueDate: string;
  fundName: string;
  amount: string;
  payment: { accountName: string; bsb: string; accountNumber: string; reference: string };
  contact: { name: string; emailOrPhone: string };
  ledgerUrl: string;
  noInterest: boolean;
}

const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

/** A levy notice with every item the content check requires (see validateLevyNoticeContent). */
export function levyNoticeEmail(p: LevyNoticeEmail) {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;font-size:13px;color:#64748B;white-space:nowrap;">${label}</td><td style="padding:4px 0;font-size:14px;color:#1a1a2e;">${value}</td></tr>`;
  const content = `
    <h1 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#1a1a2e;">Levy notice ${escape(p.noticeNumber)}</h1>
    <p style="margin:0 0 16px;font-size:14px;color:#64748B;">${escape(p.schemeName)}, Strata Plan ${escape(p.planNumber)}</p>
    <p style="margin:0 0 16px;font-size:15px;color:#1A202C;line-height:1.6;">Dear ${escape(p.ownerName)},</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
      ${row("Lot", escape(p.lotNumber))}
      ${row("Notice date", day(p.noticeDate))}
      ${row("Fund", escape(p.fundName))}
      ${row("Amount payable", `<strong>$${escape(p.amount)}</strong>`)}
      ${row("Due date", `<strong>${day(p.dueDate)}</strong>`)}
    </table>
    <h2 style="margin:16px 0 6px;font-size:15px;color:#1a1a2e;">How to pay</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
      ${row("Account name", escape(p.payment.accountName))}
      ${row("BSB", escape(p.payment.bsb))}
      ${row("Account number", escape(p.payment.accountNumber))}
      ${row("Reference", `<strong>${escape(p.payment.reference)}</strong>`)}
    </table>
    <p style="margin:0 0 12px;font-size:13px;color:#1A202C;line-height:1.6;">
      ${
        p.noInterest
          ? "The owners corporation has resolved not to charge interest on overdue levies."
          : `Interest: if this levy is not paid within one month after the due date, simple interest of ${STATUTORY_INTEREST.annualRatePercent}% a year is charged from the due date until it is paid (${STATUTORY_INTEREST.source}).`
      }
    </p>
    <p style="margin:0 0 12px;font-size:13px;color:#1A202C;line-height:1.6;">
      You can check your levy ledger at any time in the StrataVerze owner portal. For questions contact ${escape(p.contact.name)} (${escape(p.contact.emailOrPhone)}).
    </p>
    ${emailButton("View your levy ledger", p.ledgerUrl)}
    <div style="margin:20px 0 0;padding:12px 16px;background-color:#F8FAFB;border-radius:8px;">
      <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#1a1a2e;">${HARDSHIP_INFORMATION.title}</p>
      <p style="margin:0 0 6px;font-size:13px;color:#1A202C;line-height:1.6;">${HARDSHIP_INFORMATION.summary}</p>
      <p style="margin:0;font-size:13px;color:#1A202C;line-height:1.6;">
        ${HARDSHIP_INFORMATION.helplineName}: ${HARDSHIP_INFORMATION.helplinePhone} or ${HARDSHIP_INFORMATION.helplineWeb}.
        More information, including translations: ${HARDSHIP_INFORMATION.moreInformationUrl}
      </p>
    </div>
  `;
  return {
    to: p.to,
    subject: `Levy notice ${p.noticeNumber}: $${p.amount} due ${day(p.dueDate)} (${p.schemeName})`,
    html: emailLayout(content),
  };
}
