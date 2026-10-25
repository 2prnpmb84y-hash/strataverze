import { NextResponse, type NextRequest } from "next/server";
import { NO_STORE, noStore } from "@/lib/http/no-store";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { requireSchemeAccess } from "@/lib/auth/require-access";
import { AuthorisationError } from "@/lib/auth/require-membership";
import { requireRecentMfa, StepUpRequiredError } from "@/lib/auth/mfa-enforcement";
import { recordSecurityEvent } from "@/lib/audit/security-audit";
import { getVault, VaultError } from "@/lib/vault/capture";
import { buildEvidencePackage } from "@/lib/vault/export";

/**
 * The building vault's evidence package (trial). A form POST from the vault
 * page: schemeId, reason, and either all=on or one recordId per record.
 * Adviser only, with an authenticator check in the last 15 minutes. The
 * export is written to the vault's ledger and the security log.
 */
export async function POST(request: NextRequest) {
  // Only from StrataVerze's own pages.
  // Browsers send Origin with every form POST; anything without it, or from elsewhere, is refused.
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) return new NextResponse("Not allowed", { status: 403, headers: NO_STORE });

  const profile = await getCurrentProfile();
  if (!profile) return new NextResponse("Sign in to export.", { status: 401, headers: NO_STORE });
  const form = await request.formData();
  const schemeId = String(form.get("schemeId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(schemeId)) return new NextResponse("Choose a building.", { status: 400, headers: NO_STORE });
  const back = `/adviser/schemes/${schemeId}/documents/vault`;
  const backWith = (message: string) => noStore(NextResponse.redirect(new URL(`${back}?exportError=${encodeURIComponent(message)}`, request.nextUrl), 303));

  try {
    await requireSchemeAccess(schemeId, "vault.manage");
  } catch (err) {
    if (err instanceof AuthorisationError) return new NextResponse("Not found", { status: 404, headers: NO_STORE });
    throw err;
  }
  try {
    await requireRecentMfa();
  } catch (err) {
    if (err instanceof StepUpRequiredError) return noStore(NextResponse.redirect(new URL(`/mfa?next=${encodeURIComponent(back)}`, request.nextUrl), 303));
    if (err instanceof AuthorisationError) return new NextResponse("Sign in to export.", { status: 401, headers: NO_STORE });
    throw err;
  }
  if (!(await getVault(schemeId))) return backWith("This building's vault has not been opened.");

  const all = form.get("all") === "on";
  const recordIds = form.getAll("recordId").map(String).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  try {
    const pkg = await buildEvidencePackage({
      schemeId,
      actorId: profile.id,
      actorName: [profile.firstName, profile.lastName].filter(Boolean).join(" ") || profile.email,
      recordIds: all ? "all" : recordIds,
      reason: String(form.get("reason") ?? ""),
    });
    await recordSecurityEvent({
      action: "vault.export",
      outcome: "allowed",
      actorProfileId: profile.id,
      actorRole: "ADVISER",
      schemeId,
      resourceType: "Vault",
      metadata: { exportSeq: pkg.exportSeq, manifestSha256: pkg.manifestSha256 },
    });
    return new NextResponse(Buffer.from(pkg.zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${pkg.fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof VaultError) return backWith(err.message);
    throw err;
  }
}
