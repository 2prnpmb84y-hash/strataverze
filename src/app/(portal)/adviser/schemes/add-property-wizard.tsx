"use client";

import { useState, useActionState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  FormField,
  SelectField,
  CheckboxField,
} from "@/components/ui/form-field";
import { Card } from "@/components/ui/card";
import { createSchemeAction, type SchemeFormState } from "./actions";
import { StrataRollUpload } from "./strata-roll-upload";
import type { ParsedStrataRoll } from "@/lib/parse-strata-roll";

const STEPS = [
  { id: "upload", label: "Upload Strata Roll" },
  { id: "details", label: "Property Details" },
  { id: "address", label: "Address & Settings" },
  { id: "review", label: "Review & Create" },
] as const;

const STATES = [
  { value: "VIC", label: "Victoria" },
  { value: "NSW", label: "New South Wales" },
  { value: "QLD", label: "Queensland" },
  { value: "SA", label: "South Australia" },
  { value: "WA", label: "Western Australia" },
  { value: "TAS", label: "Tasmania" },
  { value: "NT", label: "Northern Territory" },
  { value: "ACT", label: "Australian Capital Territory" },
];

const BUILDING_TYPES = [
  { value: "", label: "Select type..." },
  { value: "STRATA", label: "Strata" },
  { value: "COMMUNITY", label: "Community" },
  { value: "COMPANY_TITLE", label: "Company Title" },
  { value: "STRATUM", label: "Stratum" },
];

const BUILDING_SUB_TYPES = [
  { value: "", label: "Select sub-type..." },
  { value: "Residential", label: "Residential" },
  { value: "Commercial", label: "Commercial" },
  { value: "Mixed Use", label: "Mixed Use" },
  { value: "Industrial", label: "Industrial" },
  { value: "Retail", label: "Retail" },
];

const BUILDING_CLASSES = [
  { value: "", label: "Select class..." },
  { value: "1", label: "Class 1 — Detached houses" },
  { value: "2", label: "Class 2 — Apartments / units" },
  { value: "3", label: "Class 3 — Residential (other)" },
  { value: "5", label: "Class 5 — Office" },
  { value: "6", label: "Class 6 — Retail / shops" },
  { value: "7", label: "Class 7 — Storage / car parks" },
  { value: "8", label: "Class 8 — Laboratory / production" },
  { value: "9", label: "Class 9 — Public building" },
];

const PAYMENT_PLANS = [
  { value: "", label: "Select plan..." },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "ANNUALLY", label: "Annually" },
  { value: "HALF_YEARLY", label: "Half-Yearly" },
];

type StepId = (typeof STEPS)[number]["id"];

type Defaults = {
  name?: string;
  planNumber?: string;
  address?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  abnNumber?: string;
  totalLots?: string;
  totalEntitlement?: string;
  financialYearEnd?: string;
  buildingType?: string;
};

