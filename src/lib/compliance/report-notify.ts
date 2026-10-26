/** Strata Hub annual report reminders: to the advisers and the committee. Failures are logged. */
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import { logError } from "@/lib/log";
import { complianceEmail } from "@/lib/email-templates/compliance";

export async function notifyAnnualReportDue(input: { schemeId: string; schemeName: string; agmOn: string; dueOn: string; overdue: boolean; portal: string; penalty: string }) {
  const members = await db.orm.public.SchemeMembership.where((m) => and(m.schemeId.eq(input.schemeId), m.role.in(["ADVISER", "COMMITTEE"]), m.isActive.eq(true))).limit(200).all();
  const profiles = members.length ? await db.orm.public.Profile.where((p) => p.id.in([...new Set(members.map((m) => m.profileId))])).limit(200).all() : [];
  for (const p of profiles) {
    if (!p.email) continue;
    const adviser = members.some((m) => m.profileId === p.id && m.role === "ADVISER");
    try {
      await sendEmail(
        complianceEmail({
          to: String(p.email),
          subject: `${input.overdue ? "Overdue: " : ""}${input.portal} annual report for ${input.schemeName}`,
          heading: input.overdue ? "The annual report is overdue" : "The annual report is due",
          lines: [
            `The ${input.portal} annual report for ${input.schemeName}, after the AGM of ${input.agmOn}, ${input.overdue ? "was" : "is"} due by ${input.dueOn}${input.overdue ? " and no report is recorded in StrataVerze" : ""}.`,
            input.overdue ? input.penalty : adviser ? "Once it is made, record the date in StrataVerze so the reminders stop." : "Once it is made, tell your strata manager so they can record it in StrataVerze.",
          ],
          buttonLabel: adviser ? "Open the annual report" : "Open StrataVerze",
          url: adviser ? `${siteUrl()}/adviser/schemes/${input.schemeId}/governance/strata-hub` : `${siteUrl()}/owner`,
        }),
      );
    } catch (err) {
      logError("[annual report] email failed:", err);
    }
  }
}
