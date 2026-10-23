import { Resend } from "resend";
import { plainSubject } from "@/lib/email-templates/html";

const apiKey = process.env.RESEND_API_KEY;
// Construct the client only when a key is present. Passing an undefined key to
// the Resend constructor throws at module-evaluation time, which would crash
// every server action that imports this module, not just email sending.
const resend = apiKey ? new Resend(apiKey) : null;

const FROM_ADDRESS =
  // strataverze.com is the platform's domain (strataverze.com.au is not
  // registered). Resend sends only once the domain is verified there.
  process.env.EMAIL_FROM ?? "StrataVerze <notifications@strataverze.com>";

type SendEmailParams = {
  to: string | string[];
  subject: string;
  html: string;
  /** Files to attach, for example a levy notice PDF. */
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
};

/**
 * Send an email via Resend.
 * Fails silently when RESEND_API_KEY is not set (development, or before the key
 * is configured in production) so it never blocks a server action.
 * Returns true only when Resend accepted the email.
 */
export async function sendEmail({ to, subject, html, attachments }: SendEmailParams): Promise<boolean> {
  if (!resend) {
    // The subject can name people or buildings, so it is not logged (S7, SEC-026).
    console.log(`[email] Skipping email (no RESEND_API_KEY): recipients=${Array.isArray(to) ? to.length : 1}`);
    return false;
  }

  try {
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: Array.isArray(to) ? to : [to],
      subject: plainSubject(subject),
      html,
      ...(attachments?.length ? { attachments } : {}),
    });
    if (result.error) {
      console.error("[email] Resend rejected the email:", result.error.name ?? "error");
      return false;
    }
    return true;
  } catch (error) {
    console.error("[email] Failed to send email:", error instanceof Error ? error.name : "error");
    return false;
  }
}
