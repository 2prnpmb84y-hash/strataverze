/**
 * Agenda item rules (pure).
 *
 * Enforces which resolution categories a meeting type may carry. A strata
 * committee cannot decide a matter that requires a special or unanimous
 * resolution or that is reserved to a general meeting (Act s 36(3)), so a
 * committee agenda item may only be an ordinary resolution.
 */
import { normaliseMeetingType } from "./setup";
import type { ResolutionCategory } from "./rules";

export const RESOLUTION_CATEGORIES: ResolutionCategory[] = [
  "ORDINARY",
  "SPECIAL",
  "UNANIMOUS",
  "SUSTAINABILITY_INFRASTRUCTURE",
];

const GENERAL_MEETING_CATEGORIES: ResolutionCategory[] = [
  "ORDINARY",
  "SPECIAL",
  "UNANIMOUS",
  "SUSTAINABILITY_INFRASTRUCTURE",
];

const COMMITTEE_CATEGORIES: ResolutionCategory[] = ["ORDINARY"];

/** The resolution categories permitted for a meeting type. */
export function allowedCategoriesForMeetingType(
  meetingType: string,
): ResolutionCategory[] {
  const type = normaliseMeetingType(meetingType);
  if (type === "COMMITTEE") return COMMITTEE_CATEGORIES;
  return GENERAL_MEETING_CATEGORIES;
}

/** Whether a resolution category may be placed on a meeting of this type. */
export function canAddCategoryToMeetingType(
  meetingType: string,
  category: string,
): boolean {
  return (allowedCategoriesForMeetingType(meetingType) as string[]).includes(
    category,
  );
}

export interface AgendaItemInput {
  title: string;
  resolutionText?: string | null;
  explanatoryNote?: string | null;
  resolutionCategory?: string | null;
}

/** Validate an agenda item against the meeting type. */
export function validateAgendaItem(
  input: AgendaItemInput,
  meetingType: string,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!input.title?.trim()) errors.title = "An agenda item title is required.";

  const category = input.resolutionCategory;
  if (category) {
    if (!(RESOLUTION_CATEGORIES as string[]).includes(category)) {
      errors.resolutionCategory = "Select a valid resolution category.";
    } else if (!canAddCategoryToMeetingType(meetingType, category)) {
      errors.resolutionCategory =
        "A strata committee cannot decide a matter that requires a special or unanimous resolution, or one reserved to a general meeting.";
    }
  }

  return errors;
}
