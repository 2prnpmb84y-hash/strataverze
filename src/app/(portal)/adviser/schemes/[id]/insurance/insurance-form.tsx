"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, SelectField, TextareaField } from "@/components/ui/form-field";
import { UnsavedGuard } from "@/components/ui/unsaved-guard";
import { bodyCorporateShortName, type Terms } from "@/lib/jurisdiction/wording";
import {
  createInsuranceAction,
  updateInsuranceAction,
  type InsuranceFormState,
} from "./actions";
import {
  POLICY_TYPES,
  POLICY_TYPE_LABELS,
  POLICY_STATUSES,
  COVERAGE_CATEGORIES,
  COVERAGE_CATEGORY_LABELS,
  PREMIUM_KINDS,
  PREMIUM_KIND_LABELS,
} from "@/lib/insurance/constants";
import { premiumTotal, formatMoney } from "@/lib/insurance/premium";

const policyTypeOptions = POLICY_TYPES.map((v) => ({
  value: v,
  label: POLICY_TYPE_LABELS[v] ?? v,
}));
const statusOptions = POLICY_STATUSES.map((v) => ({
  value: v,
  label: v.charAt(0) + v.slice(1).toLowerCase(),
}));
const coverageCategoryOptions = COVERAGE_CATEGORIES.map((v) => ({
  value: v,
  label: COVERAGE_CATEGORY_LABELS[v] ?? v,
}));
const premiumKindOptions = PREMIUM_KINDS.map((v) => ({
  value: v,
  label: PREMIUM_KIND_LABELS[v] ?? v,
}));
const paymentStatusOptions = [
  { value: "", label: "Not set" },
  { value: "UNPAID", label: "Unpaid" },
  { value: "PART_PAID", label: "Part paid" },
  { value: "PAID", label: "Paid" },
];

const inputClass =
  "w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors";

export interface CoverageRow {
  category: string;
  description: string;
  sumInsured: string;
  excess: string;
  conditions: string;
}
export interface PremiumRow {
  label: string;
  kind: string;
  amount: string;
}

export interface PolicyFormDefaults {
  policyNumber: string;
  policyType: string;
  status: string;
  insurer: string;
  broker: string;
  brokerContact: string;
  insuredEntityName: string;
  insuredAddress: string;
  additionalInsured: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  claimsContact: string;
  referenceNumbers: string;
  coverageAmount: string;
  premium: string;
  excessAmount: string;
  startDate: string;
  endDate: string;
  renewalDate: string;
  currency: string;
  paymentDueDate: string;
  paymentStatus: string;
  paymentDate: string;
  paymentReference: string;
  coverageSummary: string;
  exclusions: string;
  conditions: string;
  endorsements: string;
  notes: string;
  coverageItems: CoverageRow[];
  premiumLineItems: PremiumRow[];
}

function emptyDefaults(): PolicyFormDefaults {
  return {
    policyNumber: "",
    policyType: "STRATA",
    status: "ACTIVE",
    insurer: "",
    broker: "",
    brokerContact: "",
    insuredEntityName: "",
    insuredAddress: "",
    additionalInsured: "",
    contactPerson: "",
    contactEmail: "",
    contactPhone: "",
    claimsContact: "",
    referenceNumbers: "",
    coverageAmount: "",
    premium: "",
    excessAmount: "",
    startDate: "",
    endDate: "",
    renewalDate: "",
    currency: "AUD",
    paymentDueDate: "",
    paymentStatus: "",
    paymentDate: "",
    paymentReference: "",
    coverageSummary: "",
    exclusions: "",
    conditions: "",
    endorsements: "",
    notes: "",
    coverageItems: [],
    premiumLineItems: [],
  };
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-white p-5">
      <h3 className="font-heading font-semibold text-ink text-sm">{title}</h3>
      {description && (
        <p className="text-xs text-ink-muted mt-0.5 mb-4">{description}</p>
      )}
      <div className={description ? "" : "mt-4"}>{children}</div>
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[11px] font-medium uppercase tracking-wide text-ink-muted mb-1">
      {children}
    </span>
  );
}

