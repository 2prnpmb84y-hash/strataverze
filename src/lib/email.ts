import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
// Construct the client only when a key is present. Passing an undefined key to
// the Resend constructor throws at module-evaluation time, which would crash
// every server action that imports this module, not just email sending.
const resend = apiKey ? new Resend(apiKey) : null;

const FROM_ADDRESS =
  process.env.EMAIL_FROM ?? "StrataVerze <notifications@strataverze.com.au>";

type SendEmailParams = {
  to: string | string[];
  subject: string;
  html: string;
};

/**
 * Send an email via Resend.
 * Fails silently when RESEND_API_KEY is not set (development, or before the key
 * is configured in production) so it never blocks a server action.
 */
export async function sendEmail({ to, subject, html }: SendEmailParams) {
  if (!resend) {
    console.log(
      `[email] Skipping email (no RESEND_API_KEY): recipients=${Array.isArray(to) ? to.length : 1}, subject="${subject}"`,
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
