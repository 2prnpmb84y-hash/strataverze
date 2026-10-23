import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getMfaStatus } from "@/lib/auth/mfa-enforcement";
import { MAX_TOTP_FACTORS, recentlyVerified, safeNextPath } from "@/lib/auth/mfa-policy";
import { MfaShell } from "../shell";
import { EnrolForm } from "../mfa-forms";

export const instant = false;

/**
 * Set up an authenticator app. Required for platform admins, advisers,
 * accountants, payment authorisers and treasurers; open to everyone.
 * Adding a second authenticator (the recovery route) needs a fresh check
 * with the first.
 */
export default async function MfaSetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const status = await getMfaStatus();
  if (!status) redirect("/login");
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : null);

  const count = status.verifiedFactors.length;
  if (count > 0 && status.gate !== "ok") redirect("/mfa?next=/mfa/setup");
  if (count > 0 && !recentlyVerified(status.assurance)) redirect("/mfa?next=/mfa/setup");

  if (count >= MAX_TOTP_FACTORS) {
    return (
      <MfaShell
        title="Authenticators"
        description={`You already have ${MAX_TOTP_FACTORS} authenticators, the most allowed. Remove one in Settings before adding another.`}
      >
        <a href="/settings" className="text-sm font-medium text-turquoise">
          Go to Settings
        </a>
      </MfaShell>
    );
  }

  return (
    <MfaShell
      title={count === 0 ? "Set up two-step sign-in" : "Add a second authenticator"}
      description={
        count === 0
          ? status.mandatory
            ? "Your role on StrataVerze needs an authenticator app as well as your password."
            : "Protect your account with an authenticator app as well as your password."
          : "A second authenticator lets you sign in if you lose your phone."
      }
    >
      <EnrolForm next={next} />
    </MfaShell>
  );
}
