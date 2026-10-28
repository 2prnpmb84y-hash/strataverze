import { connection } from "next/server";
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { requirePlatformAdminPage } from "@/lib/auth/require-access";
import { mfaMandatory } from "@/lib/auth/mfa-policy";
import { PLATFORM_TIME_ZONE } from "@/lib/jurisdiction/time-zone";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { ResetMfaForm } from "./reset-mfa-form";
import { SignOutUserForm } from "./sign-out-user-form";

/**
 * Two-step sign-in status for every user, and the administrator-assisted
 * reset for someone who has lost their authenticators. StrataVerze staff only.
 */
export default async function AdminSecurityPage() {
  await connection();
  const me = await requirePlatformAdminPage();

  const profiles = await db.orm.public.Profile.orderBy((p) => p.createdAt.asc()).limit(500).all();
  const memberships = await db.orm.public.SchemeMembership.where((m) => and(m.isActive.eq(true))).limit(5000).all();
  // Sessions the app has seen and not ended (security stage S5).
  const openSessions = await db.orm.public.AppSession.where((s) => s.revokedAt.eq(null)).limit(5000).all();
  const admin = createAdminClient();

  const rows = await Promise.all(
    profiles.map(async (p) => {
      const { data } = await admin.auth.admin.mfa.listFactors({ userId: p.authId });
      const verified = (data?.factors ?? []).filter((f) => f.status === "verified").length;
      const mandatory = mfaMandatory(p.isPlatformAdmin, memberships.filter((m) => m.profileId === p.id));
      const mine = openSessions.filter((s) => s.profileId === p.id);
      const lastSeen = mine.map((s) => String(s.lastSeenAt)).sort().at(-1) ?? null;
      return { p, verified, mandatory, sessions: mine.length, lastSeen };
    }),
  );

  return (
    <>
      <PageHeader title="Security" description="Two-step sign-in for every StrataVerze account." />
      <div className="max-w-3xl space-y-6">
        <Card>
          <CardHeader
            title="Two-step sign-in and sessions"
            description="Two-step sign-in is required for StrataVerze staff, advisers, accountants, payment authorisers and treasurers. Their sessions end after 30 minutes idle or 12 hours; everyone else's after 4 hours idle or 14 days."
          />
          <ul className="divide-y divide-line -mx-6">
            {rows.map(({ p, verified, mandatory, sessions, lastSeen }) => {
              const name = [p.firstName, p.lastName].filter(Boolean).join(" ") || String(p.email);
              return (
                <li key={p.id} className="px-6 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{name}</p>
                      <p className="text-xs text-ink-muted truncate">{String(p.email)}</p>
                      <p className="text-xs text-ink-muted">
                        {sessions === 0
                          ? "No open sessions"
                          : `${sessions} open session${sessions === 1 ? "" : "s"}, last active ${new Date(lastSeen!).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: PLATFORM_TIME_ZONE })}`}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        verified > 0 ? "bg-mint-soft text-ink" : mandatory ? "bg-red-50 text-red-700" : "bg-muted text-ink-muted"
                      }`}
                    >
                      {verified > 0 ? `On (${verified})` : mandatory ? "Required, not set up" : "Off"}
                    </span>
                  </div>
                  {p.id !== me.id && (
                    <div className="mt-1 flex flex-wrap gap-4">
                      {verified > 0 && <ResetMfaForm profileId={p.id} name={name} />}
                      {sessions > 0 && <SignOutUserForm profileId={p.id} name={name} />}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
