"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, SelectField, TextareaField } from "@/components/ui/form-field";
import { UnsavedGuard } from "@/components/ui/unsaved-guard";
import {
  createClaimAction,
  updateClaimAction,
  type ClaimFormState,
} from "./actions";
import {
  CLAIM_CATEGORIES,
  CLAIM_CATEGORY_LABELS,
  REPORTER_TYPES,
  REPORTER_TYPE_LABELS,
} from "@/lib/insurance/constants";

const categoryOptions = [
  { value: "", label: "Select a category" },
  ...CLAIM_CATEGORIES.map((v) => ({ value: v, label: CLAIM_CATEGORY_LABELS[v] ?? v })),
];
const reporterOptions = REPORTER_TYPES.map((v) => ({
  value: v,
  label: REPORTER_TYPE_LABELS[v] ?? v,
}));

export interface PolicyOption {
  id: string;
  label: string;
}

export interface ClaimFormDefaults {
  title: string;
  policyId: string;
  incidentCategory: string;
  reporterType: string;
  reporterName: string;
  contactEmail: string;
  contactPhone: string;
  smsUpdates: boolean;
  incidentDate: string;
  incidentTime: string;
  discoveredDate: string;
  incidentLocation: string;
  lotReference: string;
  commonProperty: string; // "YES" | "NO" | ""
  individualLot: string;
  description: string;
  damageDetails: string;
  immediateAction: string;
  estimatedLoss: string;
  otherParties: string;
}

function emptyDefaults(): ClaimFormDefaults {
  return {
    title: "",
    policyId: "",
    incidentCategory: "",
    reporterType: "STRATA_MANAGER",
    reporterName: "",
    contactEmail: "",
    contactPhone: "",
    smsUpdates: false,
    incidentDate: "",
    incidentTime: "",
    discoveredDate: "",
    incidentLocation: "",
    lotReference: "",
    commonProperty: "",
    individualLot: "",
    description: "",
    damageDetails: "",
    immediateAction: "",
    estimatedLoss: "",
    otherParties: "",
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-white p-5">
      <h3 className="font-heading font-semibold text-ink text-sm mb-4">{title}</h3>
      {children}
    </section>
  );
}

function YesNo({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: string;
}) {
  return (
    <div>
      <span className="block text-sm font-medium text-ink mb-1.5">{label}</span>
      <div className="flex gap-4 text-sm">
        {["YES", "NO"].map((v) => (
          <label key={v} className="flex items-center gap-1.5">
            <input
              type="radio"
              name={name}
              value={v}
              defaultChecked={defaultValue === v}
            />
            {v === "YES" ? "Yes" : "No"}
          </label>
        ))}
      </div>
    </div>
  );
}

function ClaimFormInner({
  action,
  defaults,
  policies,
  submitLabel,
}: {
  action: (prev: ClaimFormState, data: FormData) => Promise<ClaimFormState>;
  defaults: ClaimFormDefaults;
  policies: PolicyOption[];
  submitLabel: string;
}) {
  const [state, formAction, isPending] = useActionState<ClaimFormState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      <UnsavedGuard />
      {state.error ? (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      ) : null}

      <Section title="Who is lodging the claim">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SelectField
            label="Lodging as"
            name="reporterType"
            defaultValue={defaults.reporterType}
            options={reporterOptions}
          />
          <FormField label="Contact name" name="reporterName" defaultValue={defaults.reporterName} />
          <FormField label="Email" name="contactEmail" type="email" defaultValue={defaults.contactEmail} />
          <FormField label="Phone" name="contactPhone" type="tel" defaultValue={defaults.contactPhone} />
        </div>
        <div className="mt-4">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="smsUpdates"
              value="YES"
              defaultChecked={defaults.smsUpdates}
            />
            Send SMS claim updates to this contact
          </label>
        </div>
      </Section>

      <Section title="Claim and policy">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            label="Claim title"
            name="title"
            required
            defaultValue={defaults.title}
            placeholder="e.g. Water damage to level 3 common area"
            error={state.fieldErrors?.title}
          />
          <SelectField
            label="Incident category"
            name="incidentCategory"
            defaultValue={defaults.incidentCategory}
            options={categoryOptions}
          />
          <SelectField
            label="Insurer policy"
            name="policyId"
            defaultValue={defaults.policyId}
            options={[
              { value: "", label: "Not linked / unknown" },
              ...policies.map((p) => ({ value: p.id, label: p.label })),
            ]}
          />
          <FormField
            label="Incident location"
            name="incidentLocation"
            defaultValue={defaults.incidentLocation}
            placeholder="e.g. Common property, basement car park"
          />
          <FormField label="Lot reference" name="lotReference" defaultValue={defaults.lotReference} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4">
          <YesNo label="Damage to common property?" name="commonProperty" defaultValue={defaults.commonProperty} />
          <YesNo label="Damage to an individual lot?" name="individualLot" defaultValue={defaults.individualLot} />
        </div>
      </Section>

      <Section title="Loss and incident details">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FormField label="Date of loss" name="incidentDate" type="date" defaultValue={defaults.incidentDate} />
          <FormField label="Time (approx.)" name="incidentTime" defaultValue={defaults.incidentTime} placeholder="e.g. 14:30" />
          <FormField label="Discovered / reported on" name="discoveredDate" type="date" defaultValue={defaults.discoveredDate} />
        </div>
        <div className="mt-4 space-y-4">
          <TextareaField
            label="Description of loss"
            name="description"
            rows={3}
            required
            defaultValue={defaults.description}
            placeholder="How the damage occurred"
          />
          <TextareaField
            label="Details of loss (what is damaged)"
            name="damageDetails"
            rows={3}
            defaultValue={defaults.damageDetails}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextareaField label="Immediate action taken" name="immediateAction" rows={2} defaultValue={defaults.immediateAction} />
            <FormField label="Estimated loss ($)" name="estimatedLoss" type="number" defaultValue={defaults.estimatedLoss} />
          </div>
          <TextareaField
            label="Additional information / other parties"
            name="otherParties"
            rows={2}
            defaultValue={defaults.otherParties}
          />
        </div>
        {state.fieldErrors?.description && (
          <p className="text-xs text-red-600 mt-1">{state.fieldErrors.description}</p>
        )}
      </Section>

      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function NewClaimForm({
  schemeId,
  policies,
}: {
  schemeId: string;
  policies: PolicyOption[];
}) {
  return (
    <ClaimFormInner
      action={createClaimAction.bind(null, schemeId)}
      defaults={emptyDefaults()}
      policies={policies}
      submitLabel="Save claim as draft"
    />
  );
}

export function EditClaimForm({
  schemeId,
  claimId,
  policies,
  defaults,
}: {
  schemeId: string;
  claimId: string;
  policies: PolicyOption[];
  defaults: ClaimFormDefaults;
}) {
  return (
    <ClaimFormInner
      action={updateClaimAction.bind(null, schemeId, claimId)}
      defaults={defaults}
      policies={policies}
      submitLabel="Save changes"
    />
  );
}
