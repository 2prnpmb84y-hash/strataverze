import { redirect } from "next/navigation";
import { getCurrentProfile, getProfileWithMemberships } from "@/lib/queries/profiles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { ProfileForm } from "./profile-form";
import { SignOutButton } from "./sign-out-button";
import { SecuritySection } from "./security-section";
import { getMfaStatus } from "@/lib/auth/mfa-enforcement";
import { MAX_TOTP_FACTORS } from "@/lib/auth/mfa-policy";
import { connection } from "next/server";

export default async function SettingsPage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const profileWithMemberships = await getProfileWithMemberships(profile.id);
  if (!profileWithMemberships) redirect("/login");

  const { memberships } = profileWithMemberships;
  const mfa = await getMfaStatus();
  const factors = (mfa?.verifiedFactors ?? []).map((f, i) => ({
    id: f.id,
    name: f.friendly_name || `Authenticator ${i + 1}`,
    createdAt: String(f.created_at),
  }));

  const roleLabels: Record<string, string> = {
    OWNER: "Owner",
    COMMITTEE: "Committee",
    ADVISER: "Adviser",
  };

  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage your profile and account preferences."
      />

      <div className="space-y-6 max-w-3xl">
        <Card>
          <CardHeader
            title="Profile"
            description="Your personal details."
          />
          <ProfileForm
            profile={{
              firstName: profileWithMemberships.firstName,
              lastName: profileWithMemberships.lastName,
              email: profileWithMemberships.email,
              phone: profileWithMemberships.phone,
            }}
          />
        </Card>

        {memberships.length > 0 && (
          <Card>
            <CardHeader
              title="Scheme Memberships"
              description="Schemes you are currently a member of."
            />
            <div className="divide-y divide-line -mx-6">
              {memberships.map((m) => (
                <div key={m.id} className="flex items-center justify-between px-6 py-3">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {m.schemeName}
                    </p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      Since {new Date(m.startDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <span className="inline-block rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-ink-muted">
                    {roleLabels[m.role] ?? m.role}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card>
          <CardHeader
            title="Security"
            description="Two-step sign-in with an authenticator app."
          />
          <SecuritySection factors={factors} mandatory={!!mfa?.mandatory} maxFactors={MAX_TOTP_FACTORS} />
        </Card>

        <Card>
          <CardHeader
            title="Account"
            description="Sign out of your StrataVerze account."
          />
          <SignOutButton />
        </Card>
      </div>
    </>
  );
}
