import { getCurrentProfile } from "@/lib/queries/profiles";
import { getCurrentSession } from "@/lib/auth/current-session";
import { ADDRESS_UNCONFIRMED, invitationAddressOf } from "@/lib/invitations/invitee-address";
import { getPendingInvitationsForEmail } from "@/lib/queries/invitations";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { InvitationActions } from "./invitation-actions";
import { db } from "@/prisma/db";
import { connection } from "next/server";

export default async function InvitationsPage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  // Listed by the session's Auth address, and only while the profile's copy
  // agrees with it (review finding L7; keeping them in step is S2e).
  const address = invitationAddressOf(await getCurrentSession());
  const invitations = address ? await getPendingInvitationsForEmail(address) : [];

  // Fetch scheme names for each invitation
  const schemeIds = [...new Set(invitations.map((i) => i.schemeId))];
  const schemes =
    schemeIds.length > 0
      ? await Promise.all(
          schemeIds.map((id) => db.orm.public.Scheme.first({ id })),
        )
      : [];
  const schemeMap = new Map(
    schemes
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .map((s) => [s.id, s.name]),
  );

  const roleLabel: Record<string, string> = {
    OWNER: "Owner",
    COMMITTEE: "Committee Member",
    ADVISER: "Adviser",
  };

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Invitations"
        description="Pending invitations to join schemes."
      />

      {!address ? (
        // Signed in, but the profile's copy of the address differs from the
        // Auth address: nothing is listed, and the person is told why (L-d).
        <Card>
          <div className="p-6 text-center" role="alert">
            <p className="text-sm text-ink">{ADDRESS_UNCONFIRMED}</p>
          </div>
        </Card>
      ) : invitations.length === 0 ? (
        <Card>
          <div className="p-6 text-center">
            <p className="text-sm text-ink-muted">
              You have no pending invitations.
            </p>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {invitations.map((inv) => {
            const schemeName = schemeMap.get(inv.schemeId) ?? "Unknown Scheme";
            const expiresDate = new Date(String(inv.expiresAt));

            return (
              <Card key={inv.id}>
                <div className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-heading font-semibold text-ink">
                        {schemeName}
                      </h3>
                      <p className="text-sm text-ink-muted mt-1">
                        You have been invited to join as{" "}
                        <span className="font-medium text-ink">
                          {roleLabel[inv.role] ?? inv.role}
                        </span>
                        .
                      </p>
                      <p className="text-xs text-ink-muted mt-2">
                        Expires{" "}
                        {expiresDate.toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <InvitationActions invitationId={inv.id} />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
