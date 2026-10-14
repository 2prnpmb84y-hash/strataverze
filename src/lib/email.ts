import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS =
  process.env.EMAIL_FROM ?? "StrataVerze <notifications@strataverze.com.au>";

type SendEmailParams = {
  to: string | string[];
  subject: string;
  html: string;
};

/**
 * Send an email via Resend.
 * Fails silently in development when RESEND_API_KEY is not set
 * to avoid blocking server actions.
 */
export async function sendEmail({ to, subject, html }: SendEmailParams) {
  if (!process.env.RESEND_API_KEY) {
    console.log(
      `[email] Skipping email (no RESEND_API_KEY): to=${Array.isArray(to) ? to.join(", ") : to}, subject=${subject}`,
    );
    return;
  }

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    });
  } catch (error) {
    console.error("[email] Failed to send email:", error);
  }
}