export function AddPropertyWizard({ simplified = false }: { simplified?: boolean }) {
  const [currentStep, setCurrentStep] = useState<StepId>("upload");
  const [defaults, setDefaults] = useState<Defaults>({});
  const [parsedLots, setParsedLots] = useState<ParsedStrataRoll["lots"]>([]);
  const [formKey, setFormKey] = useState(0);
  const [state, formAction, isPending] = useActionState<
    SchemeFormState,
    FormData
  >(createSchemeAction, {});

  const currentIndex = STEPS.findIndex((s) => s.id === currentStep);

  function goTo(step: StepId) {
    setCurrentStep(step);
  }

  function handleNext() {
    const next = STEPS[currentIndex + 1];
    if (next) setCurrentStep(next.id);
  }

  function handleBack() {
    const prev = STEPS[currentIndex - 1];
    if (prev) setCurrentStep(prev.id);
  }

  const handleParsed = useCallback((data: ParsedStrataRoll) => {
    const s = data.scheme;
    setDefaults({
      name: s.name ?? undefined,
      planNumber: s.planNumber ?? undefined,
      address: s.address ?? undefined,
      suburb: s.suburb ?? undefined,
      state: s.state ?? undefined,
      postcode: s.postcode ?? undefined,
      abnNumber: s.abnNumber ?? undefined,
      totalLots: s.totalLots != null ? String(s.totalLots) : undefined,
      totalEntitlement:
        s.totalEntitlement != null ? String(s.totalEntitlement) : undefined,
      financialYearEnd: s.financialYearEnd ?? undefined,
      buildingType: s.buildingType ?? undefined,
    });
    setParsedLots(data.lots);
    setFormKey((k) => k + 1);
    setCurrentStep("details");
  }, []);

  const handleSkip = useCallback(() => {
    setCurrentStep("details");
  }, []);

  return (
    <div>
      {/* Step indicator */}
      <nav className="mb-8">
        <ol className="flex items-center gap-2">
          {STEPS.map((step, i) => {
            const isActive = step.id === currentStep;
            const isComplete = i < currentIndex;
            return (
              <li key={step.id} className="flex items-center gap-2 flex-1">
                <button
                  type="button"
                  onClick={() => goTo(step.id)}
                  className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "text-turquoise"
                      : isComplete
                        ? "text-ink"
                        : "text-ink-muted"
                  }`}
                >
                  <span
                    className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors ${
                      isActive
                        ? "bg-primary-400 text-white"
                        : isComplete
                          ? "bg-primary-100 text-turquoise"
                          : "bg-muted text-ink-muted"
                    }`}
                  >
                    {isComplete ? (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path
                          d="M3 7l3 3 5-6"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span className="hidden sm:inline">{step.label}</span>
                </button>
                {i < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-px ${
                      isComplete ? "bg-primary-300" : "bg-line"
                    }`}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Step 1: Upload Strata Roll (outside the form since it has its own upload logic) */}
      <div className={currentStep === "upload" ? "" : "hidden"}>
        <StrataRollUpload onParsed={handleParsed} onSkip={handleSkip} />
      </div>

      {/* Form wraps steps 2-4 so hidden fields persist across steps */}
      <form key={formKey} action={formAction}>
        {state.error && currentStep !== "upload" && (
          <div className="mb-6 rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {state.error}
          </div>
        )}

        {/* Step 2: Property Details */}
        <div className={currentStep === "details" ? "" : "hidden"}>
          <Card>
            <h2 className="font-heading font-semibold text-ink mb-1">
              Property Details
            </h2>
            <p className="text-sm text-ink-muted mb-6">
              Enter the core details of the Owners Corporation.
              {parsedLots.length > 0 && (
                <span className="block mt-1 text-turquoise font-medium">
                  Fields have been pre-filled from the strata roll ({parsedLots.length} lots parsed).
                </span>
              )}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
              <FormField
                label="Scheme Name"
                name="name"
                required
                placeholder="e.g. Harbour View Towers OC"
                defaultValue={defaults.name}
                error={state.fieldErrors?.name}
                className="sm:col-span-2"
              />

              <FormField
                label="Plan Number"
                name="planNumber"
                required
                placeholder="e.g. PS 123456"
                defaultValue={defaults.planNumber}
                error={state.fieldErrors?.planNumber}
              />

              <FormField
                label="Folio"
                name="folio"
                placeholder="e.g. 12345/678"
                helpText="Land title folio reference"
              />

              <FormField
                label="ABN"
                name="abnNumber"
                placeholder="e.g. 12 345 678 901"
                helpText="Optional"
                defaultValue={defaults.abnNumber}
              />

              <SelectField
                label="Building Type"
                name="buildingType"
                options={BUILDING_TYPES}
                defaultValue={defaults.buildingType}
              />

              <SelectField
                label="Building Sub-Type"
                name="buildingSubType"
                options={BUILDING_SUB_TYPES}
              />

              <SelectField
                label="Building Class"
                name="buildingClass"
                options={BUILDING_CLASSES}
              />

              <FormField
                label="Total Lots"
                name="totalLots"
                type="number"
                required
                placeholder="e.g. 24"
                defaultValue={defaults.totalLots}
                error={state.fieldErrors?.totalLots}
              />

              <FormField
                label="Total Entitlement"
                name="totalEntitlement"
                type="number"
                required
                placeholder="e.g. 1000"
                helpText="Sum of all lot entitlements"
                defaultValue={defaults.totalEntitlement}
                error={state.fieldErrors?.totalEntitlement}
              />
            </div>

            <div className="flex items-center justify-between mt-8 pt-6 border-t border-line">
              <Button type="button" variant="secondary" onClick={handleBack}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Back
              </Button>
              <Button type="button" onClick={handleNext}>
                Next: Address &amp; Settings
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Button>
            </div>
          </Card>
        </div>

        {/* Step 3: Address & Settings */}
        <div className={currentStep === "address" ? "" : "hidden"}>
          <Card>
            <h2 className="font-heading font-semibold text-ink mb-1">
              Address &amp; Settings
            </h2>
            <p className="text-sm text-ink-muted mb-6">
              Set the property address, financial settings, and preferences.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
              <FormField
                label="Street Address"
                name="address"
                required
                placeholder="e.g. 42 Collins Street"
                defaultValue={defaults.address}
                error={state.fieldErrors?.address}
                className="sm:col-span-2"
              />

              <FormField
                label="Suburb"
                name="suburb"
                required
                placeholder="e.g. Melbourne"
                defaultValue={defaults.suburb}
                error={state.fieldErrors?.suburb}
              />

              <div className="grid grid-cols-2 gap-4">
                <SelectField
                  label="State"
                  name="state"
                  required
                  defaultValue={defaults.state || "VIC"}
                  options={STATES}
                  error={state.fieldErrors?.state}
                />
                <FormField
                  label="Postcode"
                  name="postcode"
                  required
                  placeholder="3000"
                  defaultValue={defaults.postcode}
                  error={state.fieldErrors?.postcode}
                />
              </div>

              <FormField
                label="Financial Year End"
                name="financialYearEnd"
                defaultValue={defaults.financialYearEnd || "06-30"}
                placeholder="MM-DD"
                helpText="Month-day format, e.g. 06-30 for 30 June"
              />

              <SelectField
                label="Payment Plan"
                name="paymentPlan"
                options={PAYMENT_PLANS}
                defaultValue=""
              />
            </div>

            {/* Settings toggles */}
            {!simplified && (
              <div className="mt-6 pt-6 border-t border-line">
                <h3 className="text-sm font-semibold text-ink mb-4">
                  Settings
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <CheckboxField
                    label="Active"
                    name="isActive"
                    defaultChecked={true}
                    helpText="Property is currently active"
                  />
                  <CheckboxField
                    label="All Inclusive Fees"
                    name="allInclusiveFees"
                    helpText="Include all fees in levy calculations"
                  />
                  <CheckboxField
                    label="Debt Collection"
                    name="debtCollection"
                    helpText="Enable automatic debt collection"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mt-8 pt-6 border-t border-line">
              <Button type="button" variant="secondary" onClick={handleBack}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Back
              </Button>
              <Button type="button" onClick={handleNext}>
                Next: Review
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Button>
            </div>
          </Card>
        </div>

        {/* Step 4: Review & Create */}
        <div className={currentStep === "review" ? "" : "hidden"}>
          <Card>
            <h2 className="font-heading font-semibold text-ink mb-1">
              Review &amp; Create
            </h2>
            <p className="text-sm text-ink-muted mb-6">
              Check the details below, then create the property.
            </p>

            <ReviewSummary simplified={simplified} parsedLots={parsedLots} />

            <div className="flex items-center justify-between mt-8 pt-6 border-t border-line">
              <Button type="button" variant="secondary" onClick={handleBack}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Back
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Creating..." : "Create Property"}
              </Button>
            </div>
          </Card>
        </div>
      </form>
    </div>
  );
}

/**
 * ReviewSummary reads sibling form fields via closest <form> to display
 * a live summary of the data entered across wizard steps.
 */
function ReviewSummary({
  simplified,
  parsedLots,
}: {
  simplified?: boolean;
  parsedLots: ParsedStrataRoll["lots"];
}) {
  const [, setTick] = useState(0);

  // Force a re-render when this step becomes visible so we pick up the latest values
  // We use a simple approach: read values from the form element in the DOM.
  function getFormValues() {
    if (typeof document === "undefined") return null;
    const form = document.querySelector("form");
    if (!form) return null;
    const fd = new FormData(form);
    return {
      name: (fd.get("name") as string) || "—",
      planNumber: (fd.get("planNumber") as string) || "—",
      folio: (fd.get("folio") as string) || "—",
      abnNumber: (fd.get("abnNumber") as string) || "—",
      buildingType: (fd.get("buildingType") as string) || "—",
      buildingSubType: (fd.get("buildingSubType") as string) || "—",
      buildingClass: (fd.get("buildingClass") as string) || "—",
      totalLots: (fd.get("totalLots") as string) || "—",
      totalEntitlement: (fd.get("totalEntitlement") as string) || "—",
      address: (fd.get("address") as string) || "—",
      suburb: (fd.get("suburb") as string) || "—",
      state: (fd.get("state") as string) || "—",
      postcode: (fd.get("postcode") as string) || "—",
      financialYearEnd: (fd.get("financialYearEnd") as string) || "—",
      paymentPlan: (fd.get("paymentPlan") as string) || "—",
      isActive: fd.get("isActive") !== "false",
      allInclusiveFees: fd.get("allInclusiveFees") === "true",
      debtCollection: fd.get("debtCollection") === "true",
    };
  }

  // Trigger re-read on mount of this step
  if (typeof window !== "undefined") {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useState(() => {
      const timer = setTimeout(() => setTick((t) => t + 1), 50);
      return () => clearTimeout(timer);
    });
  }

  const v = getFormValues();
  if (!v) return null;

  const sections = [
    {
      title: "Property Details",
      rows: [
        ["Scheme Name", v.name],
        ["Plan Number", v.planNumber],
        ["Folio", v.folio],
        ["ABN", v.abnNumber],
        ["Building Type", v.buildingType],
        ["Building Sub-Type", v.buildingSubType],
        ["Building Class", v.buildingClass],
        ["Total Lots", v.totalLots],
        ["Total Entitlement", v.totalEntitlement],
      ],
    },
    {
      title: "Address & Settings",
      rows: [
        ["Address", `${v.address}, ${v.suburb} ${v.state} ${v.postcode}`],
        ["Financial Year End", v.financialYearEnd],
        ["Payment Plan", v.paymentPlan],
        ...(simplified
          ? []
          : [
              ["Active", v.isActive ? "Yes" : "No"],
              ["All Inclusive Fees", v.allInclusiveFees ? "Yes" : "No"],
              ["Debt Collection", v.debtCollection ? "Yes" : "No"],
            ]),
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <div key={section.title}>
          <h3 className="text-sm font-semibold text-ink mb-3">
            {section.title}
          </h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            {section.rows.map(([label, value]) => (
              <div key={label} className="flex justify-between py-1.5 border-b border-line/50">
                <dt className="text-sm text-ink-muted">{label}</dt>
                <dd className="text-sm font-medium text-ink text-right">
                  {value || "—"}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}

      {/* Parsed lots summary */}
      {parsedLots.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink mb-3">
            Parsed Lots ({parsedLots.length})
          </h3>
          <div className="rounded-[var(--radius-card)] border border-line overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th scope="col" className="text-left px-3 py-2 font-medium text-ink-muted">Lot</th>
                  <th scope="col" className="text-left px-3 py-2 font-medium text-ink-muted">Unit</th>
                  <th scope="col" className="text-left px-3 py-2 font-medium text-ink-muted">Owner</th>
                  <th scope="col" className="text-right px-3 py-2 font-medium text-ink-muted">Entitlement</th>
                </tr>
              </thead>
              <tbody>
                {parsedLots.slice(0, 10).map((lot) => (
                  <tr key={lot.lotNumber} className="border-t border-line/50">
                    <td className="px-3 py-2 text-ink">{lot.lotNumber}</td>
                    <td className="px-3 py-2 text-ink">{lot.unitNumber ?? "—"}</td>
                    <td className="px-3 py-2 text-ink">{lot.ownerName ?? "—"}</td>
                    <td className="px-3 py-2 text-ink text-right tabular-nums">{lot.entitlement}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsedLots.length > 10 && (
              <div className="px-3 py-2 bg-muted/30 text-xs text-ink-muted border-t border-line/50">
                Showing 10 of {parsedLots.length} lots. All lots will be available after creation.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
