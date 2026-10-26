/**
 * Committee training reminders. Each email goes to one person; a failed
 * email is logged and never stops the rest.
 */
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import { logError } from "@/lib/log";
import { complianceEmail } from "@/lib/email-templates/compliance";
import type { TrainingRow } from "./committee-training-store";

async function trySend(email: Parameters<typeof sendEmail>[0]) {
  try {
    await sendEmail(email);
  } catch (err) {
    logError("[committee training] email failed:", err);
  }
}

/** Training due soon: to the member. */
export async function notifyTrainingDue(input: { schemeName: string; row: TrainingRow; course: string; consequence: string; helpUrl: string }) {
  if (!input.row.email) return;
  await trySend(
    complianceEmail({
      to: input.row.email,
      subject: `Committee training due by ${input.row.dueOn}, ${input.schemeName}`,
      heading: "Your committee training is due",
      lines: [
        `Hello ${input.row.name},`,
        `As a committee member of ${input.schemeName}, you need to complete ${input.course} by ${input.row.dueOn}. ${input.consequence}`,
        `When you have finished, record the date on your certificate in StrataVerze (Governance). It is recommended that you give a copy to the secretary. More information: ${input.helpUrl}`,
      ],
      buttonLabel: "Record your training",
      url: `${siteUrl()}/owner/governance`,
    }),
  );
}

/** Training overdue: to the member and the scheme's advisers. */
export async function notifyTrainingOverdue(input: { schemeId: string; schemeName: string; row: TrainingRow; consequence: string }) {
  const advisers = await db.orm.public.SchemeMembership.where((m) => and(m.schemeId.eq(input.schemeId), m.role.eq("ADVISER"), m.isActive.eq(true))).limit(50).all();
  const profiles = advisers.length ? await db.orm.public.Profile.where((p) => p.id.in(advisers.map((a) => a.profileId))).limit(50).all() : [];
  if (input.row.email) {
    await trySend(
      complianceEmail({
        to: input.row.email,
        subject: `Committee training overdue, ${input.schemeName}`,
        heading: "Your committee training is overdue",
        lines: [`Hello ${input.row.name},`, `No completion of your committee training for ${input.schemeName} has been recorded. It was due by ${input.row.dueOn}. ${input.consequence}`, "If you have completed it, record the date on your certificate in StrataVerze (Governance), and contact your strata manager."],
        buttonLabel: "Record your training",
        url: `${siteUrl()}/owner/governance`,
      }),
    );
  }
  for (const p of profiles) {
    if (!p.email || p.id === input.row.profileId) continue;
    await trySend(
      complianceEmail({
        to: String(p.email),
        subject: `Committee training overdue: ${input.row.name}, ${input.schemeName}`,
        heading: "Committee training overdue",
        lines: [`No committee training completion is recorded for ${input.row.name} at ${input.schemeName}; it was due by ${input.row.dueOn}. ${input.consequence}`, "Check the appointment date and with the member, then update the committee."],
        buttonLabel: "Open committee training",
        url: `${siteUrl()}/adviser/schemes/${input.schemeId}/members/training`,
      }),
    );
  }
}
