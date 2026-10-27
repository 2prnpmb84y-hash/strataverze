/**
 * Agenda item rules (pure).
 *
 * Enforces which resolution categories a meeting type may carry, from the
 * building's rule set (stage 2, step 7): a general meeting carries the
 * pack's `generalMeetingCategories`, a committee meeting its
 * `committeeCategories` (NSW: a strata committee cannot decide a matter that
 * requires a special or unanimous resolution or that is reserved to a
 * general meeting, Act s 36(3), so ordinary resolutions only).
 */
import { normaliseMeetingType } from "./setup";
import { isResolutionCategory, type MeetingRuleSet, type ResolutionCategory } from "./rules";

/** The parts of a rule set the agenda rules read. */
export type AgendaCategoryRules = Pick<
  MeetingRuleSet,
  "resolutionCategories" | "generalMeetingCategories" | "committeeCategories" | "committeeCategoryRefusal"
>;

/** The resolution categories permitted for a meeting type. */
export function allowedCategoriesForMeetingType(
  ruleSet: AgendaCategoryRules,
  meetingType: string,
): ResolutionCategory[] {
  const type = normaliseMeetingType(meetingType);
  if (type === "COMMITTEE") return [...ruleSet.committeeCategories];
  return [...ruleSet.generalMeetingCategories];
}

/** Whether a resolution category may be placed on a meeting of this type. */
export function canAddCategoryToMeetingType(
  ruleSet: AgendaCategoryRules,
  meetingType: string,
  category: string,
): boolean {
  return (allowedCategoriesForMeetingType(ruleSet, meetingType) as string[]).includes(
    category,
  );
}

export interface AgendaItemInput {
  title: string;
  resolutionText?: string | null;
  explanatoryNote?: string | null;
  resolutionCategory?: string | null;
}

/** Validate an agenda item against the meeting type and the building's rule set. */
export function validateAgendaItem(
  input: AgendaItemInput,
  meetingType: string,
  ruleSet: AgendaCategoryRules,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!input.title?.trim()) errors.title = "An agenda item title is required.";

  const category = input.resolutionCategory;
  if (category) {
    if (!isResolutionCategory(ruleSet, category)) {
      errors.resolutionCategory = "Select a valid resolution category.";
    } else if (!canAddCategoryToMeetingType(ruleSet, meetingType, category)) {
      errors.resolutionCategory =
        normaliseMeetingType(meetingType) === "COMMITTEE"
          ? ruleSet.committeeCategoryRefusal
          : "Select a valid resolution category.";
    }
  }

  return errors;
}