/** The building's words for its owners corporation (`rules.TERMINOLOGY`), for the example entity name. */
type EntityTerms = Pick<Terms, "bodyCorporateShortName">;

function PolicyFormInner({
  mode,
  action,
  defaults,
  terms,
}: {
  mode: "create" | "edit";
  action: (
    prev: InsuranceFormState,
    data: FormData,
  ) => Promise<InsuranceFormState>;
  defaults: PolicyFormDefaults;
  terms: EntityTerms;
}) {
  const [state, formAction, isPending] = useActionState<
    InsuranceFormState,
    FormData
  >(action, {});
  const [coverage, setCoverage] = useState<CoverageRow[]>(
    defaults.coverageItems,
  );
  const [premium, setPremium] = useState<PremiumRow[]>(
    defaults.premiumLineItems,
  );

  const premiumSum = useMemo(
    () =>
      premiumTotal(
        premium
          .filter((p) => p.amount && !Number.isNaN(Number(p.amount)))
          .map((p) => ({ amount: p.amount, kind: p.kind })),
      ),
    [premium],
  );

  const coverageJson = JSON.stringify(
    coverage.filter((c) => c.category),
  );
  const premiumJson = JSON.stringify(
    premium.filter((p) => p.label && p.amount),
  );

  function addCoverage() {
    setCoverage((c) => [
      ...c,
      { category: "BUILDING", description: "", sumInsured: "", excess: "", conditions: "" },
    ]);
  }
  function addPremium() {
    setPremium((p) => [...p, { label: "", kind: "BASE", amount: "" }]);
  }

  return (
    <form action={formAction} className="space-y-5">
      <UnsavedGuard />
      {state.error ? (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      ) : null}

      {/* Policy basics */}
      <Section title="Policy">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            label="Policy number"
            name="policyNumber"
            required
            defaultValue={defaults.policyNumber}
            placeholder="e.g. JN0026547280"
            error={state.fieldErrors?.policyNumber}
          />
          <SelectField
            label="Policy type"
            name="policyType"
            required
            defaultValue={defaults.policyType}
            options={policyTypeOptions}
            error={state.fieldErrors?.policyType}
          />
          <FormField
            label="Insurer"
            name="insurer"
            required
            defaultValue={defaults.insurer}
            placeholder="e.g. CHU / QBE"
            error={state.fieldErrors?.insurer}
          />
          {mode === "edit" ? (
            <SelectField
              label="Status"
              name="status"
              required
              defaultValue={defaults.status}
              options={statusOptions}
              error={state.fieldErrors?.status}
            />
          ) : (
            <input type="hidden" name="status" value="ACTIVE" />
          )}
        </div>
      </Section>

      {/* Dates */}
      <Section
        title="Period"
        description="Policy commencement and expiry. Renewal date is optional."
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FormField
            label="Start date"
            name="startDate"
            type="date"
            required
            defaultValue={defaults.startDate}
            error={state.fieldErrors?.startDate}
          />
          <FormField
            label="End date"
            name="endDate"
            type="date"
            required
            defaultValue={defaults.endDate}
            error={state.fieldErrors?.endDate}
          />
          <FormField
            label="Renewal date"
            name="renewalDate"
            type="date"
            defaultValue={defaults.renewalDate}
          />
        </div>
      </Section>

      {/* Insured entity */}
      <Section
        title="Insured entity and property"
        description="Prefilled from the scheme where available. Correct as needed."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            label="Insured entity name"
            name="insuredEntityName"
            defaultValue={defaults.insuredEntityName}
            placeholder={`e.g. ${bodyCorporateShortName(terms, { name: "Harbour View", planNumber: "3782" })}`}
          />
          <FormField
            label="Insured property address"
            name="insuredAddress"
            defaultValue={defaults.insuredAddress}
          />
          <FormField
            label="Additional insured parties"
            name="additionalInsured"
            defaultValue={defaults.additionalInsured}
          />
          <FormField
            label="Reference numbers"
            name="referenceNumbers"
            defaultValue={defaults.referenceNumbers}
          />
        </div>
      </Section>

      {/* Broker / insurer contacts */}
      <Section title="Broker and insurer contacts">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Broker / intermediary" name="broker" defaultValue={defaults.broker} />
          <FormField label="Broker contact" name="brokerContact" defaultValue={defaults.brokerContact} />
          <FormField label="Contact person" name="contactPerson" defaultValue={defaults.contactPerson} />
          <FormField label="Contact email" name="contactEmail" type="email" defaultValue={defaults.contactEmail} />
          <FormField label="Contact phone" name="contactPhone" type="tel" defaultValue={defaults.contactPhone} />
          <FormField label="Claims contact" name="claimsContact" defaultValue={defaults.claimsContact} />
        </div>
      </Section>

      {/* Coverage items */}
      <Section
        title="Coverage"
        description="The headline sum insured, plus itemised cover. Not every category applies to every policy."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <FormField
            label="Headline sum insured ($)"
            name="coverageAmount"
            type="number"
            step="0.01"
            required
            defaultValue={defaults.coverageAmount}
            placeholder="e.g. 25000000"
            error={state.fieldErrors?.coverageAmount}
          />
          <FormField
            label="Default excess ($)"
            name="excessAmount"
            type="number"
            step="0.01"
            defaultValue={defaults.excessAmount}
            error={state.fieldErrors?.excessAmount}
          />
        </div>

        {coverage.length > 0 && (
          <div className="space-y-2 mb-3">
            {coverage.map((row, i) => (
              <div
                key={i}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start rounded-[var(--radius-card)] border border-line p-2.5"
              >
                <div className="sm:col-span-3">
                  <FieldLabel>Category</FieldLabel>
                  <select
                    className={inputClass}
                    value={row.category}
                    onChange={(e) =>
                      setCoverage((c) =>
                        c.map((r, j) => (j === i ? { ...r, category: e.target.value } : r)),
                      )
                    }
                  >
                    {coverageCategoryOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <FieldLabel>Description</FieldLabel>
                  <input
                    className={inputClass}
                    value={row.description}
                    onChange={(e) =>
                      setCoverage((c) =>
                        c.map((r, j) => (j === i ? { ...r, description: e.target.value } : r)),
                      )
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>Sum insured</FieldLabel>
                  <input
                    className={inputClass}
                    type="number"
                    step="0.01"
                    value={row.sumInsured}
                    onChange={(e) =>
                      setCoverage((c) =>
                        c.map((r, j) => (j === i ? { ...r, sumInsured: e.target.value } : r)),
                      )
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>Excess</FieldLabel>
                  <input
                    className={inputClass}
                    type="number"
                    step="0.01"
                    value={row.excess}
                    onChange={(e) =>
                      setCoverage((c) =>
                        c.map((r, j) => (j === i ? { ...r, excess: e.target.value } : r)),
                      )
                    }
                  />
                </div>
                <div className="sm:col-span-2 flex items-end h-full">
                  <button
                    type="button"
                    onClick={() => setCoverage((c) => c.filter((_, j) => j !== i))}
                    className="text-xs text-red-600 hover:underline pb-2"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <Button type="button" variant="secondary" onClick={addCoverage}>
          Add coverage item
        </Button>
        <input type="hidden" name="coverageItemsJson" value={coverageJson} />
      </Section>

      {/* Premium line items */}
      <Section
        title="Premium and payment"
        description="Enter the base premium, then itemise taxes, duties, levies and fees. The total is calculated from the items."
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <FormField
            label="Base premium ($)"
            name="premium"
            type="number"
            step="0.01"
            required
            defaultValue={defaults.premium}
            placeholder="e.g. 42000"
            error={state.fieldErrors?.premium}
          />
          <FormField label="Currency" name="currency" defaultValue={defaults.currency || "AUD"} />
          <SelectField
            label="Payment status"
            name="paymentStatus"
            defaultValue={defaults.paymentStatus}
            options={paymentStatusOptions}
          />
        </div>

        {premium.length > 0 && (
          <div className="space-y-2 mb-3">
            {premium.map((row, i) => (
              <div
                key={i}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end rounded-[var(--radius-card)] border border-line p-2.5"
              >
                <div className="sm:col-span-6">
                  <FieldLabel>Charge</FieldLabel>
                  <input
                    className={inputClass}
                    value={row.label}
                    placeholder="e.g. GST, Stamp duty, Broker fee"
                    onChange={(e) =>
                      setPremium((p) =>
                        p.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)),
                      )
                    }
                  />
                </div>
                <div className="sm:col-span-3">
                  <FieldLabel>Kind</FieldLabel>
                  <select
                    className={inputClass}
                    value={row.kind}
                    onChange={(e) =>
                      setPremium((p) =>
                        p.map((r, j) => (j === i ? { ...r, kind: e.target.value } : r)),
                      )
                    }
                  >
                    {premiumKindOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>Amount</FieldLabel>
                  <input
                    className={inputClass}
                    type="number"
                    step="0.01"
                    value={row.amount}
                    onChange={(e) =>
                      setPremium((p) =>
                        p.map((r, j) => (j === i ? { ...r, amount: e.target.value } : r)),
                      )
                    }
                  />
                </div>
                <div className="sm:col-span-1 flex items-end h-full">
                  <button
                    type="button"
                    onClick={() => setPremium((p) => p.filter((_, j) => j !== i))}
                    className="text-xs text-red-600 hover:underline pb-2"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <Button type="button" variant="secondary" onClick={addPremium}>
            Add charge
          </Button>
          {premium.length > 0 && (
            <span className="text-sm text-ink">
              Total charges:{" "}
              <span className="font-heading font-semibold tabular-nums">
                {formatMoney(premiumSum)}
              </span>
            </span>
          )}
        </div>
        <input type="hidden" name="premiumLineItemsJson" value={premiumJson} />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <FormField label="Payment due date" name="paymentDueDate" type="date" defaultValue={defaults.paymentDueDate} />
          <FormField label="Payment date" name="paymentDate" type="date" defaultValue={defaults.paymentDate} />
          <FormField label="Payment reference" name="paymentReference" defaultValue={defaults.paymentReference} />
        </div>
      </Section>

      {/* Policy detail */}
      <Section title="Coverage summary, conditions and notes">
        <div className="space-y-4">
          <TextareaField
            label="Coverage summary"
            name="coverageSummary"
            rows={2}
            defaultValue={defaults.coverageSummary}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <TextareaField label="Key exclusions" name="exclusions" rows={3} defaultValue={defaults.exclusions} />
            <TextareaField label="Conditions" name="conditions" rows={3} defaultValue={defaults.conditions} />
            <TextareaField label="Endorsements" name="endorsements" rows={3} defaultValue={defaults.endorsements} />
          </div>
          <TextareaField label="Internal notes" name="notes" rows={3} defaultValue={defaults.notes} />
        </div>
      </Section>

      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending
            ? mode === "edit"
              ? "Saving..."
              : "Creating..."
            : mode === "edit"
              ? "Save changes"
              : "Create policy"}
        </Button>
      </div>
    </form>
  );
}

export function InsurancePolicyForm({ schemeId, terms }: { schemeId: string; terms: EntityTerms }) {
  return (
    <PolicyFormInner
      mode="create"
      action={createInsuranceAction.bind(null, schemeId)}
      defaults={emptyDefaults()}
      terms={terms}
    />
  );
}

export function InsurancePolicyEditForm({
  schemeId,
  policyId,
  defaults,
  terms,
}: {
  schemeId: string;
  policyId: string;
  defaults: PolicyFormDefaults;
  terms: EntityTerms;
}) {
  return (
    <PolicyFormInner
      mode="edit"
      action={updateInsuranceAction.bind(null, schemeId, policyId)}
      defaults={defaults}
      terms={terms}
    />
  );
}
