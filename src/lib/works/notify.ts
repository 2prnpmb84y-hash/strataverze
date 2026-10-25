/**
 * Works marketplace emails (25 Oct 2026). Each email goes to one person; a
 * failed email never undoes the change it reports (it is logged).
 */
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import { logError } from "@/lib/log";
import { worksEmail } from "@/lib/email-templates/works";
import { ROUTE_OUTCOMES, type RouteOutcome } from "./decision-rules";

async function people(profileIds: string[]) {
  if (!profileIds.length) return [];
  const rows = await db.orm.public.Profile.where((p) => p.id.in([...new Set(profileIds)])).limit(500).all();
  return rows.filter((p) => p.email).map((p) => ({ id: p.id, email: String(p.email), name: [p.firstName, p.lastName].filter(Boolean).join(" ") || "there" }));
}

async function roleMembers(schemeId: string, role: "COMMITTEE" | "ADVISER") {
  const rows = await db.orm.public.SchemeMembership.where((m) => and(m.schemeId.eq(schemeId), m.role.eq(role), m.isActive.eq(true))).limit(200).all();
  return rows.map((r) => r.profileId);
}

async function scheme(schemeId: string) {
  const s = await db.orm.public.Scheme.where((x) => x.id.eq(schemeId)).first();
  return { name: String(s?.name ?? "your building"), plan: String(s?.planNumber ?? "") };
}

async function send(list: Array<{ email: string; name: string }>, build: (p: { email: string; name: string }) => Parameters<typeof sendEmail>[0]) {
  for (const p of list) {
    try {
      await sendEmail(build(p));
    } catch (err) {
      logError("[works] email failed:", err);
    }
  }
}

const ownerLink = (id: string) => `${siteUrl()}/owner/works/${id}`;
const adviserLink = (schemeId: string, id: string) => `${siteUrl()}/adviser/schemes/${schemeId}/works/${id}`;

/** A new request: to the committee and the Adviser. */
export async function notifyRequestSubmitted(input: { schemeId: string; requestId: string; requestNumber: string; title: string; isEmergency: boolean; raisedById: string; resubmitted?: boolean }) {
  try {
    const s = await scheme(input.schemeId);
    const committee = (await people(await roleMembers(input.schemeId, "COMMITTEE"))).filter((p) => p.id !== input.raisedById);
    const advisers = (await people(await roleMembers(input.schemeId, "ADVISER"))).filter((p) => p.id !== input.raisedById);
    const urgent = input.isEmergency ? "Urgent: " : "";
    const what = input.resubmitted ? "has been changed and sent back to the committee" : "has been raised";
    await send(committee, (p) =>
      worksEmail({
        to: p.email,
        subject: `${urgent}Works request ${input.requestNumber} for ${s.name}`,
        heading: `${urgent}Works request for the committee`,
        lines: [`Hello ${p.name},`, `Works request ${input.requestNumber}, "${input.title}", ${what} for ${s.name}.`, input.isEmergency ? "It was reported as an emergency. Any one committee member can order urgent works." : "The committee decides how it is handled: get quotes, return it to the owner, or decline it."],
        buttonLabel: "Review the request",
        url: ownerLink(input.requestId),
      }),
    );
    await send(advisers, (p) =>
      worksEmail({
        to: p.email,
        subject: `${urgent}Works request ${input.requestNumber} for ${s.name}`,
        heading: `${urgent}New works request`,
        lines: [`Works request ${input.requestNumber}, "${input.title}", ${what} for ${s.name}. The committee decides how it is handled.`],
        buttonLabel: "Open the request",
        url: adviserLink(input.schemeId, input.requestId),
      }),
    );
  } catch (err) {
    logError("[works] request emails failed:", err);
  }
}

/** A proposal that needs more votes: to the committee members who have not voted. */
export async function notifyVoteNeeded(input: { schemeId: string; requestId: string; requestNumber: string; title: string; outcome: RouteOutcome; proposedById: string; votedIds: string[] }) {
  try {
    const s = await scheme(input.schemeId);
    const proposer = (await people([input.proposedById]))[0]?.name ?? "A committee member";
    const list = (await people(await roleMembers(input.schemeId, "COMMITTEE"))).filter((p) => !input.votedIds.includes(p.id));
    await send(list, (p) =>
      worksEmail({
        to: p.email,
        subject: `Your vote: works request ${input.requestNumber} for ${s.name}`,
        heading: "Your vote is needed",
        lines: [`Hello ${p.name},`, `${proposer} has proposed "${ROUTE_OUTCOMES[input.outcome].label}" for works request ${input.requestNumber}, "${input.title}", at ${s.name}.`, "Vote for or against in StrataVerze."],
        buttonLabel: "Vote",
        url: ownerLink(input.requestId),
      }),
    );
  } catch (err) {
    logError("[works] vote emails failed:", err);
  }
}

