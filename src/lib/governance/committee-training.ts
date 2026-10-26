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

export type TrainingStatus =
  | "SCHEME_EXEMPT"
  | "EXEMPT"
  | "TRAINED"
  | "COMPLETED_LATE"
  | "APPOINTMENT_NOT_RECORDED"
  | "NOT_YET_REQUIRED"
  | "DUE"
  | "OVERDUE";

/** An appointment older than this may have been renewed at a later AGM (committees are elected at each AGM). */
export const APPOINTMENT_CHECK_MONTHS = 15;

export interface TrainingInput {
  appointedOn: string;
  /** Whether an adviser recorded the appointment date (else it is only the date committee access began). */
  appointmentRecorded: boolean;
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

/**
 * A member's status. No due date is worked out until an adviser records the
 * appointment date: the date committee access began is not the date of
 * appointment. A completion after the due date is shown as late, because by
 * then the member had stopped being a member under the rule.
 */
export function trainingStatus(input: TrainingInput, rules: TrainingRules): { status: TrainingStatus; dueOn: string | null; daysLeft: number | null; checkAppointment: boolean } {
  const none = { dueOn: null, daysLeft: null };
  const checkAppointment = input.appointmentRecorded && addMonths(input.appointedOn, APPOINTMENT_CHECK_MONTHS) < input.today;
  if (input.schemeLots === rules.exemptLotCount) return { status: "SCHEME_EXEMPT", ...none, checkAppointment: false };
  if (input.exemption && isTrainingExemption(input.exemption)) return { status: "EXEMPT", ...none, checkAppointment };
  if (!input.appointmentRecorded) return { status: input.completedOn ? "TRAINED" : "APPOINTMENT_NOT_RECORDED", ...none, checkAppointment: false };
  if (input.appointedOn < rules.startsOn) return { status: input.completedOn ? "TRAINED" : "NOT_YET_REQUIRED", ...none, checkAppointment };
  const dueOn = trainingDueOn(input.appointedOn, rules);
  if (input.completedOn) return { status: input.completedOn > dueOn ? "COMPLETED_LATE" : "TRAINED", dueOn, daysLeft: null, checkAppointment };
  const daysLeft = daysBetween(input.today, dueOn);
  return { status: daysLeft < 0 ? "OVERDUE" : "DUE", dueOn, daysLeft, checkAppointment };
}

export const TRAINING_STATUS_LABELS: Record<TrainingStatus, string> = {
  SCHEME_EXEMPT: "Not required (two-lot scheme)",
  EXEMPT: "Exempt",
  TRAINED: "Completed",
  COMPLETED_LATE: "Completed after the due date",
  APPOINTMENT_NOT_RECORDED: "Appointment date not recorded",
  NOT_YET_REQUIRED: "Not required until next appointed",
  DUE: "Due",
  OVERDUE: "Overdue",
};
