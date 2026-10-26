/**
 * Works marketplace emails (25 Oct 2026). Each email goes to one person; a
 * failed email never undoes the change it reports (it is logged).
 */
import { and } from "@prisma/orm-postgres/orm-client";
import { formatDateTimeIn } from "@/lib/jurisdiction/time-zone";
import { schemeTimeZone } from "@/lib/jurisdiction/scheme-time";
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

type SettingsSummary = { approvalRule: string; urgentLimit: number | null; adviserMayDecide: boolean; adviserLimit: number | null; adviserMayCodeInvoices?: boolean };

function describeSettings(v: SettingsSummary): string[] {
  const dollars = (n: number | null) => (n == null ? "not set" : `$${n.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`);
  const rule: Record<string, string> = { ONE: "any one committee member", TWO: "two committee members", MAJORITY: "a majority of the committee" };
  return [
    `Who must agree: ${rule[v.approvalRule] ?? v.approvalRule}.`,
    `Urgent works limit: ${dollars(v.urgentLimit)}.`,
    `Adviser may decide: ${v.adviserMayDecide ? `yes, up to ${dollars(v.adviserLimit)}` : "no"}.`,
    `Adviser may choose the fund and account for works invoices: ${v.adviserMayCodeInvoices ? "yes" : "no"}.`,
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

// ─── Marketplace quotes (stage 3) ──────────────────────────────────────────

/** Contacts who can sign in, of these businesses. */
async function contractorContacts(businessIds: string[]) {
  if (!businessIds.length) return [];
  const contacts = await db.orm.public.ContractorContact.where((c) => and(c.contractorBusinessId.in([...new Set(businessIds)]), c.status.eq("ACTIVE"))).limit(1000).all();
  const seen = new Set<string>();
  return contacts
    .filter((c) => c.email && c.profileId && !seen.has(String(c.email).toLowerCase()) && seen.add(String(c.email).toLowerCase()))
    .map((c) => ({ email: String(c.email), name: String(c.firstName || "there"), businessId: c.contractorBusinessId }));
}

const supplierJob = (rfqId: string) => `${siteUrl()}/supplier/quotes/${rfqId}`;
/** A deadline as the building's local time, for an email. */
const localDeadline = (tz: string, iso: string) => formatDateTimeIn(tz, iso, { weekday: "short", year: undefined });

/** A new job on the marketplace: to contractors who list the trade and work in the postcode. */
export async function notifyRfqOpened(input: { schemeId: string; rfqId: string; title: string; trade: string; suburb: string | null; interestClosesAt: string; businessIds: string[] }) {
  try {
    const tz = await schemeTimeZone(input.schemeId);
    await send(await contractorContacts(input.businessIds), (p) =>
      worksEmail({
        to: p.email,
        subject: `New job: ${input.trade}${input.suburb ? ` in ${input.suburb}` : ""}`,
        heading: "A building is looking for quotes",
        lines: [`Hello ${p.name},`, `"${input.title}": ${input.trade}${input.suburb ? `, ${input.suburb}` : ""}.`, `If you would like to quote, say you are interested by ${localDeadline(tz, input.interestClosesAt)}. The committee then chooses who to invite.`],
        buttonLabel: "See the job",
        url: supplierJob(input.rfqId),
      }),
    );
  } catch (err) {
    logError("[works] job emails failed:", err);
  }
}

/** Invited to quote: to the invited contractors. */
export async function notifyInvited(input: { schemeId: string; rfqId: string; rfqNumber: string; title: string; businessIds: string[]; quoteClosesAt: string }) {
  try {
    const tz = await schemeTimeZone(input.schemeId);
    const s = await scheme(input.schemeId);
    await send(await contractorContacts(input.businessIds), (p) =>
      worksEmail({
        to: p.email,
        subject: `Invited to quote: ${input.title}`,
        heading: "You are invited to quote",
        lines: [`Hello ${p.name},`, `${s.name} has invited you to quote for "${input.title}" (${input.rfqNumber}).`, `Quotes close ${localDeadline(tz, input.quoteClosesAt)}. The address and a contact are now on the job page.`],
        buttonLabel: "See the job and quote",
        url: supplierJob(input.rfqId),
      }),
    );
  } catch (err) {
    logError("[works] invitation emails failed:", err);
  }
}

/** Interest has closed: to the committee and the Adviser, with what to do next. */
export async function notifyInterestClosed(input: { schemeId: string; requestId: string | null; rfqNumber: string; interested: number }) {
  try {
    const s = await scheme(input.schemeId);
    await send(await committeeAndAdvisers(input.schemeId, input.requestId), (p) =>
      worksEmail({
        to: p.email,
        subject: input.interested ? `${input.interested} interested: choose who to invite (${input.rfqNumber})` : `No contractor interest yet (${input.rfqNumber})`,
        heading: input.interested ? "Choose who to invite" : "No contractor has expressed interest",
        lines: input.interested
          ? [`${input.interested} contractor${input.interested === 1 ? " has" : "s have"} expressed interest in ${input.rfqNumber} at ${s.name}.`, "Open the request and choose who to invite to quote."]
          : [`No contractor has expressed interest in ${input.rfqNumber} at ${s.name} by the deadline.`, "You can extend the deadline, or invite an approved contractor directly."],
        buttonLabel: "Open the request",
        url: p.url,
      }),
    );
  } catch (err) {
    logError("[works] interest emails failed:", err);
  }
}

/** Quotes are in (all invited contractors quoted, or the deadline passed): to the committee and the Adviser. */
export async function notifyQuotesIn(input: { schemeId: string; requestId: string | null; rfqNumber: string; quotes: number; allIn: boolean }) {
  try {
    const s = await scheme(input.schemeId);
    await send(await committeeAndAdvisers(input.schemeId, input.requestId), (p) =>
      worksEmail({
        to: p.email,
        subject: `${input.allIn ? "All quotes are in" : "Quotes have closed"}: ${input.rfqNumber} at ${s.name}`,
        heading: input.allIn ? "All quotes are in" : "Quotes have closed",
        lines: [`${input.quotes} quote${input.quotes === 1 ? "" : "s"} received for ${input.rfqNumber} at ${s.name}.`, "Open the request to compare them and propose one to approve. The committee votes on it."],
        buttonLabel: "Compare the quotes",
        url: p.url,
      }),
    );
  } catch (err) {
    logError("[works] quotes-in emails failed:", err);
  }
}

/** A quote proposed for approval: to the committee members who have not voted. */
export async function notifyQuoteVote(input: { schemeId: string; requestId: string; requestNumber: string; contractorName: string; amount: number; proposedById: string }) {
  try {
    const s = await scheme(input.schemeId);
    const proposer = (await people([input.proposedById]))[0]?.name ?? "A committee member";
    const list = (await people(await roleMembers(input.schemeId, "COMMITTEE"))).filter((p) => p.id !== input.proposedById);
    await send(list, (p) =>
      worksEmail({
        to: p.email,
        subject: `Your vote: approve a quote for ${input.requestNumber} at ${s.name}`,
        heading: "Your vote is needed",
        lines: [`Hello ${p.name},`, `${proposer} has proposed approving the quote from ${input.contractorName} for ${dollarsText(input.amount)} for works request ${input.requestNumber}.`, "Compare the quotes and vote for or against in StrataVerze."],
        buttonLabel: "Vote",
        url: ownerLink(input.requestId),
      }),
    );
  } catch (err) {
    logError("[works] quote vote emails failed:", err);
  }
}

/** A quote approved: to the committee and Adviser, and whoever raised the request. */
export async function notifyQuoteApproved(input: { schemeId: string; requestId: string; requestNumber: string; title: string; contractorName: string; amount: number; raisedById: string; byDelegation: boolean }) {
  try {
    const s = await scheme(input.schemeId);
    const who = input.byDelegation ? "The Adviser, under the committee's delegation," : "The committee";
    await send(await committeeAndAdvisers(input.schemeId, input.requestId), (p) =>
      worksEmail({
        to: p.email,
        subject: `Quote approved: ${input.requestNumber} at ${s.name}`,
        heading: "Quote approved",
        lines: [`${who} approved the quote from ${input.contractorName} for ${dollarsText(input.amount)} for works request ${input.requestNumber}, "${input.title}".`, "The work order has gone to the contractor to accept."],
        buttonLabel: "Open the request",
        url: p.url,
      }),
    );
    const raiser = (await people([input.raisedById]))[0];
    if (raiser) {
      await send([raiser], (p) =>
        worksEmail({
          to: p.email,
          subject: `Works request ${input.requestNumber}: a contractor has been chosen`,
          heading: "Your works request",
          lines: [`Hello ${p.name},`, `${who} has approved a quote for works request ${input.requestNumber}, "${input.title}", at ${s.name}. The contractor is confirming the job.`],
          buttonLabel: "See the request",
          url: ownerLink(input.requestId),
        }),
      );
    }
  } catch (err) {
    logError("[works] quote approved emails failed:", err);
  }
}

/** The chosen contractor accepted, so the others were not selected: thank them. */
export async function notifyNotSelected(input: { schemeId: string; title: string; businessIds: string[] }) {
  try {
    const s = await scheme(input.schemeId);
    await send(await contractorContacts(input.businessIds), (p) =>
      worksEmail({
        to: p.email,
        subject: `Not selected this time: ${input.title}`,
        heading: "Thank you for quoting",
        lines: [`Hello ${p.name},`, `${s.name} has gone ahead with another quote for "${input.title}". Thank you for quoting.`],
        buttonLabel: "Your quote requests",
        url: `${siteUrl()}/supplier/quotes`,
      }),
    );
  } catch (err) {
    logError("[works] not-selected emails failed:", err);
  }
}

/** A job taken off the marketplace: to the contractors interested or invited. */
export async function notifyRfqCancelled(input: { schemeId: string; title: string; businessIds: string[] }) {
  try {
    const s = await scheme(input.schemeId);
    await send(await contractorContacts(input.businessIds), (p) =>
      worksEmail({
        to: p.email,
        subject: `No longer going ahead: ${input.title}`,
        heading: "This job is no longer going ahead",
        lines: [`Hello ${p.name},`, `${s.name} is no longer seeking quotes for "${input.title}". Thank you for your interest.`],
        buttonLabel: "Your quote requests",
        url: `${siteUrl()}/supplier/quotes`,
      }),
    );
  } catch (err) {
    logError("[works] job cancelled emails failed:", err);
  }
}


// ─── Completion, invoice and payment (stage 4) ─────────────────────────────

const supplierOrder = (workOrderId: string) => `${siteUrl()}/supplier/work-orders/${workOrderId}`;

/** The contractor reported the work done: to the committee and the Adviser to confirm it. */
export async function notifyCompletionReported(input: { schemeId: string; requestId: string; workOrderNumber: string; contractorName: string }) {
  try {
    const s = await scheme(input.schemeId);
    await send(await committeeAndAdvisers(input.schemeId, input.requestId), (p) =>
      worksEmail({
        to: p.email,
        subject: `Work reported done: ${input.workOrderNumber} at ${s.name}`,
        heading: "Please check the work",
        lines: [`${input.contractorName} says the work for order ${input.workOrderNumber} at ${s.name} is done.`, "Check it, then confirm it or send it back with what still needs doing. A committee member or the Adviser can do this."],
        buttonLabel: "Check the work",
        url: p.url,
      }),
    );
  } catch (err) {
    logError("[works] completion emails failed:", err);
  }
}

/** The building confirmed the work or sent it back: to the contractor. */
export async function notifyCompletionAnswered(input: { schemeId: string; workOrderId: string; workOrderNumber: string; contractorBusinessId: string; accepted: boolean; comments: string | null }) {
  try {
    const s = await scheme(input.schemeId);
    await send(await contractorContacts([input.contractorBusinessId]), (p) =>
      worksEmail({
        to: p.email,
        subject: `${input.accepted ? "Work confirmed" : "More work needed"}: ${input.workOrderNumber} at ${s.name}`,
        heading: input.accepted ? "The building has confirmed the work" : "The building has sent the job back",
        lines: input.accepted
          ? [`Hello ${p.name},`, `${s.name} has confirmed the work for order ${input.workOrderNumber} is done.`, "If you have not invoiced it yet, send your invoice in StrataVerze."]
          : [`Hello ${p.name},`, `${s.name} says the work for order ${input.workOrderNumber} is not finished yet.`, input.comments ? `What they said: ${input.comments}` : "", "When it is done, report it done again in StrataVerze."].filter(Boolean),
        buttonLabel: "Open the work order",
        url: supplierOrder(input.workOrderId),
      }),
    );
  } catch (err) {
    logError("[works] completion answer emails failed:", err);
  }
}

/** A new invoice: to the committee and the Adviser. */
export async function notifyInvoiceSubmitted(input: { schemeId: string; requestId: string; workOrderNumber: string; contractorName: string; total: number; overLimit: boolean; amountLimit: number | null }) {
  try {
    const s = await scheme(input.schemeId);
    await send(await committeeAndAdvisers(input.schemeId, input.requestId), (p) =>
      worksEmail({
        to: p.email,
        subject: `Invoice from ${input.contractorName}: ${input.workOrderNumber} at ${s.name}`,
        heading: "A contractor has invoiced",
        lines: [
          `${input.contractorName} has invoiced ${dollarsText(input.total)} for work order ${input.workOrderNumber} at ${s.name}.`,
          input.overLimit ? `That is more than the ${dollarsText(input.amountLimit)} the work order allowed. The committee must agree the extra before it can be paid, or send the invoice back.` : "",
          "Once the work is confirmed done, a committee member chooses the fund and account, and it goes for the building's usual payment approvals.",
        ].filter(Boolean),
        buttonLabel: "Open the request",
        url: p.url,
      }),
    );
  } catch (err) {
    logError("[works] invoice emails failed:", err);
  }
}

/** The building sent an invoice back: to the contractor. */
export async function notifyInvoiceReturned(input: { schemeId: string; workOrderId: string; invoiceNumber: string; contractorBusinessId: string; reason: string }) {
  try {
    const s = await scheme(input.schemeId);
    await send(await contractorContacts([input.contractorBusinessId]), (p) =>
      worksEmail({
        to: p.email,
        subject: `Invoice ${input.invoiceNumber} sent back by ${s.name}`,
        heading: "Your invoice was sent back",
        lines: [`Hello ${p.name},`, `${s.name} has sent back invoice ${input.invoiceNumber}.`, `Their reason: ${input.reason}`, "You can send a corrected invoice in StrataVerze."],
        buttonLabel: "Open the work order",
        url: supplierOrder(input.workOrderId),
      }),
    );
  } catch (err) {
    logError("[works] invoice returned emails failed:", err);
  }
}

/** Extra cost proposed: to the committee members who have not voted. */
export async function notifyVariationVote(input: { schemeId: string; requestId: string; requestNumber: string; contractorName: string; total: number; limit: number | null; proposedById: string }) {
  try {
    const s = await scheme(input.schemeId);
    const proposer = (await people([input.proposedById]))[0]?.name ?? "A committee member";
    const list = (await people(await roleMembers(input.schemeId, "COMMITTEE"))).filter((p) => p.id !== input.proposedById);
    await send(list, (p) =>
      worksEmail({
        to: p.email,
        subject: `Your vote: extra cost for ${input.requestNumber} at ${s.name}`,
        heading: "Your vote is needed",
        lines: [`Hello ${p.name},`, `${proposer} has proposed agreeing the invoice from ${input.contractorName} for ${dollarsText(input.total)} for works request ${input.requestNumber}. The work order allowed ${dollarsText(input.limit)}.`, "Read the contractor's reason and vote for or against in StrataVerze."],
        buttonLabel: "Vote",
        url: ownerLink(input.requestId),
      }),
    );
  } catch (err) {
    logError("[works] variation vote emails failed:", err);
  }
}

/** The extra cost was agreed or not: to the committee and the Adviser. */
export async function notifyVariationDecided(input: { schemeId: string; requestId: string; requestNumber: string; agreed: boolean; byDelegation: boolean }) {
  try {
    const s = await scheme(input.schemeId);
    const who = input.byDelegation ? "The Adviser, under the committee's delegation," : "The committee";
    await send(await committeeAndAdvisers(input.schemeId, input.requestId), (p) =>
      worksEmail({
        to: p.email,
        subject: `Extra cost ${input.agreed ? "agreed" : "not agreed"}: ${input.requestNumber} at ${s.name}`,
        heading: input.agreed ? "Extra cost agreed" : "Extra cost not agreed",
        lines: input.agreed
          ? [`${who} agreed the contractor's invoice for works request ${input.requestNumber}, though it is more than the work order allowed.`, "It can now be sent for payment approval once the work is confirmed done."]
          : [`The committee did not agree the extra cost on the contractor's invoice for works request ${input.requestNumber}.`, "Send the invoice back to the contractor, saying what the building will pay."],
        buttonLabel: "Open the request",
        url: p.url,
      }),
    );
  } catch (err) {
    logError("[works] variation decided emails failed:", err);
  }
}

/** An invoice sent to finance: to the building's payment approvers, and the contractor. */
export async function notifyInvoiceWithFinance(input: { schemeId: string; workOrderId: string; invoiceNumber: string; contractorName: string; contractorBusinessId: string; total: number; preparedById: string; approverIds: string[] }) {
  try {
    const s = await scheme(input.schemeId);
    const approvers = (await people(input.approverIds)).filter((p) => p.id !== input.preparedById);
    await send(approvers, (p) =>
      worksEmail({
        to: p.email,
        subject: `Payment to approve: ${input.contractorName}, ${dollarsText(input.total)}`,
        heading: "A works invoice is waiting for your approval",
        lines: [`Hello ${p.name},`, `Invoice ${input.invoiceNumber} from ${input.contractorName} for ${dollarsText(input.total)} at ${s.name} is waiting for payment approval. The work has been confirmed done.`],
        buttonLabel: "Payment approvals",
        url: `${siteUrl()}/owner/finance/approvals`,
      }),
    );
    await send(await contractorContacts([input.contractorBusinessId]), (p) =>
      worksEmail({
        to: p.email,
        subject: `Invoice ${input.invoiceNumber} accepted by ${s.name}`,
        heading: "Your invoice is with the building's finance",
        lines: [`Hello ${p.name},`, `${s.name} has checked invoice ${input.invoiceNumber} and sent it for payment approval. You will be emailed when it is paid.`],
        buttonLabel: "Your invoices",
        url: `${siteUrl()}/supplier/invoices`,
      }),
    );
  } catch (err) {
    logError("[works] with-finance emails failed:", err);
  }
}

/** Finance approved, paid or cancelled a works invoice: to the contractor. */
export async function notifyWorksInvoiceFinance(input: { worksInvoiceId: string; status: string }) {
  try {
    const w = await db.orm.public.WorksInvoice.where((x) => x.id.eq(input.worksInvoiceId)).first();
    if (!w) return;
    const s = await scheme(w.schemeId);
    const number = String(w.invoiceNumber);
    const text: Record<string, { subject: string; heading: string; line: string } | undefined> = {
      APPROVED: { subject: `Invoice ${number} approved by ${s.name}`, heading: "Your invoice is approved", line: `${s.name} has approved invoice ${number} for payment.` },
      PARTIALLY_PAID: { subject: `Part payment of invoice ${number} from ${s.name}`, heading: "Part payment recorded", line: `${s.name} has recorded a payment of part of invoice ${number}. ${dollarsText(Number(w.paidAmount ?? 0))} has been paid so far.` },
      PAID: { subject: `Invoice ${number} paid by ${s.name}`, heading: "Your invoice has been paid", line: `${s.name} has recorded invoice ${number} as paid, ${dollarsText(Number(w.paidAmount ?? 0))}. Allow for normal bank processing times.` },
      CANCELLED: { subject: `Invoice ${number} cancelled by ${s.name}`, heading: "Your invoice was cancelled", line: `${s.name} has cancelled invoice ${number} in its accounts. Contact the building if you are not sure why. You can send a new invoice for the job in StrataVerze.` },
    };
    const t = text[input.status];
    if (!t) return;
    await send(await contractorContacts([w.contractorBusinessId]), (p) =>
      worksEmail({
        to: p.email,
        subject: t.subject,
        heading: t.heading,
        lines: [`Hello ${p.name},`, t.line],
        buttonLabel: "Your invoices",
        url: `${siteUrl()}/supplier/invoices`,
      }),
    );
  } catch (err) {
    logError("[works] finance emails failed:", err);
  }
}
