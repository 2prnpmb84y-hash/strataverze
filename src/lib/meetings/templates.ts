/**
 * Agenda templates and the motion library (rules-layer data).
 *
 * These are the seed defaults, defined in code so the agenda works before any
 * DB customisation exists (mirroring the meeting rule set pattern). The
 * `meeting_templates` and `motion_library_entries` tables are the
 * per-organisation override layer, read by the repo functions and layered over
 * these seeds in a later increment.
 *
 * The resolution wording follows the supplied Figma design and uses {{TOKENS}}
 * filled from the scheme. Statutory references in the explanatory notes are
 * template defaults for review, not asserted legal conclusions; see the
 * strategy doc section 4.
 */
import { rulePackFor, UnsupportedJurisdictionError } from "@/config/statutory";
import type { MeetingType, ResolutionCategory } from "./rules";

export interface TemplateAgendaItem {
  title: string;
  resolutionText: string;
  explanatoryNote?: string;
  resolutionCategory: ResolutionCategory;
}

export interface MotionLibraryEntry {
  key: string;
  category: string;
  title: string;
  resolutionText: string;
  explanatoryNote?: string;
  defaultResolutionCategory: ResolutionCategory;
  meetingTypes?: MeetingType[]; // undefined = any
}

const PLAN = "{{PLAN_NUMBER}}";

/** NSW AGM mandatory order of business (seed). */
export const NSW_AGM_TEMPLATE: TemplateAgendaItem[] = [
  {
    title: "Confirmation of Minutes",
    resolutionText: `The Owners - Strata Plan No. ${PLAN} RESOLVES by ordinary resolution that the minutes of the last General Meeting held on {{LAST_MEETING_DATE}} be approved.`,
    explanatoryNote:
      "Confirmation of the minutes of the previous general meeting (Schedule 1 of the Strata Schemes Management Act 2015 (NSW)).",
    resolutionCategory: "ORDINARY",
  },
  {
    title: "Accounting Records and Financial Statements",
    resolutionText: `The Owners - Strata Plan No. ${PLAN} RESOLVES by ordinary resolution to consider and adopt the account records and statements prepared for the most recent financial period.`,
    explanatoryNote:
      "Adoption of the financial statements for the most recent financial year.",
    resolutionCategory: "ORDINARY",
  },
  {
    title: "Audit",
    resolutionText: `The Owners - Strata Plan No. ${PLAN} RESOLVES by ordinary resolution to appoint an auditor to review the accounts and financial statements of the owners corporation for the coming financial year.`,
    explanatoryNote:
      "A large strata scheme, or a scheme whose annual budget exceeds the prescribed amount, must have its accounts and financial statements audited; optional for other schemes.",
    resolutionCategory: "ORDINARY",
  },
  {
    title: "Ten-Year Capital Works Fund Plan",
    resolutionText: `The Owners - Strata Plan No. ${PLAN} RESOLVES by ordinary resolution to revise or replace the plan for the capital works fund for the 10-year capital works fund plan.`,
    explanatoryNote:
      "The owners corporation must have a 10-year capital works fund plan and review it at least once every 5 years.",
    resolutionCategory: "ORDINARY",
  },
  {
    title: "Insurance",
    resolutionText: `The Owners - Strata Plan No. ${PLAN} RESOLVES by ordinary resolution to note the current insurances of the owners corporation and determine any additional insurances required.`,
    explanatoryNote:
      "Consideration of the owners corporation's insurances as required business at the AGM.",
    resolutionCategory: "ORDINARY",
  },
  {
    title: "Contributions to Administrative and Capital Works Funds",
    resolutionText: `The Owners - Strata Plan No. ${PLAN} RESOLVES by ordinary resolution to determine the estimated contributions to the administrative fund and the capital works fund for the coming financial year.`,
    explanatoryNote:
      "Estimates and levies for the administrative and capital works funds.",
    resolutionCategory: "ORDINARY",
  },
  {
    title: "Environmental Sustainability",
    resolutionText: `The Owners - Strata Plan No. ${PLAN} RESOLVES by ordinary resolution to consider matters concerning the environmental sustainability of the common property and the scheme.`,
    explanatoryNote:
      "Environmental sustainability item added to the mandatory AGM agenda by the 2025 reforms.",
    resolutionCategory: "ORDINARY",
  },
];

