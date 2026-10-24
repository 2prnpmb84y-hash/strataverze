"use client";

import { useState, useActionState, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  FormField,
  SelectField,
  CheckboxField,
} from "@/components/ui/form-field";
import { Card } from "@/components/ui/card";
import { createSchemeAction, type OnboardingStep, type SchemeFormState } from "./actions";
import { StrataRollUpload } from "./strata-roll-upload";
import type { ParsedStrataRoll } from "@/lib/parse-strata-roll";
import {
  auDate,
  blankLotBalance,
  blankLots,
  checkLotBalances,
  checkLots,
  checkOpeningBalances,
  checkYearEnd,
  currentYearEnd,
  emptyOpeningBalances,
  formatMoney,
  type LotBalanceInput,
  type OnboardingLot,
  type OpeningBalancesInput,
} from "@/lib/onboarding/property-onboarding";
import { BalancesStep, LotBalancesStep, LotsStep, StepProblems } from "./onboarding-steps";

const STEPS = [
  { id: "upload", label: "Strata Roll" },
  { id: "details", label: "Property Details" },
  { id: "address", label: "Address & Settings" },
  { id: "lots", label: "Lots & Owners" },
  { id: "balances", label: "Opening Balances" },
  { id: "lotBalances", label: "Lot Balances" },
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

type ReviewValues = Record<string, string> & { isActive: string; allInclusiveFees: string; debtCollection: string };

const wholeNumber = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return /^\d+$/.test(s) ? Number(s) : NaN;
};

/**
 * `today` (YYYY-MM-DD, Sydney) comes from the server page, so the year-end
 * and takeover date checks use the same date there and here.
 */