/** A decision made or not agreed: to whoever raised the request and the committee. */
export async function notifyDecision(input: { schemeId: string; requestId: string; requestNumber: string; title: string; outcome: RouteOutcome; status: "DECIDED" | "NOT_AGREED"; raisedById: string; returnReason: string | null; note: string | null; byDelegation: boolean }) {
  try {
    const s = await scheme(input.schemeId);
    const committeeIds = await roleMembers(input.schemeId, "COMMITTEE");
    if (input.status === "NOT_AGREED") {
      const list = await people(committeeIds);
      await send(list, (p) =>
        worksEmail({
          to: p.email,
          subject: `Not agreed: works request ${input.requestNumber} for ${s.name}`,
          heading: "The proposal was not agreed",
          lines: [`The proposal "${ROUTE_OUTCOMES[input.outcome].label}" for works request ${input.requestNumber}, "${input.title}", was not agreed. The request is waiting for the committee again.`],
          buttonLabel: "Open the request",
          url: ownerLink(input.requestId),
        }),
      );
      return;
    }
    const who = input.byDelegation ? "The Adviser, under the committee's delegation," : "The committee";
    const ownerLines: Record<RouteOutcome, string> = {
      URGENT: `${who} has approved urgent works for your request. A contractor is being arranged.`,
      QUOTES: `${who} has approved your request. Quotes are being sought from contractors.`,
      RETURN: `${who} has returned your request for more detail: ${input.returnReason ?? ""}`.trim(),
      DECLINE: `${who} has declined your request.${input.note ? ` The reason given: ${input.note}` : ""}`,
    };
    const raiser = (await people([input.raisedById]))[0];
    if (raiser) {
      await send([raiser], (p) =>
        worksEmail({
          to: p.email,
          subject: `Works request ${input.requestNumber}: ${ROUTE_OUTCOMES[input.outcome].label}`,
          heading: "Your works request",
          lines: [`Hello ${p.name},`, `Works request ${input.requestNumber}, "${input.title}", at ${s.name}.`, ownerLines[input.outcome]],
          buttonLabel: input.outcome === "RETURN" ? "Add the detail" : "See the request",
          url: ownerLink(input.requestId),
        }),
      );
    }
    const others = (await people(committeeIds)).filter((p) => p.id !== input.raisedById);
    await send(others, (p) =>
      worksEmail({
        to: p.email,
        subject: `Decided: works request ${input.requestNumber} for ${s.name}`,
        heading: "Works decision made",
        lines: [`${input.byDelegation ? "The Adviser, under delegation, decided" : "The committee agreed"} "${ROUTE_OUTCOMES[input.outcome].label}" for works request ${input.requestNumber}, "${input.title}".`],
        buttonLabel: "Open the request",
        url: ownerLink(input.requestId),
      }),
    );
    // Until urgent work orders and marketplace quotes are built (stages 2
    // and 3), the Adviser arranges the contractor or the quotes.
    const adviserNext: Record<RouteOutcome, string> = {
      URGENT: "Please arrange the contractor now.",
      QUOTES: "Please arrange the quotes.",
      RETURN: "The request has gone back to whoever raised it for more detail.",
      DECLINE: "The request is closed.",
    };
    const advisers = (await people(await roleMembers(input.schemeId, "ADVISER"))).filter((p) => p.id !== input.raisedById);
    await send(advisers, (p) =>
      worksEmail({
        to: p.email,
        subject: `Decided: works request ${input.requestNumber} for ${s.name}`,
        heading: "Works decision made",
        lines: [`${input.byDelegation ? "You decided, under the committee's delegation," : "The committee agreed"} "${ROUTE_OUTCOMES[input.outcome].label}" for works request ${input.requestNumber}, "${input.title}", at ${s.name}.`, adviserNext[input.outcome]],
        buttonLabel: "Open the request",
        url: adviserLink(input.schemeId, input.requestId),
      }),
    );
  } catch (err) {
    logError("[works] decision emails failed:", err);
  }
}
