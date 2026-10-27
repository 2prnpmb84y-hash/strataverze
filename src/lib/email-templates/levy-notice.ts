import { emailLayout, emailButton } from "./layout";
import { html, plainSubject, type SafeHtml } from "./html";
import type { HardshipInformation } from "@/lib/finance/levy-notice-content";
import { capitalise, lateChargeSentence, type NoticeLateChargeRule } from "@/lib/jurisdiction/wording";
import type { DocumentTerms } from "@/lib/pdf/documents";


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
  /** NSW: the owners corporation resolved not to charge interest. Queensland: no penalty applies (the notice then states none). */
  noInterest: boolean;
  /** The building's late charge as the notice states it (see noticeLateCharge): NSW's interest rule, or Queensland's monthly penalty. */
  interest: NoticeLateChargeRule;
  /** The building's hardship statement (`rules.NOTICE_RULES.hardship.information`), or null where the pack requires none. */
  hardship: HardshipInformation | null;
  /** The building's words for its owners corporation, plan, levies and late charges (`rules.TERMINOLOGY`). */
  terms: DocumentTerms;
}

const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

/** The hardship statement, as the notice has always shown it. */
const hardshipBox = (h: HardshipInformation) => html`<div style="margin:20px 0 0;padding:12px 16px;background-color:#F8FAFB;border-radius:8px;">
      <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#1a1a2e;">${h.title}</p>
      <p style="margin:0 0 6px;font-size:13px;color:#1A202C;line-height:1.6;">${h.summary}</p>
      <p style="margin:0;font-size:13px;color:#1A202C;line-height:1.6;">
        ${h.helplineName}: ${h.helplinePhone} or ${h.helplineWeb}.
        More information, including translations: ${h.moreInformationUrl}
      </p>
    </div>`;

/** A levy notice with every item the content check requires (see validateLevyNoticeContent). */
export function levyNoticeEmail(p: LevyNoticeEmail) {
  const row = (label: string, value: string | SafeHtml) =>
    html`<tr><td style="padding:4px 12px 4px 0;font-size:13px;color:#64748B;white-space:nowrap;">${label}</td><td style="padding:4px 0;font-size:14px;color:#1a1a2e;">${value}</td></tr>`;
  const t = p.terms;
  const Levy = capitalise(t.levy);
  // The late charge sentence (NSW interest, or a Queensland penalty), or none where no penalty applies.
  const lateCharge = lateChargeSentence(p, t);
  const lateChargeParagraph = lateCharge
    ? html`<p style="margin:0 0 12px;font-size:13px;color:#1A202C;line-height:1.6;">
      ${lateCharge}
    </p>
    `
    : "";
  const content = html`
    <h1 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#1a1a2e;">${Levy} notice ${p.noticeNumber}</h1>
    <p style="margin:0 0 16px;font-size:14px;color:#64748B;">${p.schemeName}, ${t.planLabel} ${p.planNumber}</p>
    <p style="margin:0 0 16px;font-size:15px;color:#1A202C;line-height:1.6;">Dear ${p.ownerName},</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
      ${row("Lot", p.lotNumber)}
      ${row("Notice date", day(p.noticeDate))}
      ${row("Fund", p.fundName)}
      ${row("Amount payable", html`<strong>$${p.amount}</strong>`)}
      ${row("Due date", html`<strong>${day(p.dueDate)}</strong>`)}
    </table>
    <h2 style="margin:16px 0 6px;font-size:15px;color:#1a1a2e;">How to pay</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
      ${row("Account name", p.payment.accountName)}
      ${row("BSB", p.payment.bsb)}
      ${row("Account number", p.payment.accountNumber)}
      ${row("Reference", html`<strong>${p.payment.reference}</strong>`)}
    </table>
    ${lateChargeParagraph}<p style="margin:0 0 12px;font-size:13px;color:#1A202C;line-height:1.6;">
      You can check your ${t.levy} ledger at any time in the StrataVerze owner portal. For questions contact ${p.contact.name} (${p.contact.emailOrPhone}).
    </p>
    ${emailButton(`View your ${t.levy} ledger`, p.ledgerUrl)}
    ${p.hardship ? hardshipBox(p.hardship) : ""}
  `;
  return {
    to: p.to,
    subject: plainSubject(`${Levy} notice ${p.noticeNumber}: $${p.amount} due ${day(p.dueDate)} (${p.schemeName})`),
    html: emailLayout(content),
  };
}
