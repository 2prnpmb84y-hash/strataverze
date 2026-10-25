"use client";

import { WORKS_TRADES } from "@/config/works";

import { useActionState, useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { FormField, TextareaField } from "@/components/ui/form-field";
import { saveServicesAndContacts } from "@/lib/actions/contractor-onboarding";

interface StepServicesProps {
  business: Record<string, unknown> | null;
  profile: Record<string, unknown>;
  onNext: () => void;
  onBack: () => void;
}

function TagInput({
  label,
  name,
  defaultValues,
  placeholder,
  helpText,
}: {
  label: string;
  name: string;
  defaultValues: string[];
  placeholder?: string;
  helpText?: string;
}) {
  const [tags, setTags] = useState<string[]>(defaultValues);
  const [input, setInput] = useState("");

  const addTag = () => {
    const trimmed = input.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setInput("");
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  return (
    <div>
      <label className="block text-sm font-medium text-ink mb-1.5">
        {label}
      </label>
      {/* Hidden inputs for form submission */}
      {tags.map((tag, i) => (
        <input key={i} type="hidden" name={name} value={tag} />
      ))}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors"
        />
        <button
          type="button"
          onClick={addTag}
          className="border border-line text-ink rounded-[var(--radius-card)] px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          Add
        </button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-supplier/10 text-supplier px-2.5 py-0.5 text-xs font-medium"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="hover:text-supplier/70"
                aria-label={`Remove ${tag}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
      {helpText && (
        <p className="mt-1.5 text-xs text-ink-muted">{helpText}</p>
      )}
    </div>
  );
}

export function StepServices({ business, profile, onNext, onBack }: StepServicesProps) {
  const [usesSubcontractors, setUsesSubcontractors] = useState(
    (business?.usesSubcontractors as boolean) ?? false,
  );

  const [state, formAction, isPending] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      const result = await saveServicesAndContacts({ error: null }, formData);
      if (result.success) {
        onNext();
      }
      return result;
    },
    { error: null },
  );

  return (
    <Card>
      <CardHeader
        title="Services & Contacts"
        description="Specify your trade categories, service areas and key contacts."
      />

      <form action={formAction} className="space-y-5">
        {state.error && (
          <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm text-red-700">{state.error}</p>
          </div>
        )}

        {business?.id ? (
          <input type="hidden" name="contractorId" value={business.id as string} />
        ) : null}

        {/* The fixed list buildings choose from, so jobs match (works stage 3, 25 Oct 2026). */}
        <fieldset>
          <legend className="block text-sm font-medium text-ink mb-1.5">Kinds of work you do</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {WORKS_TRADES.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="tradeCategories" value={t} defaultChecked={((business?.tradeCategories as string[]) ?? []).includes(t)} className="h-4 w-4 accent-turquoise" />
                {t}
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">Set the postcodes you work in under Trades &amp; Area.</p>
        </fieldset>

        <TagInput
          label="Specialist services"
          name="specialistServices"
          defaultValues={(business?.specialistServices as string[]) ?? []}
          placeholder="e.g. Fire protection, Lift maintenance"
        />

        <TagInput
          label="Service regions / Postcodes"
          name="serviceRegions"
          defaultValues={(business?.serviceRegions as string[]) ?? []}
          placeholder="e.g. Melbourne CBD, 3000-3010"
          helpText="Areas or postcode ranges where you provide services."
        />

        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">
            Do you use subcontractors?
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="usesSubcontractors"
                value="true"
                checked={usesSubcontractors === true}
                onChange={() => setUsesSubcontractors(true)}
                className="h-4 w-4 text-supplier focus:ring-supplier"
              />
              <span className="text-sm text-ink">Yes</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="usesSubcontractors"
                value="false"
                checked={usesSubcontractors === false}
                onChange={() => setUsesSubcontractors(false)}
                className="h-4 w-4 text-supplier focus:ring-supplier"
              />
              <span className="text-sm text-ink">No</span>
            </label>
          </div>
        </div>

        <TextareaField
          label="Project examples / Relevant experience"
          name="projectExamples"
          defaultValue={(business?.projectExamples as string) ?? ""}
          placeholder="Briefly describe relevant projects or experience."
          rows={3}
        />

        {/* Contacts section */}
        <div className="border-t border-line pt-5 mt-5">
          <h3 className="text-sm font-semibold text-ink mb-3">Key Contacts</h3>

          <div className="rounded-[var(--radius-card)] bg-muted p-4 mb-4">
            <p className="text-xs text-ink-muted mb-1">Primary Contact</p>
            <p className="text-sm font-medium text-ink">
              {(profile.firstName as string) ?? ""} {(profile.lastName as string) ?? ""}
            </p>
            <p className="text-xs text-ink-muted">
              {(profile.email as string) ?? ""}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Quoting contact (name)"
              name="quotingContactName"
              defaultValue=""
              placeholder="If different from primary"
            />
            <FormField
              label="Quoting contact (email)"
              name="quotingContactEmail"
              type="email"
              defaultValue=""
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <FormField
              label="Accounts contact (name)"
              name="accountsContactName"
              defaultValue=""
              placeholder="If different from primary"
            />
            <FormField
              label="Accounts contact (email)"
              name="accountsContactEmail"
              type="email"
              defaultValue=""
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <FormField
              label="After-hours contact (name)"
              name="afterHoursContactName"
              defaultValue=""
              placeholder="Optional"
            />
            <FormField
              label="After-hours contact (phone)"
              name="afterHoursContactPhone"
              type="tel"
              defaultValue=""
            />
          </div>
        </div>

        <div className="flex justify-between pt-4">
          <button
            type="button"
            onClick={onBack}
            className="border border-line text-ink rounded-[var(--radius-card)] px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="bg-supplier text-white rounded-[var(--radius-card)] px-6 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save & Continue"}
          </button>
        </div>
      </form>
    </Card>
  );
}
