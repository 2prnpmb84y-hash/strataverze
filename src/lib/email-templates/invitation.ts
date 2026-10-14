import { emailLayout, emailButton } from "./layout";

const roleLabels: Record<string, string> = {
  OWNER: "Owner",
  COMMITTEE: "Committee Member",
  ADVISER: "Adviser",
};

type InvitationEmailParams = {
  recipientEmail: string;
  schemeName: string;
  role: string;
  inviterName: string;
  expiresAt: Date;
  acceptUrl: string;
};

export function invitationEmail(params: InvitationEmailParams) {
  const roleLabel = roleLabels[params.role] ?? params.role;
  const expiryFormatted = params.expiresAt.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const content = `
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a2e;">
      You've been invited
    </h1>
    <p style="margin:0 0 20px;font-size:15px;color:#4a4a5a;line-height:1.6;">
      ${params.inviterName} has invited you to join
      <strong>${params.schemeName}</strong> as a <strong>${roleLabel}</strong>
      on StrataVerze.
    </p>
    <p style="margin:0 0 4px;font-size:13px;color:#8c8c9a;">
      This invitation expires on ${expiryFormatted}.
    </p>
    ${emailButton("Accept Invitation", params.acceptUrl)}
    <p style="margin:16px 0 0;font-size:12px;color:#8c8c9a;line-height:1.5;">
      If you did not expect this invitation, you can safely ignore this email.
    </p>
  `;

  return {
    to: params.recipientEmail,
    subject: `You've been invited to ${params.schemeName}`,
    html: emailLayout(content),
  };
}