/** Motion library seed (from the design). */
export const NSW_MOTION_LIBRARY: MotionLibraryEntry[] = [
  {
    key: "confirmation-of-minutes",
    category: "General",
    title: "Confirmation of Minutes",
    resolutionText: `The Owners - Strata Plan No. ${PLAN} RESOLVES by ordinary resolution that the minutes of the last General Meeting held on {{LAST_MEETING_DATE}} be approved.`,
    explanatoryNote: "Required motion to confirm the previous minutes.",
    defaultResolutionCategory: "ORDINARY",
  },
  {
    key: "accounting-records",
    category: "Financial",
    title: "Accounting Records and Financial Statements",
    resolutionText: `The Owners - Strata Plan No. ${PLAN} RESOLVES by ordinary resolution to consider and adopt the account records and statements prepared for the most recent financial period.`,
    defaultResolutionCategory: "ORDINARY",
  },
  {
    key: "audit",
    category: "Financial",
    title: "Audit",
    resolutionText: `The Owners - Strata Plan No. ${PLAN} RESOLVES by ordinary resolution to appoint an auditor to review the accounts and financial statements of the owners corporation for the coming financial year.`,
    defaultResolutionCategory: "ORDINARY",
  },
  {
    key: "capital-works-plan",
    category: "Financial",
    title: "Ten-Year Capital Works Fund Plan",
    resolutionText: `The Owners - Strata Plan No. ${PLAN} RESOLVES by ordinary resolution to revise or replace the plan for the capital works fund for the 10-year capital works fund plan.`,
    defaultResolutionCategory: "ORDINARY",
  },
  {
    key: "by-law-amendment",
    category: "By-laws",
    title: "Amendment of By-laws",
    resolutionText: `The Owners - Strata Plan No. ${PLAN} RESOLVES by special resolution to add, amend or repeal a by-law in the terms tabled.`,
    explanatoryNote:
      "Adding, amending or repealing a by-law requires a special resolution.",
    defaultResolutionCategory: "SPECIAL",
    meetingTypes: ["AGM", "EGM"],
  },
];

/**
 * Agenda templates and motion libraries by state. A state with no entry here
 * has no templates: it never borrows the NSW wording (multi-jurisdiction plan,
 * phase 1).
 */
const TEMPLATES_BY_STATE: Readonly<Record<string, { agm: TemplateAgendaItem[]; motions: MotionLibraryEntry[] }>> = {
  NSW: { agm: NSW_AGM_TEMPLATE, motions: NSW_MOTION_LIBRARY },
};

function templatesFor(state: string) {
  const key = (state ?? "").trim().toUpperCase();
  if (!rulePackFor(key) || !Object.prototype.hasOwnProperty.call(TEMPLATES_BY_STATE, key)) {
    throw new UnsupportedJurisdictionError(key);
  }
  return TEMPLATES_BY_STATE[key];
}

/** The agenda template for a meeting type (seed; DB override is a later layer). */
export function getAgendaTemplate(
  state: string,
  meetingType: MeetingType,
): TemplateAgendaItem[] {
  const t = templatesFor(state);
  if (meetingType === "AGM" || meetingType === "FIRST_AGM") {
    return t.agm;
  }
  return [];
}

/** The motion library for a meeting type (seed; DB override is a later layer). */
export function getMotionLibrary(
  state: string,
  meetingType?: MeetingType,
): MotionLibraryEntry[] {
  const { motions } = templatesFor(state);
  if (!meetingType) return motions;
  return motions.filter(
    (m) => !m.meetingTypes || m.meetingTypes.includes(meetingType),
  );
}

/** Fill {{TOKENS}} in resolution text from scheme values. */
export function fillPlaceholders(
  text: string,
  values: { planNumber?: string; lastMeetingDate?: string },
): string {
  return text
    .replace(/\{\{PLAN_NUMBER\}\}/g, values.planNumber ?? "________")
    .replace(/\{\{LAST_MEETING_DATE\}\}/g, values.lastMeetingDate ?? "__/__/____");
}

export interface ResolvedAgendaItem {
  position: number;
  title: string;
  resolutionText: string;
  explanatoryNote?: string;
  resolutionCategory: ResolutionCategory;
}

/** The template for a meeting type, placeholders filled and positioned 1..n. */
export function resolveAgendaTemplate(
  state: string,
  meetingType: MeetingType,
  values: { planNumber?: string; lastMeetingDate?: string },
): ResolvedAgendaItem[] {
  return getAgendaTemplate(state, meetingType).map((item, i) => ({
    position: i + 1,
    title: item.title,
    resolutionText: fillPlaceholders(item.resolutionText, values),
    explanatoryNote: item.explanatoryNote,
    resolutionCategory: item.resolutionCategory,
  }));
}

/** A single motion-library entry resolved against scheme values. */
export function resolveMotion(
  entry: MotionLibraryEntry,
  values: { planNumber?: string; lastMeetingDate?: string },
) {
  return {
    title: entry.title,
    resolutionText: fillPlaceholders(entry.resolutionText, values),
    explanatoryNote: entry.explanatoryNote,
    resolutionCategory: entry.defaultResolutionCategory,
  };
}
