import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { getInvitationsForScheme } from "@/lib/queries/invitations";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { InviteForm } from "./invite-form";
import { RevokeButton } from "./revoke-button";
import { connection } from "next/server";

export default async function SchemeMembersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  // Verify current user is adviser on this scheme
  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const invitations = await getInvitationsForScheme(id);

  // Group members by role
  const owners = scheme.memberships.filter((m) => m.role === "OWNER");
  const committeeMembers = scheme.memberships.filter(
    (m) => m.role === "COMMITTEE",
  );
  const advisers = scheme.memberships.filter((m) => m.role === "ADVISER");

  const pendingInvitations = invitations.filter(
    (i) => i.status === "PENDING",
  );
  const pastInvitations = invitations.filter(
    (i) => i.status !== "PENDING",
  );

  const roleStyle: Record<string, string> = {
    OWNER: "bg-owner/10 text-owner",
    COMMITTEE: "bg-committee/10 text-committee",
    ADVISER: "bg-adviser/10 text-adviser",
  };

  const roleLabel: Record<string, string> = {
    OWNER: "Owner",
    COMMITTEE: "Committee",
    ADVISER: "Adviser",
  };

  const statusStyle: Record<string, string> = {
    PENDING: "bg-blue-100 text-blue-700",
    ACCEPTED: "bg-green-100 text-green-700",
    DECLINED: "bg-gray-100 text-gray-700",
    EXPIRED: "bg-gray-100 text-gray-500",
  };

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Members"
        description={`Manage members and invitations for ${scheme.name}.`}
        backHref={`/adviser/schemes/${id}/governance`}
        backLabel="Governance"
      />

      {/* Current Members */}
      <Card className="mb-6">
        <CardHeader
          title="Current Members"
          description={`${scheme.memberships.length} active member${scheme.memberships.length === 1 ? "" : "s"}.`}
        />

        {/* Advisers */}
        {advisers.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-2">
              Advisers
            </h3>
            <div className="flex flex-col gap-2">
              {advisers.map((m) => {
                const name =
                  `${m.profile.firstName} ${m.profile.lastName}`.trim() ||
                  m.profile.email;
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-ink">
                        {name}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {m.profile.email}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${roleStyle[m.role]}`}
                    >
                      {roleLabel[m.role]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Owners */}
        {owners.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-2">
              Owners
            </h3>
            <div className="flex flex-col gap-2">
              {owners.map((m) => {
                const name =
                  `${m.profile.firstName} ${m.profile.lastName}`.trim() ||
                  m.profile.email;
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-ink">
                        {name}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {m.profile.email}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${roleStyle[m.role]}`}
                    >
                      {roleLabel[m.role]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Committee */}
        {committeeMembers.length > 0 && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="text-xs font-medium text-ink-muted uppercase tracking-wide">
                Committee
              </h3>
              <a href={`/adviser/schemes/${id}/members/training`} className="text-xs text-turquoise underline">
                Committee training
              </a>
            </div>
            <div className="flex flex-col gap-2">
              {committeeMembers.map((m) => {
                const name =
                  `${m.profile.firstName} ${m.profile.lastName}`.trim() ||
                  m.profile.email;
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-ink">
                        {name}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {m.profile.email}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* The committee appoints its treasurer (an approver); advisers cannot. */}
                      {m.isTreasurer && (
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-muted text-ink">
                          Treasurer
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${roleStyle[m.role]}`}
                      >
                        {roleLabel[m.role]}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {owners.length === 0 && committeeMembers.length === 0 && (
          <p className="text-sm text-ink-muted">
            No owners or committee members yet. Send an invitation below.
          </p>
        )}
      </Card>

      {/* Invite New Member */}
      <Card className="mb-6">
        <CardHeader
          title="Invite Member"
          description="Send an invitation by email. The recipient will have 30 days to accept."
        />
        <InviteForm schemeId={id} />
      </Card>

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <Card className="mb-6">
          <CardHeader
            title="Pending Invitations"
            description={`${pendingInvitations.length} invitation${pendingInvitations.length === 1 ? "" : "s"} awaiting response.`}
          />
          <div className="flex flex-col gap-2">
            {pendingInvitations.map((inv) => {
              const expiresDate = new Date(String(inv.expiresAt));
              const isExpired = expiresDate < new Date();

              return (
                <div
                  key={inv.id}
                  className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {inv.email}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {roleLabel[inv.role]} ·{" "}
                      {isExpired
                        ? "Expired"
                        : `Expires ${expiresDate.toLocaleDateString("en-AU", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${isExpired ? statusStyle.EXPIRED : statusStyle.PENDING}`}
                    >
                      {isExpired ? "Expired" : "Pending"}
                    </span>
                    {!isExpired && (
                      <RevokeButton schemeId={id} invitationId={inv.id} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Past Invitations */}
      {pastInvitations.length > 0 && (
        <Card>
          <CardHeader
            title="Past Invitations"
            description="Previously sent invitations."
          />
          <div className="flex flex-col gap-2">
            {pastInvitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {inv.email}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {roleLabel[inv.role]} ·{" "}
                    {new Date(String(inv.createdAt)).toLocaleDateString(
                      "en-AU",
                      { day: "numeric", month: "short", year: "numeric" },
                    )}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[inv.status] ?? "bg-gray-100 text-gray-700"}`}
                >
                  {inv.status.charAt(0) + inv.status.slice(1).toLowerCase()}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
