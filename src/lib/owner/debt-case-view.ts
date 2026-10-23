/**
 * Who may open a debt recovery case in the owner portal, and what the debtor
 * sees (pure). Findings: the owner case page showed the debtor the internal
 * notes, step evidence notes, solicitor details and draft documents, and a
 * FORMER owner kept access indefinitely.
 *
 * - Committee members of the case's scheme see the full case (unless they
 *   are the debtor: nobody acts on, or sees the internal file of, their own case).
 * - The debtor sees the case summary, the payment plan and instalments, and
 *   issued (non-draft) notices addressed to them, while they hold an OWNER
 *   membership for the lot or held one that ended within the last 30 days.
 */

export const FORMER_OWNER_GRACE_DAYS = 30;

/** Notices and agreements sent to the debtor. Internal papers (committee reports, solicitor referrals, filings, correspondence) are not. */
export const DEBTOR_DOCUMENT_TYPES: readonly string[] = [
  "ARREARS_REMINDER",
  "DEMAND_NOTICE",
  "FINAL_DEMAND",
  "STATUTORY_NOTICE",
  "PAYMENT_PLAN_AGREEMENT",
];

export type CaseForViewer = { schemeId: string; lotId: string; ownerId: string };

export type MembershipForCase = {
  schemeId: string;
  lotId: string | null;
  role: string;
  isActive: boolean;
  endDate?: unknown;
};

/** Whether the profile is on the committee of the case's scheme (active). */
export function isCommitteeOfCaseScheme(caseRow: CaseForViewer, memberships: readonly MembershipForCase[]): boolean {
  return memberships.some((m) => m.isActive && m.role === "COMMITTEE" && m.schemeId === caseRow.schemeId);
}

/**
 * Whether the profile is the debtor and still (or within the grace period)
 * an owner of the case's lot.
 */
export function debtorMayView(
  caseRow: CaseForViewer,
  profileId: string,
  memberships: readonly MembershipForCase[],
  now: Date = new Date(),
): boolean {
  if (!profileId || caseRow.ownerId !== profileId) return false;
  const graceMs = FORMER_OWNER_GRACE_DAYS * 24 * 60 * 60 * 1000;
  return memberships.some((m) => {
    if (m.role !== "OWNER" || m.schemeId !== caseRow.schemeId || m.lotId !== caseRow.lotId) return false;
    if (m.isActive) return true;
    if (m.endDate == null || m.endDate === "") return false;
    const ended = new Date(String(m.endDate)).getTime();
    return !Number.isNaN(ended) && ended <= now.getTime() + 60_000 && now.getTime() - ended <= graceMs;
  });
}

export type CaseViewer = "committee" | "debtor" | null;

/** Which view, if any, the profile gets. */
export function caseViewerFor(
  caseRow: CaseForViewer,
  profileId: string,
  memberships: readonly MembershipForCase[],
  now: Date = new Date(),
): CaseViewer {
  const isDebtor = caseRow.ownerId === profileId;
  if (!isDebtor && isCommitteeOfCaseScheme(caseRow, memberships)) return "committee";
  if (debtorMayView(caseRow, profileId, memberships, now)) return "debtor";
  return null;
}

type SerialisedCase = {
  solicitorName: string | null;
  solicitorRef: string | null;
  courtFileNumber: string | null;
  disputeDetails: string | null;
  hardshipDetails: string | null;
  notes: string | null;
  steps: Array<{ evidenceNotes: string | null; outcome: string | null }>;
  documents: Array<{ documentType: string; isDraft: boolean }>;
  activities: unknown[];
};

/** The debtor's view: summary, plan and instalments, and issued notices to them. */
export function debtorCaseView<T extends SerialisedCase>(full: T): T {
  return {
    ...full,
    solicitorName: null,
    solicitorRef: null,
    courtFileNumber: null,
    disputeDetails: null,
    hardshipDetails: null,
    notes: null,
    steps: full.steps.map((s) => ({ ...s, evidenceNotes: null, outcome: null })),
    documents: full.documents.filter((d) => !d.isDraft && DEBTOR_DOCUMENT_TYPES.includes(d.documentType)),
    activities: [],
  };
}
