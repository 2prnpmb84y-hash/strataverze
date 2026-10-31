import { emailLayout, emailButton } from "./layout";
import { html, plainSubject } from "./html";

const roleLabels: Record<string, string> = {
  OWNER: "Owner",
  COMMITTEE: "Committee Member",
  ADVISER: "Adviser",
  ACCOUNTANT: "Accountant",
};

type InvitationEmailParams = {
  recipientEmail: string;
  schemeName: string;
  role: string;
  inviterName: string;
  expiresAt: Date;
  acceptUrl: string;
};

/**
 * The invitation with a one-time /join link (security stage S2a). The same
 * email goes to someone new and to someone who already has an account, so
 * neither the email nor the inviter learns which: the /join page tells the
 * invitee whether to choose a password or to sign in.
 */
export function invitationLinkEmail(params: InvitationEmailParams & { lotNumber?: string | null }) {
  const roleLabel = roleLabels[params.role] ?? params.role;
  const expiryFormatted = params.expiresAt.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Australia/Sydney",
  });
  const lot = params.lotNumber ? html` for <strong>Lot ${params.lotNumber}</strong>` : "";

  const content = html`
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a2e;">
      You've been invited
    </h1>
    <p style="margin:0 0 20px;font-size:15px;color:#1A202C;line-height:1.6;">
      ${params.inviterName} has invited you to join
      <strong>${params.schemeName}</strong> as ${/^[AEIOU]/.test(roleLabel) ? "an" : "a"} <strong>${roleLabel}</strong>${lot}
      on StrataVerze.
    </p>
    <p style="margin:0 0 4px;font-size:13px;color:#64748B;line-height:1.5;">
      The button below works once and expires on ${expiryFormatted}. If you are
      new to StrataVerze, you will choose a password. If you already have an
      account, you will sign in as usual.
    </p>
    ${emailButton("Accept invitation", params.acceptUrl)}
    <p style="margin:16px 0 0;font-size:12px;color:#64748B;line-height:1.5;">
      If you did not expect this invitation, you can safely ignore this email.
      Please do not forward it: the link is for ${params.recipientEmail} only.
    </p>
  `;

  return {
    to: params.recipientEmail,
    subject: plainSubject(`You've been invited to ${params.schemeName}`),
    html: emailLayout(content),
  };
}
