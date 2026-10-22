"use client";

import { useActionState, useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { FormField, TextareaField, SelectField, CheckboxField } from "@/components/ui/form-field";
import { saveInsurance, deleteInsurance } from "@/lib/actions/contractor-onboarding";

const INSURANCE_TYPES = [
  { value: "", label: "Select type..." },
  { value: "PUBLIC_LIABILITY", label: "Public Liability" },
  { value: "WORKERS_COMPENSATION", label: "Workers Compensation" },
  { value: "PROFESSIONAL_INDEMNITY", label: "Professional Indemnity" },
  { value: "CONTRACT_WORKS", label: "Contract Works" },
  { value: "STATUTORY_BUILDING", label: "Statutory Building Insurance" },
  { value: "OTHER", label: "Other" },
];

const STATUS_COLOURS: Record<string, string> = {
  NOT_SUPPLIED: "bg-gray-100 text-gray-700",
  SUBMITTED_UNVERIFIED: "bg-amber-50 text-amber-700",
  UNDER_REVIEW: "bg-blue-50 text-blue-700",
  FURTHER_INFO_REQUIRED: "bg-orange-50 text-orange-700",
  VERIFIED: "bg-emerald-50 text-emerald-700",
  EXPIRED: "bg-red-50 text-red-700",
  REJECTED: "bg-red-50 text-red-700",
  NOT_APPLICABLE_REVIEWED: "bg-gray-100 text-gray-600",
  ENTITY_MISMATCH: "bg-orange-50 text-orange-700",
  COVERAGE_INSUFFICIENT: "bg-orange-50 text-orange-700",
};

function formatStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCurrency(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
  }).format(num);
}

interface StepInsuranceProps {
  business: Record<string, unknown> | null;
  insurances: Record<string, unknown>[];
  onNext: () => void;
  onBack: () => void;
}

