import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { MARKETING_SITE_URL } from "@/lib/site-url";
import { captchaSiteKey } from "@/lib/auth/captcha";
import { JoinFlow } from "./join-flow";

export const instant = false;

export const metadata: Metadata = {
  title: "Accept your invitation | StrataVerze",
  // The page is reached only from an emailed link.
  robots: { index: false, follow: false },
};

/**
 * Where an invitation email's one-time link lands (security stage S2a):
 * /join#<token>. The token stays in the URL fragment, which the browser
 * never sends, and JoinFlow passes it to the server actions in a POST body.
 */
export default function JoinPage() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-muted px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <a href={MARKETING_SITE_URL} aria-label="StrataVerze home page">
            <Logo size="lg" variant="gradient" />
          </a>
        </div>
        <div className="rounded-[var(--radius-card)] bg-white border border-line p-8">
          <JoinFlow captchaSiteKey={captchaSiteKey()} />
        </div>
      </div>
    </div>
  );
}
