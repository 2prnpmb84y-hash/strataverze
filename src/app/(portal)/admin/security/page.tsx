import { connection } from "next/server";
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { requirePlatformAdminPage } from "@/lib/auth/require-access";
import { mfaMandatory } from "@/lib/auth/mfa-policy";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { ResetMfaForm } from "./reset-mfa-form";

/**
 * Two-step sign-in status for every user, and the administrator-assisted
 * reset for someone who has lost their authenticators. StrataVerze staff only.
 */
export default async function AdminSecurityPage() {
  await connection();
  const me = await requirePlatformAdminPage();

  const profiles = await db.orm.public.Profile.orderBy((p) => p.createdAt.asc()).limit(500).all();
  const memberships = await db.orm.public.SchemeMembership.where((m) => and(m.isActive.eq(true))).limit(5000).all();
  const admin = createAdminClient();

  const rows = await Promise.all(
    profiles.map(async (p) => {
      const { data } = await admin.auth.admin.mfa.listFactors({ userId: p.authId });
      const verified = (data?.factors ?? []).filter((f) => f.status === "verified").length;
      const mandatory = mfaMandatory(p.isPlatformAdmin, memberships.filter((m) => m.profileId === p.id));
      return { p, verified, mandatory };
    }),
  );

  return (
    <>
      <PageHeader title="Security" description="Two-step sign-in for every StrataVerze account." />
      <div className="max-w-3xl space-y-6">
        <Card>
          <CardHeader
            title="Two-step sign-in"
            description="Required for StrataVerze staff, advisers, accountants, payment authorisers and treasurers."
          />
          <ul className="divide-y divide-line -mx-6">
            {rows.map(({ p, verified, mandatory }) => {
              const name = [p.firstName, p.lastName].filter(Boolean).join(" ") || String(p.email);
              return (
                <li key={p.id} className="px-6 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{name}</p>
                      <p className="text-xs text-ink-muted truncate">{String(p.email)}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        verified > 0 ? "bg-mint-soft text-ink" : mandatory ? "bg-red-50 text-red-700" : "bg-muted text-ink-muted"
                      }`}
                    >
                      {verified > 0 ? `On (${verified})` : mandatory ? "Required, not set up" : "Off"}
                    </span>
                  </div>
                  {verified > 0 && p.id !== me.id && <ResetMfaForm profileId={p.id} name={name} />}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