export function AddPropertyWizard({ simplified = false, today }: { simplified?: boolean; today: string }) {
  const [currentStep, setCurrentStep] = useState<StepId>("upload");
  const [defaults, setDefaults] = useState<Defaults>({});
  const [fromRoll, setFromRoll] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  // Steps checked on the way forward; their problems are shown once tried.
  const [tried, setTried] = useState<Partial<Record<StepId, boolean>>>({});
  const [clientProblems, setClientProblems] = useState<string[]>([]);

  // Read from the details and address steps when moving on from them.
  const [totals, setTotals] = useState({ totalLots: NaN, totalEntitlement: NaN });
  const [yearEnd, setYearEnd] = useState("");

  const [lots, setLots] = useState<OnboardingLot[]>([]);
  const [balances, setBalances] = useState<OpeningBalancesInput>(() => emptyOpeningBalances());
  const [lotBalances, setLotBalances] = useState<LotBalanceInput[]>([]);
  const [review, setReview] = useState<ReviewValues | null>(null);

  const [state, formAction, isPending] = useActionState<SchemeFormState, FormData>(createSchemeAction, {});

  // A problem found by the server sends the wizard back to its step.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.step) {
      setCurrentStep(state.step);
      setTried((t) => ({ ...t, [state.step as OnboardingStep]: true }));
    }
  }

  const lotsCheck = useMemo(() => checkLots(lots, totals.totalLots, totals.totalEntitlement), [lots, totals]);
  const balancesCheck = useMemo(() => checkOpeningBalances(balances, yearEnd || null, today), [balances, yearEnd, today]);
  const lotBalancesCheck = useMemo(() => checkLotBalances(lotBalances, lotsCheck.lots, balancesCheck), [lotBalances, lotsCheck.lots, balancesCheck]);
  const ownerNames = useMemo(() => Object.fromEntries(lotsCheck.lots.map((l) => [l.lotNumber, l.ownerName ?? ""])), [lotsCheck.lots]);

  const currentIndex = STEPS.findIndex((s) => s.id === currentStep);

  function readForm(): FormData | null {
    return formRef.current ? new FormData(formRef.current) : null;
  }

  /** Check the step being left. Returns the problems (none means go on). */
  function problemsLeaving(step: StepId): string[] {
    const fd = readForm();
    switch (step) {
      case "details": {
        if (!fd) return [];
        const p: string[] = [];
        if (!String(fd.get("name") ?? "").trim()) p.push("Enter the scheme name.");
        if (!String(fd.get("planNumber") ?? "").trim()) p.push("Enter the plan number.");
        const tl = wholeNumber(fd.get("totalLots"));
        const te = wholeNumber(fd.get("totalEntitlement"));
        if (!(tl >= 1)) p.push("Enter the total number of lots (a whole number).");
        if (!(te >= 1)) p.push("Enter the total unit entitlement (a whole number).");
        setTotals({ totalLots: tl, totalEntitlement: te });
        return p;
      }
      case "address": {
        if (!fd) return [];
        const p: string[] = [];
        if (!String(fd.get("address") ?? "").trim()) p.push("Enter the street address.");
        if (!String(fd.get("suburb") ?? "").trim()) p.push("Enter the suburb.");
        if (!/^\d{4}$/.test(String(fd.get("postcode") ?? "").trim())) p.push("Enter a 4-digit postcode.");
        const ye = checkYearEnd(String(fd.get("financialYearEnd") ?? ""), today);
        if (!ye.ok) p.push(ye.message);
        setYearEnd(ye.ok ? ye.date : "");
        return p;
      }
      case "lots":
        return lotsCheck.ok ? [] : ["Fix the lots below before going on."];
      case "balances":
        return balancesCheck.ok ? [] : ["Fix the opening balances below before going on."];
      case "lotBalances":
        return lotBalancesCheck.ok ? [] : ["Fix the lot balances below before going on."];
      default:
        return [];
    }
  }

  function enter(step: StepId) {
    if (step === "lots" && lots.length === 0 && totals.totalLots >= 1) setLots(blankLots(totals.totalLots));
    if (step === "lotBalances") {
      // One row per lot, keeping anything already typed for a lot.
      setLotBalances((prev) => lotsCheck.lots.map((l) => prev.find((p) => p.lotNumber === l.lotNumber) ?? blankLotBalance(l.lotNumber)));
    }
    if (step === "review") {
      const fd = readForm();
      if (fd) {
        const v: Record<string, string> = {};
        for (const [k, val] of fd.entries()) if (typeof val === "string" && !k.endsWith("Json")) v[k] = val;
        setReview({ ...v, isActive: String(fd.get("isActive") !== "false"), allInclusiveFees: String(fd.get("allInclusiveFees") === "true"), debtCollection: String(fd.get("debtCollection") === "true") } as ReviewValues);
      }
    }
    setClientProblems([]);
    setCurrentStep(step);
  }

  function handleNext() {
    const problems = problemsLeaving(currentStep);
    setTried((t) => ({ ...t, [currentStep]: true }));
    if (problems.length) {
      setClientProblems(problems);
      return;
    }
    const next = STEPS[currentIndex + 1];
    if (next) enter(next.id);
  }

  function handleBack() {
    const prev = STEPS[currentIndex - 1];
    if (prev) enter(prev.id);
  }

  function handleParsed(data: ParsedStrataRoll) {
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
      totalEntitlement: s.totalEntitlement != null ? String(s.totalEntitlement) : undefined,
      financialYearEnd: s.financialYearEnd ?? undefined,
      buildingType: s.buildingType ?? undefined,
    });
    setLots(
      data.lots.map((l) => ({
        lotNumber: l.lotNumber,
        unitNumber: l.unitNumber ?? "",
        entitlement: String(l.entitlement),
        ownerName: l.ownerName ?? "",
      })),
    );
    setFromRoll(data.lots.length > 0);
    setFormKey((k) => k + 1);
    setClientProblems([]);
    setCurrentStep("details");
  }

  function handleSkip() {
    setCurrentStep("details");
  }

  const serverProblems = state.step === currentStep && state.stepErrors ? state.stepErrors : [];
  const problems = clientProblems.length ? clientProblems : serverProblems;

  const nav = (nextLabel?: string, submit = false) => (
    <div className="flex items-center justify-between mt-8 pt-6 border-t border-line">
      <Button type="button" variant="secondary" onClick={handleBack}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back
      </Button>
      {submit ? (
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating..." : "Create Property"}
        </Button>
      ) : (
        <Button type="button" onClick={handleNext}>
          {nextLabel}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Button>
      )}
    </div>
  );

  return (
    <div>
      {/* Step indicator: earlier steps can be revisited; later ones are reached with Next. */}
      <nav className="mb-8" aria-label="Add property steps">
        <ol className="flex items-center gap-2">
          {STEPS.map((step, i) => {
            const isActive = step.id === currentStep;
            const isComplete = i < currentIndex;
            return (
              <li key={step.id} className="flex items-center gap-2 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => isComplete && enter(step.id)}
                  disabled={!isComplete && !isActive}
                  aria-current={isActive ? "step" : undefined}
                  className={`flex items-center gap-2 text-sm font-medium transition-colors min-w-0 ${
                    isActive ? "text-turquoise" : isComplete ? "text-ink" : "text-ink-muted"
                  }`}
                >
                  <span
                    className={`flex shrink-0 items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors ${
                      isActive ? "bg-turquoise text-white" : isComplete ? "bg-mint-soft text-turquoise" : "bg-muted text-ink-muted"
                    }`}
                  >
                    {isComplete ? (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                        <path d="M3 7l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span className={`truncate ${isActive ? "hidden md:inline" : "hidden lg:inline"}`}>{step.label}</span>
                </button>
                {i < STEPS.length - 1 && <div className={`flex-1 h-px min-w-2 ${isComplete ? "bg-turquoise/60" : "bg-line"}`} />}
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-sm font-medium text-ink md:hidden">
          Step {currentIndex + 1} of {STEPS.length}: {STEPS[currentIndex].label}
        </p>
      </nav>

      {/* Step 1: Upload Strata Roll (outside the form since it has its own upload logic) */}
      <div className={currentStep === "upload" ? "" : "hidden"}>
        <StrataRollUpload onParsed={handleParsed} onSkip={handleSkip} />
      </div>

      {/* The form wraps the later steps so every field is submitted together. */}
      <form key={formKey} ref={formRef} action={formAction}>
        <input type="hidden" name="lotsJson" value={JSON.stringify(lots)} />
        <input type="hidden" name="balancesJson" value={JSON.stringify(balances)} />
        <input type="hidden" name="lotBalancesJson" value={JSON.stringify(lotBalances)} />

        {state.error && currentStep !== "upload" && (
          <div role="alert" className="mb-6 rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {state.error}
          </div>
        )}

        {/* Step 2: Property Details */}
        <div className={currentStep === "details" ? "" : "hidden"}>
          <Card>
            <h2 className="font-heading font-semibold text-ink mb-1">Property Details</h2>
            <p className="text-sm text-ink-muted mb-6">
              Enter the core details of the Owners Corporation.
              {fromRoll && (
                <span className="block mt-1 text-turquoise font-medium">Fields have been pre-filled from the strata roll ({lots.length} lots read).</span>
              )}
            </p>
            {currentStep === "details" && <StepProblems problems={problems} />}

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
                placeholder="e.g. SP 12345"
                defaultValue={defaults.planNumber}
                error={state.fieldErrors?.planNumber}
              />
              <FormField label="Folio" name="folio" placeholder="e.g. 12345/678" helpText="Land title folio reference" />
              <FormField label="ABN" name="abnNumber" placeholder="e.g. 12 345 678 901" helpText="Optional" defaultValue={defaults.abnNumber} />
              <SelectField label="Building Type" name="buildingType" options={BUILDING_TYPES} defaultValue={defaults.buildingType} />
              <SelectField label="Building Sub-Type" name="buildingSubType" options={BUILDING_SUB_TYPES} />
              <SelectField label="Building Class" name="buildingClass" options={BUILDING_CLASSES} />
              <FormField
                label="Total Lots"
                name="totalLots"
                type="number"
                required
                placeholder="e.g. 24"
                helpText="The lots on the strata plan. The Lots step must have this many."
                defaultValue={defaults.totalLots}
                error={state.fieldErrors?.totalLots}
              />
              <FormField
                label="Total Unit Entitlement"
                name="totalEntitlement"
                type="number"
                required
                placeholder="e.g. 1000"
                helpText="The aggregate unit entitlement. The lots' unit entitlements must add up to it."
                defaultValue={defaults.totalEntitlement}
                error={state.fieldErrors?.totalEntitlement}
              />
            </div>
            {nav("Next: Address & Settings")}
          </Card>
        </div>

        {/* Step 3: Address & Settings */}
        <div className={currentStep === "address" ? "" : "hidden"}>
          <Card>
            <h2 className="font-heading font-semibold text-ink mb-1">Address &amp; Settings</h2>
            <p className="text-sm text-ink-muted mb-6">Set the property address, financial settings, and preferences.</p>
            {currentStep === "address" && <StepProblems problems={problems} />}

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
              <FormField label="Suburb" name="suburb" required placeholder="e.g. Melbourne" defaultValue={defaults.suburb} error={state.fieldErrors?.suburb} />
              <div className="grid grid-cols-2 gap-4">
                <SelectField label="State" name="state" required defaultValue={defaults.state || "NSW"} options={STATES} error={state.fieldErrors?.state} />
                <FormField label="Postcode" name="postcode" required placeholder="2000" defaultValue={defaults.postcode} error={state.fieldErrors?.postcode} />
              </div>
              <FormField
                label="Financial Year End"
                name="financialYearEnd"
                type="date"
                required
                defaultValue={currentYearEnd(defaults.financialYearEnd ?? "06-30", today)}
                helpText="The last day of the building's current financial year (day, month and year)."
                error={state.fieldErrors?.financialYearEnd}
              />
              <SelectField label="Payment Plan" name="paymentPlan" options={PAYMENT_PLANS} defaultValue="" />
            </div>

            {!simplified && (
              <div className="mt-6 pt-6 border-t border-line">
                <h3 className="text-sm font-semibold text-ink mb-4">Settings</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <CheckboxField label="Active" name="isActive" defaultChecked={true} helpText="Property is currently active" />
                  <CheckboxField label="All Inclusive Fees" name="allInclusiveFees" helpText="Include all fees in levy calculations" />
                  <CheckboxField label="Debt Collection" name="debtCollection" helpText="Enable automatic debt collection" />
                </div>
              </div>
            )}
            {nav("Next: Lots & Owners")}
          </Card>
        </div>

        {/* Step 4: Lots & Owners */}
        <div className={currentStep === "lots" ? "" : "hidden"}>
          <Card>
            {currentStep === "lots" && <StepProblems problems={problems} />}
            <LotsStep
              lots={lots}
              onChange={setLots}
              totalLots={totals.totalLots}
              totalEntitlement={totals.totalEntitlement}
              check={lotsCheck}
              showErrors={!!tried.lots}
              fromRoll={fromRoll}
            />
            {nav("Next: Opening Balances")}
          </Card>
        </div>

        {/* Step 5: Opening Balances */}
        <div className={currentStep === "balances" ? "" : "hidden"}>
          <Card>
            {currentStep === "balances" && <StepProblems problems={problems} />}
            <BalancesStep value={balances} onChange={setBalances} check={balancesCheck} yearEnd={yearEnd} showErrors={!!tried.balances} />
            {nav("Next: Lot Balances")}
          </Card>
        </div>

        {/* Step 6: Lot Opening Balances */}
        <div className={currentStep === "lotBalances" ? "" : "hidden"}>
          <Card>
            {currentStep === "lotBalances" && <StepProblems problems={problems} />}
            <LotBalancesStep
              rows={lotBalances}
              ownerNames={ownerNames}
              onChange={setLotBalances}
              check={lotBalancesCheck}
              sheet={balancesCheck}
              showErrors={!!tried.lotBalances}
            />
            {nav("Next: Review")}
          </Card>
        </div>

        {/* Step 7: Review & Create */}
        <div className={currentStep === "review" ? "" : "hidden"}>
          <Card>
            <h2 className="font-heading font-semibold text-ink mb-1">Review &amp; Create</h2>
            <p className="text-sm text-ink-muted mb-6">Check the details below, then create the property.</p>
            {review && (
              <ReviewSummary
                simplified={simplified}
                v={review}
                lots={lotsCheck.lots}
                entitlementSum={lotsCheck.entitlementSum}
                balances={balancesCheck}
                lotTotals={lotBalancesCheck.totals}
              />
            )}
            {nav(undefined, true)}
          </Card>
        </div>
      </form>
    </div>
  );
}

function ReviewSummary({
  simplified,
  v,
  lots,
  entitlementSum,
  balances,
  lotTotals,
}: {
  simplified?: boolean;
  v: ReviewValues;
  lots: ReturnType<typeof checkLots>["lots"];
  entitlementSum: number;
  balances: ReturnType<typeof checkOpeningBalances>;
  lotTotals: ReturnType<typeof checkLotBalances>["totals"];
}) {
  const val = (k: string) => (v[k] ?? "").trim() || "—";
  const anyBalance =
    balances.total !== 0 ||
    [balances.admin, balances.capitalWorks].some((f) => Object.values(f).some((c) => c !== 0)) ||
    lotTotals.unallocated !== 0;
  const sections: { title: string; rows: [string, string][] }[] = [
    {
      title: "Property Details",
      rows: [
        ["Scheme Name", val("name")],
        ["Plan Number", val("planNumber")],
        ["Folio", val("folio")],
        ["ABN", val("abnNumber")],
        ["Building Type", val("buildingType")],
        ["Building Sub-Type", val("buildingSubType")],
        ["Building Class", val("buildingClass")],
        ["Total Lots", val("totalLots")],
        ["Total Unit Entitlement", val("totalEntitlement")],
      ],
    },
    {
      title: "Address & Settings",
      rows: [
        ["Address", `${val("address")}, ${val("suburb")} ${val("state")} ${val("postcode")}`],
        ["Financial Year End", v.financialYearEnd ? auDate(v.financialYearEnd) : "—"],
        ["Payment Plan", val("paymentPlan")],
        ...(simplified
          ? []
          : ([
              ["Active", v.isActive === "true" ? "Yes" : "No"],
              ["All Inclusive Fees", v.allInclusiveFees === "true" ? "Yes" : "No"],
              ["Debt Collection", v.debtCollection === "true" ? "Yes" : "No"],
            ] as [string, string][])),
      ],
    },
    {
      title: "Opening Balances",
      rows: [
        ["Takeover Date", balances.takeoverDate ? auDate(balances.takeoverDate) : "—"],
        ["Total", formatMoney(balances.total)],
        ["Administrative Fund", formatMoney(balances.admin.fundBalance)],
        ["Capital Works Fund", formatMoney(balances.capitalWorks.fundBalance)],
        ["Lot Arrears (Admin / Capital Works)", `${formatMoney(lotTotals.admin)} / ${formatMoney(lotTotals.capitalWorks)}`],
        ["Lot Interest", formatMoney(lotTotals.interest)],
        ["Lot Unallocated Credits", formatMoney(lotTotals.unallocated)],
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <div key={section.title}>
          <h3 className="text-sm font-semibold text-ink mb-3">{section.title}</h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            {section.rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 py-1.5 border-b border-line/50">
                <dt className="text-sm text-ink-muted">{label}</dt>
                <dd className="text-sm font-medium text-ink text-right tabular-nums">{value || "—"}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}

      <div>
        <h3 className="text-sm font-semibold text-ink mb-3">
          Lots ({lots.length}, unit entitlement {entitlementSum.toLocaleString("en-AU")})
        </h3>
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th scope="col" className="text-left px-3 py-2 font-medium text-ink-muted">Lot</th>
                <th scope="col" className="text-left px-3 py-2 font-medium text-ink-muted">Unit No.</th>
                <th scope="col" className="text-left px-3 py-2 font-medium text-ink-muted">Owner (as on the strata roll)</th>
                <th scope="col" className="text-right px-3 py-2 font-medium text-ink-muted">Unit Entitlement</th>
              </tr>
            </thead>
            <tbody>
              {lots.slice(0, 10).map((lot) => (
                <tr key={lot.lotNumber} className="border-t border-line/50">
                  <td className="px-3 py-2 text-ink">{lot.lotNumber}</td>
                  <td className="px-3 py-2 text-ink">{lot.unitNumber ?? "—"}</td>
                  <td className="px-3 py-2 text-ink">{lot.ownerName ?? "—"}</td>
                  <td className="px-3 py-2 text-ink text-right tabular-nums">{lot.entitlement}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {lots.length > 10 && (
            <div className="px-3 py-2 bg-muted/30 text-xs text-ink-muted border-t border-line/50">
              Showing 10 of {lots.length} lots. All are created with the property.
            </div>
          )}
        </div>
      </div>

      <p className="rounded-[var(--radius-card)] bg-mint-soft/40 border border-line px-4 py-3 text-sm text-ink">
        {anyBalance
          ? "Creating the property also prepares a draft cutover with these opening balances. The Adviser checks it, signs it off and posts it in Finance. Nothing is posted to the ledger until then."
          : "No opening balances were entered, so no cutover is prepared."}
      </p>
    </div>
  );
}