export function StepInsurance({ business, insurances, onNext, onBack }: StepInsuranceProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notApplicable, setNotApplicable] = useState(false);

  const [state, formAction, isPending] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      const result = await saveInsurance({ error: null }, formData);
      if (result.success) {
        setShowForm(false);
        setEditingId(null);
        setNotApplicable(false);
      }
      return result;
    },
    { error: null },
  );

  const [deleteState, deleteAction, isDeleting] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      return await deleteInsurance({ error: null }, formData);
    },
    { error: null },
  );

  const editingInsurance = editingId
    ? insurances.find((ins) => ins.id === editingId) ?? null
    : null;

  return (
    <Card>
      <CardHeader
        title="Insurance & Certificates"
        description="Add your insurance policies and certificates of currency."
      />

      {(state.error || deleteState.error) && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 mb-4">
          <p className="text-sm text-red-700">{state.error || deleteState.error}</p>
        </div>
      )}

      {/* Existing policies */}
      {insurances.length > 0 && (
        <div className="space-y-3 mb-6">
          {insurances.map((ins) => (
            <div
              key={ins.id as string}
              className="rounded-[var(--radius-card)] bg-muted px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">
                    {INSURANCE_TYPES.find((t) => t.value === ins.insuranceType)?.label ??
                      (ins.insuranceType as string)}
                  </p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    {ins.insurer ? `${ins.insurer as string}` : null}
                    {ins.policyNumber ? ` · #${ins.policyNumber as string}` : null}
                    {ins.coverageAmount ? ` · ${formatCurrency(ins.coverageAmount as string)}` : null}
                    {ins.expiryDate ? ` · Expires ${new Date(ins.expiryDate as string).toLocaleDateString("en-AU")}` : null}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      STATUS_COLOURS[(ins.status as string) ?? "NOT_SUPPLIED"] ?? STATUS_COLOURS.NOT_SUPPLIED
                    }`}
                  >
                    {formatStatus((ins.status as string) ?? "NOT_SUPPLIED")}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(ins.id as string);
                      setNotApplicable((ins.notApplicable as boolean) ?? false);
                      setShowForm(true);
                    }}
                    className="text-xs text-supplier hover:underline"
                  >
                    Edit
                  </button>
                  <form action={deleteAction}>
                    {business?.id ? (
                      <input type="hidden" name="contractorId" value={business.id as string} />
                    ) : null}
                    <input type="hidden" name="insuranceId" value={ins.id as string} />
                    <button
                      type="submit"
                      disabled={isDeleting}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit form */}
      {showForm ? (
        <form action={formAction} className="space-y-4 border-t border-line pt-4">
          <h3 className="text-sm font-semibold text-ink">
            {editingId ? "Edit Insurance Policy" : "Add Insurance Policy"}
          </h3>

          {business?.id ? (
            <input type="hidden" name="contractorId" value={business.id as string} />
          ) : null}
          {editingId && (
            <input type="hidden" name="insuranceId" value={editingId} />
          )}

          <SelectField
            label="Insurance type"
            name="insuranceType"
            required
            defaultValue={(editingInsurance?.insuranceType as string) ?? ""}
            options={INSURANCE_TYPES}
          />

          {/* Not applicable toggle */}
          <div className="rounded-[var(--radius-card)] bg-amber-50 border border-amber-200 p-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="notApplicable"
                value="true"
                checked={notApplicable}
                onChange={(e) => setNotApplicable(e.target.checked)}
                className="h-4 w-4 rounded border-line text-amber-600 focus:ring-amber-500"
              />
              <span className="text-sm font-medium text-amber-800">
                Not applicable to this business
              </span>
            </label>
            {notApplicable && (
              <TextareaField
                label="Reason"
                name="notApplicableReason"
                defaultValue={(editingInsurance?.notApplicableReason as string) ?? ""}
                placeholder="Explain why this insurance type is not applicable."
                rows={2}
                className="mt-3"
              />
            )}
          </div>

          {!notApplicable && (
            <>
              <FormField
                label="Insured entity"
                name="insuredName"
                required
                defaultValue={(editingInsurance?.insuredName as string) ?? ""}
                placeholder="Name as shown on certificate"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  label="Insurer"
                  name="insurer"
                  required
                  defaultValue={(editingInsurance?.insurer as string) ?? ""}
                />
                <FormField
                  label="Policy number"
                  name="policyNumber"
                  required
                  defaultValue={(editingInsurance?.policyNumber as string) ?? ""}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  label="Cover start"
                  name="startDate"
                  type="date"
                  required
                  defaultValue={(editingInsurance?.startDate as string) ?? ""}
                />
                <FormField
                  label="Cover expiry"
                  name="expiryDate"
                  type="date"
                  required
                  defaultValue={(editingInsurance?.expiryDate as string) ?? ""}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  label="Cover limit ($)"
                  name="coverageAmount"
                  type="number"
                  step="0.01"
                  required
                  defaultValue={(editingInsurance?.coverageAmount as string) ?? ""}
                  placeholder="e.g. 20000000"
                />
                <FormField
                  label="Coverage amount basis"
                  name="coverageAmountBasis"
                  defaultValue={(editingInsurance?.coverageAmountBasis as string) ?? ""}
                  placeholder="e.g. Per occurrence, Aggregate"
                />
              </div>

              <TextareaField
                label="Covered activities"
                name="coveredActivities"
                defaultValue={(editingInsurance?.coveredActivities as string) ?? ""}
                placeholder="Activities and work types covered by this policy."
                rows={2}
              />

              <TextareaField
                label="Exclusions or qualifications"
                name="exclusions"
                defaultValue={(editingInsurance?.exclusions as string) ?? ""}
                placeholder="Any relevant exclusions or conditions."
                rows={2}
              />

              <TextareaField
                label="Comments"
                name="contractorComments"
                defaultValue={(editingInsurance?.contractorComments as string) ?? ""}
                placeholder="Any additional information about this policy."
                rows={2}
              />

              {/* Certificate upload */}
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">
                  Certificate of currency
                </label>
                <input
                  type="file"
                  name="certificate"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="w-full text-sm text-ink file:mr-3 file:rounded-[var(--radius-card)] file:border-0 file:bg-supplier/10 file:px-3 file:py-2 file:text-xs file:font-medium file:text-supplier hover:file:bg-supplier/20 cursor-pointer"
                />
                <p className="mt-1 text-xs text-ink-muted">PDF, JPG or PNG. Max 10MB.</p>
              </div>
            </>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isPending}
              className="bg-supplier text-white rounded-[var(--radius-card)] px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isPending ? "Saving..." : editingId ? "Update Policy" : "Add Policy"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
                setNotApplicable(false);
              }}
              className="border border-line text-ink rounded-[var(--radius-card)] px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => {
            setEditingId(null);
            setNotApplicable(false);
            setShowForm(true);
          }}
          className="w-full rounded-[var(--radius-card)] border-2 border-dashed border-line py-4 text-sm font-medium text-ink-muted hover:border-supplier hover:text-supplier transition-colors"
        >
          + Add Insurance Policy
        </button>
      )}

      <div className="flex justify-between pt-6 mt-4 border-t border-line">
        <button
          type="button"
          onClick={onBack}
          className="border border-line text-ink rounded-[var(--radius-card)] px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="bg-supplier text-white rounded-[var(--radius-card)] px-6 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Continue
        </button>
      </div>
    </Card>
  );
}
