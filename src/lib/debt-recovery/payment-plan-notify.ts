/**
 * Payment plan emails. Each goes to one person; a failed email never undoes
 * the change it reports (it is logged).
 */
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import { logError } from "@/lib/log";
import { formatLotLabel } from "@/lib/format";
import { complianceEmail } from "@/lib/email-templates/compliance";

async function people(profileIds: string[]) {
  if (!profileIds.length) return [];
  const rows = await db.orm.public.Profile.where((p) => p.id.in([...new Set(profileIds)])).limit(500).all();
  return rows.filter((p) => p.email).map((p) => ({ id: p.id, email: String(p.email), name: [p.firstName, p.lastName].filter(Boolean).join(" ") || "there" }));
}

async function members(schemeId: string, role: "COMMITTEE" | "ADVISER" | "OWNER", lotId?: string) {
  const rows = await db.orm.public.SchemeMembership.where((m) => and(m.schemeId.eq(schemeId), m.role.eq(role), m.isActive.eq(true))).limit(500).all();
  return rows.filter((r) => !lotId || r.lotId === lotId).map((r) => r.profileId);
}

async function send(list: Array<{ email: string; name: string }>, build: (p: { email: string; name: string }) => Parameters<typeof sendEmail>[0]) {
  for (const p of list) {
    try {
      await sendEmail(build(p));
    } catch (err) {
      logError("[payment plans] email failed:", err);
    }
  }
}

/**
 * A new request: to the committee (who decide it at a meeting) and the
 * adviser. Committee members who own the lot are not sent it.
 */
export async function notifyPaymentPlanRequest(input: { schemeId: string; requestId: string; lotId: string; replyDueOn: string; submittedBy: string }) {
  try {
    const [scheme, lot, lotOwners] = await Promise.all([
      db.orm.public.Scheme.where((s) => s.id.eq(input.schemeId)).first(),
      db.orm.public.Lot.where((l) => l.id.eq(input.lotId)).first(),
      members(input.schemeId, "OWNER", input.lotId),
    ]);
    const name = String(scheme?.name ?? "your building");
    const lotLabel = formatLotLabel(String(lot?.lotNumber ?? ""));
    const skip = new Set([...lotOwners, input.submittedBy]);
    const committee = (await people(await members(input.schemeId, "COMMITTEE"))).filter((p) => !skip.has(p.id));
    const advisers = (await people(await members(input.schemeId, "ADVISER"))).filter((p) => !skip.has(p.id));
    const lines = [
      `The owner of ${lotLabel} at ${name} has asked for a payment plan for overdue levies.`,
      `It must be decided by a majority vote at a meeting of the owners corporation or the strata committee, and the owner given a written reply by ${input.replyDueOn}.`,
    ];
    await send(committee, (p) =>
      complianceEmail({ to: p.email, subject: `Payment plan request for ${lotLabel}, ${name}`, heading: "A payment plan request needs a decision", lines: [`Hello ${p.name},`, ...lines], buttonLabel: "Open StrataVerze", url: `${siteUrl()}/owner` }),
    );
    await send(advisers, (p) =>
      complianceEmail({ to: p.email, subject: `Payment plan request for ${lotLabel}, ${name}`, heading: "Payment plan request received", lines, buttonLabel: "Open the request", url: `${siteUrl()}/adviser/schemes/${input.schemeId}/finance/debt-recovery/payment-plans/${input.requestId}` }),
    );
  } catch (err) {
    logError("[payment plans] request emails failed:", err);
  }
}

/** A decision: to the lot's owners, pointing them to the portal. */
export async function notifyPaymentPlanDecision(input: { schemeId: string; requestId: string; approved: boolean }) {
  try {
    const request = await db.orm.public.PaymentPlanRequest.where((r) => r.id.eq(input.requestId)).first();
    if (!request) return;
    const [scheme, lot] = await Promise.all([
      db.orm.public.Scheme.where((s) => s.id.eq(input.schemeId)).first(),
      db.orm.public.Lot.where((l) => l.id.eq(request.lotId)).first(),
    ]);
    const owners = await people(await members(input.schemeId, "OWNER", request.lotId));
    const lotLabel = formatLotLabel(String(lot?.lotNumber ?? ""));
    await send(owners, (p) =>
      complianceEmail({
        to: p.email,
        subject: `Your payment plan request for ${lotLabel}`,
        heading: input.approved ? "Your payment plan was approved" : "Your payment plan request was not approved",
        lines: [
          `Hello ${p.name},`,
          input.approved
            ? `The payment plan you asked for for ${lotLabel} at ${String(scheme?.name ?? "your building")} was approved. The plan and its instalments are in the owner portal.`
            : `The payment plan you asked for for ${lotLabel} at ${String(scheme?.name ?? "your building")} was not approved. The reasons, and what you can do next, are in the owner portal.`,
        ],
        buttonLabel: "View in the owner portal",
        url: `${siteUrl()}/owner/levies/payment-plan`,
      }),
    );
  } catch (err) {
    logError("[payment plans] decision emails failed:", err);
  }
}

/**
 * The written reply is due soon or overdue: to the advisers and the
 * committee (not the lot's owners).
 */
export async function notifyPaymentPlanReplyDue(input: { schemeId: string; requestId: string; lotId: string; replyDueOn: string; overdue: boolean; decided: boolean }) {
  const [scheme, lot, lotOwners] = await Promise.all([
    db.orm.public.Scheme.where((s) => s.id.eq(input.schemeId)).first(),
    db.orm.public.Lot.where((l) => l.id.eq(input.lotId)).first(),
    members(input.schemeId, "OWNER", input.lotId),
  ]);
  const name = String(scheme?.name ?? "your building");
  const lotLabel = formatLotLabel(String(lot?.lotNumber ?? ""));
  const skip = new Set(lotOwners);
  const what = input.decided ? "The decision is recorded, but no written reply date has been." : "It has not been decided yet.";
  const when = input.overdue ? `The written reply was due by ${input.replyDueOn}.` : `The written reply is due by ${input.replyDueOn}.`;
  const subject = `${input.overdue ? "Overdue: " : ""}payment plan reply for ${lotLabel}, ${name}`;
  const committee = (await people(await members(input.schemeId, "COMMITTEE"))).filter((p) => !skip.has(p.id));
  const advisers = (await people(await members(input.schemeId, "ADVISER"))).filter((p) => !skip.has(p.id));
  await send(committee, (p) => complianceEmail({ to: p.email, subject, heading: "Payment plan request: reply due", lines: [`Hello ${p.name},`, `The payment plan request for ${lotLabel} at ${name}. ${what}`, when], buttonLabel: "Open StrataVerze", url: `${siteUrl()}/owner` }));
  await send(advisers, (p) =>
    complianceEmail({ to: p.email, subject, heading: "Payment plan request: reply due", lines: [`The payment plan request for ${lotLabel} at ${name}. ${what}`, when], buttonLabel: "Open the request", url: `${siteUrl()}/adviser/schemes/${input.schemeId}/finance/debt-recovery/payment-plans/${input.requestId}` }),
  );
}
