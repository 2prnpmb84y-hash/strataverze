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

async function send<T extends { email: string; name: string }>(list: T[], build: (p: T) => Parameters<typeof sendEmail>[0]) {
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
        lines: [`Hello ${p.name},`, `Works request ${input.requestNumber}, "${input.title}", ${what} for ${s.name}.`, input.isEmergency ? "It was reported as urgent. The committee can order urgent works straight away." : "The committee decides how it is handled: get quotes, return it to the owner, or decline it."],
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
      URGENT: "The urgent work order goes to the preferred contractor for the trade. If there is none, choose one on the request page.",
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

type SettingsSummary = { approvalRule: string; urgentLimit: number | null; adviserMayDecide: boolean; adviserLimit: number | null };

function describeSettings(v: SettingsSummary): string[] {
  const dollars = (n: number | null) => (n == null ? "not set" : `$${n.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`);
  const rule: Record<string, string> = { ONE: "any one committee member", TWO: "two committee members", MAJORITY: "a majority of the committee" };
  return [
    `Who must agree: ${rule[v.approvalRule] ?? v.approvalRule}.`,
    `Urgent works limit: ${dollars(v.urgentLimit)}.`,
    `Adviser may decide: ${v.adviserMayDecide ? `yes, up to ${dollars(v.adviserLimit)}` : "no"}.`,
  ];
}

/** Works settings changed: to every committee member and the Adviser, so no change goes unseen. */
export async function notifySettingsChanged(input: { schemeId: string; changedById: string; before: SettingsSummary; after: SettingsSummary }) {
  try {
    const s = await scheme(input.schemeId);
    const by = (await people([input.changedById]))[0]?.name ?? "A committee member";
    const list = await people([...(await roleMembers(input.schemeId, "COMMITTEE")), ...(await roleMembers(input.schemeId, "ADVISER"))]);
    await send(list, (p) =>
      worksEmail({
        to: p.email,
        subject: `Works settings changed for ${s.name}`,
        heading: "Works settings changed",
        lines: [`${by} changed the works settings for ${s.name}.`, "Now:", ...describeSettings(input.after), "Before:", ...describeSettings(input.before), "If the committee did not agree this change, raise it with the committee."],
        buttonLabel: "See the settings",
        url: `${siteUrl()}/owner/works/settings`,
      }),
    );
  } catch (err) {
    logError("[works] settings emails failed:", err);
  }
}

// ─── Urgent work orders (stage 2) ──────────────────────────────────────────

const dollarsText = (n: number | null) => (n == null ? "" : `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/** A new urgent order: to the contractor's active contacts. */
export async function notifyOrderIssued(input: { schemeId: string; workOrderId: string; workOrderNumber: string; title: string; contractorBusinessId: string; amountLimit: number | null }) {
  try {
    const s = await scheme(input.schemeId);
    const contacts = await db.orm.public.ContractorContact.where((c) => and(c.contractorBusinessId.eq(input.contractorBusinessId), c.status.eq("ACTIVE"))).limit(20).all();
    // Only contacts who can sign in to answer it.
    const list = contacts.filter((c) => c.email && c.profileId).map((c) => ({ email: String(c.email), name: String(c.firstName || "there") }));
    await send(list, (p) =>
      worksEmail({
        to: p.email,
        subject: `Urgent work order ${input.workOrderNumber}: ${s.name}`,
        heading: "Urgent work order",
        lines: [`Hello ${p.name},`, `${s.name} has sent you urgent work order ${input.workOrderNumber}, "${input.title}".`, input.amountLimit != null ? `Not to exceed ${dollarsText(input.amountLimit)} without checking with the building first.` : "", "Please accept or decline it in StrataVerze as soon as you can."].filter(Boolean),
        buttonLabel: "Accept or decline",
        url: `${siteUrl()}/supplier/work-orders/${input.workOrderId}`,
      }),
    );
  } catch (err) {
    logError("[works] order emails failed:", err);
  }
}

/** The committee and the Adviser, each with the link to the request in their own portal. */
async function committeeAndAdvisers(schemeId: string, requestId: string | null) {
  const committee = (await people(await roleMembers(schemeId, "COMMITTEE"))).map((p) => ({ ...p, url: requestId ? ownerLink(requestId) : `${siteUrl()}/owner/works` }));
  const ids = new Set(committee.map((p) => p.id));
  const advisers = (await people(await roleMembers(schemeId, "ADVISER"))).filter((p) => !ids.has(p.id)).map((p) => ({ ...p, url: requestId ? adviserLink(schemeId, requestId) : `${siteUrl()}/adviser/schemes/${schemeId}/works` }));
  return [...committee, ...advisers];
}

/** No contractor to send an urgent order to: the committee and the Adviser pick one. */
export async function notifyNoContractor(input: { schemeId: string; requestId: string; requestNumber: string; title: string; trade: string | null }) {
  try {
    const s = await scheme(input.schemeId);
    await send(await committeeAndAdvisers(input.schemeId, input.requestId), (p) =>
      worksEmail({
        to: p.email,
        subject: `Choose a contractor: urgent request ${input.requestNumber}`,
        heading: "Urgent works need a contractor",
        lines: [`Urgent works were agreed for request ${input.requestNumber}, "${input.title}", at ${s.name}.`, `There is no approved preferred contractor for ${input.trade ?? "this kind of work"}, so no work order has gone out yet.`, "Open the request and choose a contractor."],
        buttonLabel: "Choose a contractor",
        url: p.url,
      }),
    );
  } catch (err) {
    logError("[works] no-contractor emails failed:", err);
  }
}

/** The contractor accepted or declined: to the committee and the Adviser. */
export async function notifyOrderAnswered(input: { schemeId: string; requestId: string | null; workOrderNumber: string; contractorName: string; accepted: boolean; reason: string | null }) {
  try {
    const s = await scheme(input.schemeId);
    await send(await committeeAndAdvisers(input.schemeId, input.requestId), (p) =>
      worksEmail({
        to: p.email,
        subject: `${input.accepted ? "Accepted" : "Declined"}: work order ${input.workOrderNumber} at ${s.name}`,
        heading: input.accepted ? "Work order accepted" : "Work order declined",
        lines: input.accepted
          ? [`${input.contractorName} has accepted urgent work order ${input.workOrderNumber} at ${s.name}.`]
          : [`${input.contractorName} has declined urgent work order ${input.workOrderNumber} at ${s.name}.`, input.reason ? `Their reason: ${input.reason}` : "", "Open the request and choose another contractor."].filter(Boolean),
        buttonLabel: "Open the request",
        url: p.url,
      }),
    );
  } catch (err) {
    logError("[works] order answer emails failed:", err);
  }
}

/** The building cancelled an order the contractor had not answered: to the contractor. */
export async function notifyOrderCancelled(input: { schemeId: string; workOrderNumber: string; contractorBusinessId: string }) {
  try {
    const s = await scheme(input.schemeId);
    const contacts = await db.orm.public.ContractorContact.where((c) => and(c.contractorBusinessId.eq(input.contractorBusinessId), c.status.eq("ACTIVE"))).limit(20).all();
    const list = contacts.filter((c) => c.email).map((c) => ({ email: String(c.email), name: String(c.firstName || "there") }));
    await send(list, (p) =>
      worksEmail({
        to: p.email,
        subject: `Cancelled: work order ${input.workOrderNumber} at ${s.name}`,
        heading: "Work order cancelled",
        lines: [`Hello ${p.name},`, `${s.name} has cancelled urgent work order ${input.workOrderNumber}, which had not been answered. Please do not attend.`],
        buttonLabel: "Your work orders",
        url: `${siteUrl()}/supplier/work-orders`,
      }),
    );
  } catch (err) {
    logError("[works] cancel emails failed:", err);
  }
}
