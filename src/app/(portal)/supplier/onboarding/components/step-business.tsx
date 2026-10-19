"use client";

import { useActionState, useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { FormField, TextareaField, SelectField } from "@/components/ui/form-field";
import { performAbnLookup, saveBusinessProfile } from "@/lib/actions/contractor-onboarding";

const BUSINESS_STRUCTURES = [
  { value: "", label: "Select structure..." },
  { value: "SOLE_TRADER", label: "Sole Trader" },
  { value: "PARTNERSHIP", label: "Partnership" },
  { value: "COMPANY", label: "Company" },
  { value: "TRUST", label: "Trust" },
  { value: "OTHER", label: "Other" },
];

interface StepBusinessProps {
  business: Record<string, unknown> | null;
  abnLookups: Record<string, unknown>[];
  onNext: () => void;
  onBack: () => void;
}

export function StepBusiness({ business, abnLookups, onNext, onBack }: StepBusinessProps) {
  const latestLookup = abnLookups.length > 0 ? abnLookups[0] : null;
  const [abnValue, setAbnValue] = useState((business?.abn as string) ?? "");
  const [lookupResult, setLookupResult] = useState<Record<string, unknown> | null>(latestLookup);

  const [lookupState, lookupAction, isLookingUp] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      if (business?.id) {
        formData.set("contractorId", business.id as string);
      }
      const result = await performAbnLookup({ error: null }, formData);
      if (result.success) {
        // Refresh the page to show updated lookup data
        setLookupResult({
          entityName: formData.get("abn") as string,
          abnStatus: "Checking...",
        });
      }
      return result;
    },
    { error: null },
  );

  const [saveState, saveAction, isSaving] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      const result = await saveBusinessProfile({ error: null }, formData);
      if (result.success) {
        onNext();
      }
      return result;
    },
    { error: null },
  );

  return (
    <div className="space-y-6">
      {/* ABN Lookup Section */}
      <Card>
        <CardHeader
          title="Business & ABN"
          description="Look up your Australian Business Number to verify your business identity."
        />

        <form action={lookupAction} className="space-y-4">
          {lookupState.error && (
            <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-red-700">{lookupState.error}</p>
            </div>
          )}

          <div className="flex gap-3 items-end">
            <FormField
              label="ABN"
              name="abn"
              required
              value={abnValue}
              onChange={(e) => setAbnValue(e.target.value)}
              placeholder="XX XXX XXX XXX"
              className="flex-1"
            />
            <button
              type="submit"
              disabled={isLookingUp || !abnValue.trim()}
              className="bg-supplier text-white rounded-[var(--radius-card)] px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 mb-0"
              style={{ marginBottom: 0 }}
            >
              {isLookingUp ? "Looking up..." : "Look Up ABN"}
            </button>
          </div>
          {business?.id ? (
            <input type="hidden" name="contractorId" value={business.id as string} />
          ) : null}
        </form>

        {/* ABN Lookup Results */}
        {lookupResult && (
          <div className="mt-4 rounded-[var(--radius-card)] bg-muted p-4 space-y-2">
            <h3 className="text-sm font-semibold text-ink">ABN Lookup Result</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {lookupResult.entityName ? (
                <>
                  <dt className="text-ink-muted">Entity Name</dt>
                  <dd className="text-ink font-medium">{lookupResult.entityName as string}</dd>
                </>
              ) : null}
              {lookupResult.entityType ? (
                <>
                  <dt className="text-ink-muted">Entity Type</dt>
                  <dd className="text-ink">{lookupResult.entityType as string}</dd>
                </>
              ) : null}
              {lookupResult.abnStatus ? (
                <>
                  <dt className="text-ink-muted">ABN Status</dt>
                  <dd className="text-ink">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        lookupResult.abnStatus === "Active"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {lookupResult.abnStatus as string}
                    </span>
                  </dd>
                </>
              ) : null}
              {lookupResult.gstStatus ? (
                <>
                  <dt className="text-ink-muted">GST Status</dt>
                  <dd className="text-ink">{lookupResult.gstStatus as string}</dd>
                </>
              ) : null}
              {lookupResult.locationState ? (
                <>
                  <dt className="text-ink-muted">Location</dt>
                  <dd className="text-ink">
                    {lookupResult.locationState as string}
                    {lookupResult.locationPostcode ? ` ${lookupResult.locationPostcode as string}` : null}
                  </dd>
                </>
              ) : null}
              {Array.isArray(lookupResult.businessNames) && (lookupResult.businessNames as string[]).length > 0 && (
                <>
                  <dt className="text-ink-muted">Business Names</dt>
                  <dd className="text-ink">{(lookupResult.businessNames as string[]).join(", ")}</dd>
                </>
              )}
            </dl>
          </div>
        )}

        <p className="mt-4 text-xs text-ink-muted leading-relaxed">
          ABN Lookup confirms the public business information returned at the time of checking. It does not verify your personal authority, trade licences, insurance or bank ownership.
        </p>
      </Card>

      {/* Business Details Form */}
      <Card>
        <CardHeader
          title="Business Details"
          description="Enter your business contact and registration information."
        />

        <form action={saveAction} className="space-y-4">
          {saveState.error && (
            <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-red-700">{saveState.error}</p>
            </div>
          )}

          {business?.id ? (
            <input type="hidden" name="contractorId" value={business.id as string} />
          ) : null}

          <FormField
            label="Legal entity name"
            name="companyName"
            required
            defaultValue={(lookupResult?.entityName as string) ?? (business?.companyName as string) ?? ""}
            helpText="As returned from the ABN register"
          />

          <FormField
            label="Trading name"
            name="tradingName"
            defaultValue={(business?.tradingName as string) ?? ""}
            placeholder="If different from legal name"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="ABN"
              name="abn"
              required
              defaultValue={abnValue || ((business?.abn as string) ?? "")}
              helpText="Verified via ABN Lookup"
            />
            <FormField
              label="ACN"
              name="acn"
              defaultValue={(business?.acn as string) ?? ""}
              placeholder="Where applicable"
            />
          </div>

          <SelectField
            label="Business structure"
            name="businessStructure"
            required
            defaultValue={(business?.businessStructure as string) ?? ""}
            options={BUSINESS_STRUCTURES}
          />

          <FormField
            label="Business address"
            name="address"
            required
            defaultValue={(business?.address as string) ?? ""}
          />

          <FormField
            label="Postal address"
            name="postalAddress"
            defaultValue={(business?.postalAddress as string) ?? ""}
            placeholder="Same as business address if applicable"
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField
              label="Suburb"
              name="suburb"
              defaultValue={(business?.suburb as string) ?? ""}
            />
            <SelectField
              label="State"
              name="state"
              defaultValue={(business?.state as string) ?? "VIC"}
              options={[
                { value: "NSW", label: "NSW" },
                { value: "VIC", label: "VIC" },
                { value: "QLD", label: "QLD" },
                { value: "SA", label: "SA" },
                { value: "WA", label: "WA" },
                { value: "TAS", label: "TAS" },
                { value: "NT", label: "NT" },
                { value: "ACT", label: "ACT" },
              ]}
            />
            <FormField
              label="Postcode"
              name="postcode"
              defaultValue={(business?.postcode as string) ?? ""}
              placeholder="e.g. 3000"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Main phone"
              name="phone"
              type="tel"
              required
              defaultValue={(business?.phone as string) ?? ""}
            />
            <FormField
              label="Business email"
              name="businessEmail"
              type="email"
              required
              defaultValue={(business?.email as string) ?? ""}
            />
          </div>

          <FormField
            label="Website"
            name="website"
            defaultValue={(business?.website as string) ?? ""}
            placeholder="https://"
          />

          <TextareaField
            label="Business description"
            name="businessDescription"
            defaultValue={(business?.businessDescription as string) ?? ""}
            placeholder="A brief description of your business, services and experience."
            rows={4}
          />

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
              disabled={isSaving}
              className="bg-supplier text-white rounded-[var(--radius-card)] px-6 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save & Continue"}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
