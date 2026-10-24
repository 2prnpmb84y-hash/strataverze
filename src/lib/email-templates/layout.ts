import { html, safeHref, type SafeHtml } from "./html";

/**
 * Shared email layout wrapper.
 * Clean, minimal design following StrataVerze brand colours.
 * The content must be SafeHtml (built with `html`), so every value in it
 * has been escaped (S7, SEC-019).
 */
export function emailLayout(content: SafeHtml): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>StrataVerze</title>
</head>
<body style="margin:0;padding:0;background-color:#F8FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8FAFB;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="padding-bottom:24px;text-align:center;">
              <span style="font-size:20px;font-weight:700;color:#1A202C;letter-spacing:-0.02em;">Strata<span style="color:#00D4BF;">Verze</span></span>
            </td>
          </tr>
          <!-- Content Card -->
          <tr>
            <td style="background-color:#ffffff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
              ${content.value}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding-top:24px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#64748B;line-height:1.5;">
                This is an automated notification from StrataVerze.<br />
                You are receiving this because you are a member of an Owners Corporation on StrataVerze.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Styled primary action button for emails. The link must be to the app
 * itself; anything else becomes the app's home page.
 */
export function emailButton(label: string, href: string): SafeHtml {
  return html`<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
  <tr>
    <td style="background-color:#00D4BF;border-radius:8px;">
      <a href="${safeHref(href)}" target="_blank" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
        ${label}
      </a>
    </td>
  </tr>
</table>`;
}
