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
import { isBeforeNotice } from "./lifecycle";
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

/**
 * Why an item of this category cannot be added to the agenda now, or null
 * (VIC, ACT and WA stage 2, PR 8b-iii, 29 Oct 2026). Only where the rule set
 * gives the category a longer notice (`categoryNoticeDays`, the ACT's
 * unanimous and unopposed resolutions): its notice is given with the meeting
 * notice, so once the notice is issued (the meeting is no longer before
 * notice) it cannot be added. NSW and Queensland have no such category, so
 * this is always null for them. Plain words, with no dash or semicolon.
 */
export function categoryNoticeAgendaRefusal(
  ruleSet: Pick<MeetingRuleSet, "categoryNoticeDays" | "resolutionLabels">,
  category: string | null | undefined,
  meetingStatus: string,
): string | null {
  const rule = category ? ruleSet.categoryNoticeDays?.[category as ResolutionCategory] : undefined;
  if (!rule || isBeforeNotice(meetingStatus)) return null;
  const name = (ruleSet.resolutionLabels[category as ResolutionCategory]?.full ?? String(category)).toLowerCase();
  const article = /^[aeiou]/.test(name) && !/^(?:unan|uni|use|usu)/.test(name) ? "An" : "A";
  return `${article} ${name} needs at least ${rule.days} days' notice, given with the notice of the meeting, so it cannot be added once the notice is issued. Nothing was saved.`;
}
