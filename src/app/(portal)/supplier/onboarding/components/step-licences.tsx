"use client";

import { useActionState, useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { FormField, TextareaField, SelectField } from "@/components/ui/form-field";
import { saveLicence, deleteLicence } from "@/lib/actions/contractor-onboarding";

const STATE_OPTIONS = [
  { value: "", label: "Select..." },
  { value: "NSW", label: "NSW" },
  { value: "VIC", label: "VIC" },
  { value: "QLD", label: "QLD" },
  { value: "SA", label: "SA" },
  { value: "WA", label: "WA" },
  { value: "TAS", label: "TAS" },
  { value: "NT", label: "NT" },
  { value: "ACT", label: "ACT" },
];

const STATUS_COLOURS: Record<string, string> = {
  UNVERIFIED: "bg-gray-100 text-gray-700",
  SUBMITTED_UNVERIFIED: "bg-amber-50 text-amber-700",
  UNDER_REVIEW: "bg-blue-50 text-blue-700",
  FURTHER_INFO_REQUIRED: "bg-orange-50 text-orange-700",
  VERIFIED: "bg-emerald-50 text-emerald-700",
  EXPIRED: "bg-red-50 text-red-700",
  SUSPENDED: "bg-red-50 text-red-700",
  REJECTED: "bg-red-50 text-red-700",
  ENTITY_MISMATCH: "bg-orange-50 text-orange-700",
};

function formatStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface StepLicencesProps {
  business: Record<string, unknown> | null;
  licences: Record<string, unknown>[];
  onNext: () => void;
  onBack: () => void;
}

export function StepLicences({ business, licences, onNext, onBack }: StepLicencesProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [state, formAction, isPending] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      const result = await saveLicence({ error: null }, formData);
      if (result.success) {
        setShowForm(false);
        setEditingId(null);
      }
      return result;
    },
    { error: null },
  );

  const [deleteState, deleteAction, isDeleting] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      return await deleteLicence({ error: null }, formData);
    },
    { error: null },
  );

  const editingLicence = editingId
    ? licences.find((l) => l.id === editingId) ?? null
    : null;

  return (
    <Card>
      <CardHeader
        title="Licences & Registrations"
        description="Add your trade licences, registrations and certifications."
      />

      {(state.error || deleteState.error) && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 mb-4">
          <p className="text-sm text-red-700">{state.error || deleteState.error}</p>
        </div>
      )}

      {/* Existing licences */}
      {licences.length > 0 && (
        <div className="space-y-3 mb-6">
          {licences.map((licence) => (
            <div
              key={licence.id as string}
              className="rounded-[var(--radius-card)] bg-muted px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">
                    {(licence.licenceType as string) ?? "Licence"}
                  </p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    {licence.licenceNumber ? `#${licence.licenceNumber as string}` : null}
                    {licence.holderName ? ` · ${licence.holderName as string}` : null}
                    {licence.expiryDate ? ` · Expires ${new Date(licence.expiryDate as string).toLocaleDateString("en-AU")}` : null}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      STATUS_COLOURS[(licence.status as string) ?? "UNVERIFIED"] ?? STATUS_COLOURS.UNVERIFIED
                    }`}
                  >
                    {formatStatus((licence.status as string) ?? "UNVERIFIED")}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(licence.id as string);
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
                    <input type="hidden" name="licenceId" value={licence.id as string} />
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
            {editingId ? "Edit Licence" : "Add Licence"}
          </h3>

          {business?.id ? (
            <input type="hidden" name="contractorId" value={business.id as string} />
          ) : null}
          {editingId && (
            <input type="hidden" name="licenceId" value={editingId} />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Licence type"
              name="licenceType"
              required
              defaultValue={(editingLicence?.licenceType as string) ?? ""}
              placeholder="e.g. Builder, Electrician"
            />
            <FormField
              label="Licence number"
              name="licenceNumber"
              required
              defaultValue={(editingLicence?.licenceNumber as string) ?? ""}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField
              label="State / Territory"
              name="stateTerritory"
              defaultValue={(editingLicence?.stateTerritory as string) ?? ""}
              options={STATE_OPTIONS}
            />
            <FormField
              label="Issuing authority"
              name="issuingAuthority"
              defaultValue={(editingLicence?.issuingAuthority as string) ?? ""}
              placeholder="e.g. VBA, Fair Trading NSW"
            />
          </div>

          <FormField
            label="Licence holder name"
            name="holderName"
            required
            defaultValue={(editingLicence?.holderName as string) ?? ""}
          />

          <FormField
            label="Licence class"
            name="licenceClass"
            defaultValue={(editingLicence?.licenceClass as string) ?? ""}
            placeholder="e.g. Domestic Builder Unlimited"
          />

          <TextareaField
            label="Permitted work"
            name="permittedWork"
            defaultValue={(editingLicence?.permittedWork as string) ?? ""}
            placeholder="Describe what this licence permits."
            rows={2}
          />

          <TextareaField
            label="Conditions"
            name="conditions"
            defaultValue={(editingLicence?.conditions as string) ?? ""}
            placeholder="Any conditions or restrictions on this licence."
            rows={2}
          />

          <FormField
            label="Relationship to business"
            name="relationshipToBusiness"
            defaultValue={(editingLicence?.relationshipToBusiness as string) ?? ""}
            placeholder="e.g. Director, Nominated supervisor"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Start date"
              name="startDate"
              type="date"
              defaultValue={(editingLicence?.issueDate as string) ?? ""}
            />
            <FormField
              label="Expiry date"
              name="expiryDate"
              type="date"
              defaultValue={(editingLicence?.expiryDate as string) ?? ""}
            />
          </div>

          {/* Document upload */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">
              Supporting document
            </label>
            <input
              type="file"
              name="document"
              accept=".pdf,.jpg,.jpeg,.png"
              className="w-full text-sm text-ink file:mr-3 file:rounded-[var(--radius-card)] file:border-0 file:bg-supplier/10 file:px-3 file:py-2 file:text-xs file:font-medium file:text-supplier hover:file:bg-supplier/20 cursor-pointer"
            />
            <p className="mt-1 text-xs text-ink-muted">PDF, JPG or PNG. Max 10MB.</p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isPending}
              className="bg-supplier text-white rounded-[var(--radius-card)] px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isPending ? "Saving..." : editingId ? "Update Licence" : "Add Licence"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
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
            setShowForm(true);
          }}
          className="w-full rounded-[var(--radius-card)] border-2 border-dashed border-line py-4 text-sm font-medium text-ink-muted hover:border-supplier hover:text-supplier transition-colors"
        >
          + Add Licence
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
