import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getMfaStatus } from "@/lib/auth/mfa-enforcement";
import { safeNextPath } from "@/lib/auth/mfa-policy";
import { MfaShell } from "./shell";
import { VerifyForm } from "./mfa-forms";

export const instant = false;

/**
 * Verify with an authenticator: after signing in, and again before a
 * sensitive operation (a check within the last 15 minutes is required).
 */
export default async function MfaVerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const status = await getMfaStatus();
  if (!status) redirect("/login");
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : null);

  if (status.verifiedFactors.length === 0) {
    redirect(status.mandatory ? "/mfa/setup" : (next ?? "/dashboard"));
  }

  const factors = status.verifiedFactors.map((f, i) => ({
    id: f.id,
    name: f.friendly_name || `Authenticator ${i + 1}`,
  }));
  const stepUp = status.gate === "ok";

  return (
    <MfaShell
      title={stepUp ? "Confirm it's you" : "Enter your authenticator code"}
      description={
        stepUp
          ? "This action needs a fresh code from your authenticator app."
          : "Open your authenticator app and enter the 6-digit code for StrataVerze."
      }
    >
      <VerifyForm factors={factors} next={next} />
    </MfaShell>
  );
}
