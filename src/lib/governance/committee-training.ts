/**
 * Strata committee training status (pure). The rules come from the
 * building's rule pack (`rules.COMMITTEE_TRAINING`): from the start date,
 * each member appointed must complete the training within the set months of
 * appointment, unless the scheme or the member is exempt.
 */
import { addMonths } from "@/lib/levies/notice-plan";

export interface TrainingRules {
  startsOn: string;
  withinMonths: number;
  exemptLotCount: number;
}

export const TRAINING_EXEMPTIONS = ["ACSL_MEMBER", "STRATA_MANAGING_AGENT", "CASUAL_VACANCY_SHORT"] as const;
export type TrainingExemption = (typeof TRAINING_EXEMPTIONS)[number];
export const isTrainingExemption = (v: unknown): v is TrainingExemption => TRAINING_EXEMPTIONS.includes(v as TrainingExemption);

export type TrainingStatus = "SCHEME_EXEMPT" | "EXEMPT" | "TRAINED" | "NOT_YET_REQUIRED" | "DUE" | "OVERDUE";

export interface TrainingInput {
  appointedOn: string;
  completedOn: string | null;
  exemption: string | null;
  schemeLots: number;
  today: string;
}

const dayMs = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / dayMs);

/** The last day to complete the training for an appointment. */
export function trainingDueOn(appointedOn: string, rules: Pick<TrainingRules, "withinMonths">): string {
  return addMonths(appointedOn, rules.withinMonths);
}

export function trainingStatus(input: TrainingInput, rules: TrainingRules): { status: TrainingStatus; dueOn: string | null; daysLeft: number | null } {
  if (input.schemeLots === rules.exemptLotCount) return { status: "SCHEME_EXEMPT", dueOn: null, daysLeft: null };
  if (input.exemption && isTrainingExemption(input.exemption)) return { status: "EXEMPT", dueOn: null, daysLeft: null };
  if (input.completedOn) return { status: "TRAINED", dueOn: null, daysLeft: null };
  if (input.appointedOn < rules.startsOn) return { status: "NOT_YET_REQUIRED", dueOn: null, daysLeft: null };
  const dueOn = trainingDueOn(input.appointedOn, rules);
  const daysLeft = daysBetween(input.today, dueOn);
  return { status: daysLeft < 0 ? "OVERDUE" : "DUE", dueOn, daysLeft };
}

export const TRAINING_STATUS_LABELS: Record<TrainingStatus, string> = {
  SCHEME_EXEMPT: "Not required (two-lot scheme)",
  EXEMPT: "Exempt",
  TRAINED: "Completed",
  NOT_YET_REQUIRED: "Not required until next appointed",
  DUE: "Due",
  OVERDUE: "Overdue",
};
